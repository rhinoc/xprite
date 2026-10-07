import { UINT16_MAX, UINT8_MAX } from "$/base/numeric-constants";
import { cloneStoredPixelBuffer } from "$/document/pixel-storage";
import {
  AsepriteTagDirection,
  type AsepriteTag,
  type AsepriteUserData,
} from "$/import-export/aseprite/model";
import {
  AnimationPreviewPlayer,
  defaultOnionSkinSettings,
  defaultPlaybackSettings,
  normalizeOnionSkin,
  normalizePlayback,
  reverseAnimationFrames,
} from "$/timeline/animation-options";
import { setTimelineCelProperties, type CelProperties } from "$/timeline/cel-properties";
import {
  duplicateLayers,
  flattenLayers,
  groupLayers,
  insertLayer,
  mergeDown,
  moveLayerTree,
  removeLayers,
} from "$/timeline/layer-operations";
import {
  duplicateTimelineCels,
  linkTimelineCels,
  unlinkTimelineCels,
} from "$/timeline/operations/frame-cels";
import { dropTimelineLayers as dropTimelineLayersOperation } from "$/timeline/operations/layer-drop";
import { transferTimelineRange as transferTimelineRangeOperation } from "$/timeline/operations/timeline-range";
import {
  timelineTagIndexAtFrame,
  timelineTags,
  validTimelineRange,
  withTimelineTags,
} from "$/timeline/tags";
import {
  LAYER_COLLAPSED,
  LAYER_CONTINUOUS,
  LAYER_EDITABLE,
  LAYER_VISIBLE,
  adjustTimelineTags,
  assertSupportedAnimationTags,
  defaultLayerName,
  isBackgroundLayer,
  layerEditable,
  MAX_TIMELINE_FRAMES,
} from "$/timeline/timeline";
import type {
  OnionSkinSettings,
  PlaybackSettings,
  SpriteTimeline,
  TimelineRange,
  TimelineLayerDropPosition,
} from "$/timeline/types";

export interface TimelineControllerPort {
  getTimeline(): SpriteTimeline | null;
  getPlaybackOptions(): Partial<PlaybackSettings>;
  setPlaybackOptions(options: PlaybackSettings): void;
  getOnionSkinOptions(): Partial<OnionSkinSettings>;
  setOnionSkinOptions(options: OnionSkinSettings): void;
  resolvePendingEdits(): boolean;
  updateTimelineState(
    timeline: SpriteTimeline,
    options: { activateCel: boolean; pixelsChanged: boolean },
  ): void;
  commitTimeline(
    label: string,
    change: (timeline: SpriteTimeline) => SpriteTimeline,
    activateSelection: boolean,
  ): void;
  commitLayerTimeline(
    label: string,
    change: (
      timeline: SpriteTimeline,
      dimensions: { width: number; height: number },
    ) => SpriteTimeline,
  ): void;
  activateCel(frame: number, layer: number, clearRange: boolean): void;
  setRange(range: TimelineRange | undefined): void;
  setStatusReady(): void;
  publish(pixelsChanged: boolean): void;
}

/** Timeline feature module for playback, navigation, frame and tag operations. */
export class TimelineController {
  private playing = false;
  private player = new AnimationPreviewPlayer();

  constructor(private readonly port: TimelineControllerPort) {}

  isPlaying = (): boolean => this.playing;

  reset() {
    this.playing = false;
    this.player = new AnimationPreviewPlayer();
  }

  setPlaybackOptions(patch: Partial<PlaybackSettings>) {
    this.port.setPlaybackOptions(
      normalizePlayback({
        ...defaultPlaybackSettings,
        ...this.port.getPlaybackOptions(),
        ...patch,
      }),
    );
  }

  setOnionSkin(patch: Partial<OnionSkinSettings>): void {
    this.port.setOnionSkinOptions(
      normalizeOnionSkin({
        ...defaultOnionSkinSettings,
        ...this.port.getOnionSkinOptions(),
        ...patch,
      }),
    );
  }

  reverseFrames(): void {
    const timeline = this.port.getTimeline();
    if (!timeline?.range) return;
    const range = timeline.range;
    this.port.commitTimeline(
      "Reverse Frames",
      (current) => reverseAnimationFrames(current, range),
      true,
    );
  }

  setPlaying(value: boolean) {
    const timeline = this.port.getTimeline();
    const next = value && !!timeline && timeline.frames.length > 1;
    if (next === this.playing) return;
    if (next && !this.port.resolvePendingEdits()) return;
    const currentTimeline = this.port.getTimeline();
    const options = normalizePlayback(this.port.getPlaybackOptions());
    if (next && currentTimeline) {
      this.player.play(currentTimeline, options);
      if (this.player.frame !== currentTimeline.activeFrame)
        this.port.activateCel(this.player.frame, currentTimeline.activeLayer, false);
    } else {
      const before = this.player.frame;
      this.player.stop(options);
      if (this.playing && currentTimeline && this.player.frame !== before)
        this.port.activateCel(this.player.frame, currentTimeline.activeLayer, false);
    }
    this.playing = next;
    this.port.publish(true);
  }

  advancePlayback(milliseconds: number) {
    const timeline = this.port.getTimeline();
    if (!this.playing || !timeline) return;
    const changed = this.player.advance(
      timeline,
      milliseconds,
      normalizePlayback(this.port.getPlaybackOptions()),
    );
    if (changed) this.port.activateCel(this.player.frame, timeline.activeLayer, false);
    const stopped = !this.player.playing;
    this.playing = this.player.playing;
    if (changed || stopped) this.port.publish(true);
  }

  stepFrame(direction: -1 | 1, withinTag = false) {
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const tagIndex = withinTag
      ? timelineTagIndexAtFrame(timeline, timeline.activeFrame)
      : undefined;
    const tag = tagIndex === undefined ? undefined : timelineTags(timeline)[tagIndex];
    const first = tag?.from ?? 0;
    const last = tag?.to ?? timeline.frames.length - 1;
    this.selectFrame(
      direction > 0
        ? timeline.activeFrame < last
          ? timeline.activeFrame + 1
          : first
        : timeline.activeFrame > first
          ? timeline.activeFrame - 1
          : last,
    );
  }

  goToTagBoundary(lastFrame = false) {
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const tagIndex = timelineTagIndexAtFrame(timeline, timeline.activeFrame);
    const tag = tagIndex === undefined ? undefined : timelineTags(timeline)[tagIndex];
    this.selectFrame(
      tag ? (lastFrame ? tag.to : tag.from) : lastFrame ? timeline.frames.length - 1 : 0,
    );
  }

  stepLayer(direction: -1 | 1) {
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    this.selectLayer(
      (timeline.activeLayer + direction + timeline.layers.length) % timeline.layers.length,
    );
  }

  selectFrame(frame: number) {
    this.setPlaying(false);
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline || !Number.isInteger(frame) || frame < 0 || frame >= timeline.frames.length)
      return;
    if (frame === timeline.activeFrame) {
      if (timeline.range) this.setTimelineRange(undefined);
      return;
    }
    this.port.activateCel(frame, timeline.activeLayer, true);
    this.port.setStatusReady();
    this.port.publish(true);
  }

  selectLayer(layer: number) {
    this.setPlaying(false);
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline || !Number.isInteger(layer) || layer < 0 || layer >= timeline.layers.length)
      return;
    if (layer === timeline.activeLayer) {
      if (timeline.range) this.setTimelineRange(undefined);
      return;
    }
    this.port.activateCel(timeline.activeFrame, layer, true);
    this.port.setStatusReady();
    this.port.publish(true);
  }

  setTimelineRange(range: TimelineRange | undefined) {
    const timeline = this.port.getTimeline();
    if (!timeline || (!range && !timeline.range) || (range && !validTimelineRange(timeline, range)))
      return;
    this.port.setRange(range);
    this.port.publish(false);
  }

  addFrame(duplicate = true) {
    const timeline = this.port.getTimeline();
    if (!timeline || timeline.frames.length >= MAX_TIMELINE_FRAMES) return;
    this.port.commitTimeline(
      "New Frame",
      (current) => {
        if (current.frames.length >= MAX_TIMELINE_FRAMES) return current;
        const at = current.activeFrame + 1;
        const from = current.frames[current.activeFrame];
        const cels = from.cels.map((cel, index) => {
          if (!duplicate || !cel) return null;
          const layer = current.layers[index];
          return {
            ...cel,
            ...(cel.tilemap
              ? {
                  tilemap:
                    layer.flags & 16
                      ? cel.tilemap
                      : { ...cel.tilemap, tiles: cel.tilemap.tiles.slice() },
                }
              : {}),
            pixels: layer.flags & 16 ? cel.pixels : cloneStoredPixelBuffer(cel.pixels),
            ...(cel.asepriteSamples
              ? {
                  asepriteSamples:
                    layer.flags & 16
                      ? cel.asepriteSamples
                      : { ...cel.asepriteSamples, data: cel.asepriteSamples.data.slice() },
                }
              : {}),
          };
        });
        const frames = [...current.frames];
        frames.splice(at, 0, {
          duration: from.duration,
          cels,
          ...(from.palette ? { palette: from.palette } : {}),
        });
        const next = adjustTimelineTags({ ...current, frames }, at, 1);
        return { ...next, activeFrame: at, activeLayer: current.activeLayer };
      },
      true,
    );
  }

  deleteFrame() {
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    if (timeline.range?.kind === "frames") {
      this.clearTimelineRange(timeline.range);
      return;
    }
    if (timeline.frames.length <= 1) return;
    this.port.commitTimeline(
      "Remove Frame",
      (current) => {
        if (current.frames.length <= 1) return current;
        const next = adjustTimelineTags(
          {
            ...current,
            frames: current.frames.filter((_, index) => index !== current.activeFrame),
          },
          current.activeFrame,
          -1,
        );
        return {
          ...next,
          activeFrame: Math.min(current.activeFrame, next.frames.length - 1),
          activeLayer: current.activeLayer,
        };
      },
      true,
    );
  }

  setFrameDuration(milliseconds: number, allFrames = false) {
    if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > UINT16_MAX) return;
    this.port.commitTimeline(
      "Frame Duration",
      (timeline) => {
        const selected = allFrames
          ? timeline.frames.map((_, index) => index)
          : timeline.range && (timeline.range.kind === "frames" || timeline.range.kind === "cels")
            ? timeline.range.frames
            : [timeline.activeFrame];
        const indices = new Set(selected);
        if ([...indices].every((index) => timeline.frames[index].duration === milliseconds))
          return timeline;
        return {
          ...timeline,
          frames: timeline.frames.map((frame, index) =>
            indices.has(index) ? { ...frame, duration: milliseconds } : frame,
          ),
        };
      },
      false,
    );
  }

  setAnimationTag(index: number, tag: AsepriteTag | null, label = "Tag Properties") {
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const tags = [...timelineTags(timeline)];
    if (!Number.isInteger(index) || index < 0 || index > tags.length) return;
    const previous = tags[index];
    if (tag) {
      if (
        tag.name.length > 256 ||
        !Number.isInteger(tag.from) ||
        !Number.isInteger(tag.to) ||
        tag.from < 0 ||
        tag.to < tag.from ||
        tag.to >= timeline.frames.length
      )
        return;
      assertSupportedAnimationTags(
        [...tags.filter((_, at) => at !== index), tag],
        timeline.frames.length,
      );
      if (
        previous &&
        previous.name === tag.name &&
        previous.from === tag.from &&
        previous.to === tag.to &&
        previous.direction === tag.direction &&
        previous.repeat === tag.repeat &&
        previous.color.every((channel, at) => channel === tag.color[at]) &&
        JSON.stringify(previous.userData ?? null) === JSON.stringify(tag.userData ?? null)
      )
        return;
      if (index < tags.length) tags.splice(index, 1);
      tags.push({ ...tag, color: [...tag.color] });
      tags.sort((a, b) => a.from - b.from || b.to - a.to);
    } else {
      if (!previous) return;
      tags.splice(index, 1);
    }
    this.port.commitTimeline(label, (current) => withTimelineTags(current, tags), false);
  }

  removeCurrentAnimationTag() {
    const timeline = this.port.getTimeline();
    const index = timeline ? timelineTagIndexAtFrame(timeline, timeline.activeFrame) : undefined;
    if (index !== undefined) this.setAnimationTag(index, null, "Delete Tag");
  }

  /** Auto action toggles a Loop tag to match the selected multi-frame range. */
  setLoopSection(): boolean {
    const timeline = this.port.getTimeline();
    if (!timeline) return false;
    const tags = [...timelineTags(timeline)];
    const loopIndex = tags.findIndex((tag) => tag.name === "Loop");
    const range = timeline.range;
    const selected =
      range && (range.kind === "frames" || range.kind === "cels") && range.frames.length > 1
        ? [...range.frames].sort((a, b) => a - b)
        : null;
    if (selected) {
      const from = selected[0];
      const to = selected[selected.length - 1];
      if (loopIndex < 0) {
        this.setAnimationTag(
          tags.length,
          {
            name: "Loop",
            from,
            to,
            color: [0, 0, 0, UINT8_MAX],
            direction: AsepriteTagDirection.Forward,
            repeat: 0,
          },
          "Add Loop",
        );
        return false;
      }
      if (tags[loopIndex].from === from && tags[loopIndex].to === to) return true;
      this.setAnimationTag(loopIndex, { ...tags[loopIndex], from, to }, "Set Loop Range");
      return false;
    }
    if (loopIndex >= 0) this.setAnimationTag(loopIndex, null, "Remove Loop");
    return false;
  }

  setLayerCollapsed(collapsed: boolean, layerIndex?: number) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const at = layerIndex ?? timeline.activeLayer;
    const layer = timeline.layers[at];
    if (layer?.kind !== "group" || Boolean(layer.flags & LAYER_COLLAPSED) === collapsed) return;
    this.port.updateTimelineState(
      {
        ...timeline,
        layers: timeline.layers.map((candidate, index) =>
          index === at
            ? {
                ...candidate,
                flags: (candidate.flags & ~LAYER_COLLAPSED) | (collapsed ? LAYER_COLLAPSED : 0),
              }
            : candidate,
        ),
      },
      { activateCel: false, pixelsChanged: false },
    );
  }

  setLayerVisible(visible: boolean, layerIndex?: number) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const at = layerIndex ?? timeline.activeLayer;
    if (!timeline.layers[at] || timeline.layers[at].visible === visible) return;
    this.port.updateTimelineState(
      {
        ...timeline,
        layers: timeline.layers.map((layer, index) =>
          index === at
            ? {
                ...layer,
                visible,
                flags: (layer.flags & ~LAYER_VISIBLE) | (visible ? LAYER_VISIBLE : 0),
              }
            : layer,
        ),
      },
      { activateCel: true, pixelsChanged: true },
    );
  }

  setLayerLocked(locked: boolean, layerIndex?: number) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const at = layerIndex ?? timeline.activeLayer;
    if (!timeline.layers[at] || timeline.layers[at].locked === locked) return;
    this.port.updateTimelineState(
      {
        ...timeline,
        layers: timeline.layers.map((layer, index) =>
          index === at
            ? {
                ...layer,
                locked,
                flags: (layer.flags & ~LAYER_EDITABLE) | (locked ? 0 : LAYER_EDITABLE),
              }
            : layer,
        ),
      },
      { activateCel: true, pixelsChanged: false },
    );
  }

  setLayerContinuous(continuous: boolean, layerIndex?: number) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const at = layerIndex ?? timeline.activeLayer;
    if (
      !timeline.layers[at] ||
      Boolean(timeline.layers[at].flags & LAYER_CONTINUOUS) === continuous
    )
      return;
    this.port.updateTimelineState(
      {
        ...timeline,
        layers: timeline.layers.map((layer, index) =>
          index === at
            ? {
                ...layer,
                flags: (layer.flags & ~LAYER_CONTINUOUS) | (continuous ? LAYER_CONTINUOUS : 0),
              }
            : layer,
        ),
      },
      { activateCel: false, pixelsChanged: false },
    );
  }

  setAllLayersContinuous(continuous: boolean) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    this.port.updateTimelineState(
      {
        ...timeline,
        layers: timeline.layers.map((layer) => ({
          ...layer,
          flags: (layer.flags & ~LAYER_CONTINUOUS) | (continuous ? LAYER_CONTINUOUS : 0),
        })),
      },
      { activateCel: false, pixelsChanged: false },
    );
  }

  setAllLayersVisible(visible: boolean) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    this.port.updateTimelineState(
      {
        ...timeline,
        layers: timeline.layers.map((layer) => ({
          ...layer,
          visible,
          flags: (layer.flags & ~LAYER_VISIBLE) | (visible ? LAYER_VISIBLE : 0),
        })),
      },
      { activateCel: true, pixelsChanged: true },
    );
  }

  setAllLayersLocked(locked: boolean) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    this.port.updateTimelineState(
      {
        ...timeline,
        layers: timeline.layers.map((layer) => ({
          ...layer,
          locked,
          flags: (layer.flags & ~LAYER_EDITABLE) | (locked ? 0 : LAYER_EDITABLE),
        })),
      },
      { activateCel: true, pixelsChanged: false },
    );
  }

  addLayer(name?: string) {
    this.port.commitLayerTimeline("New Layer", (timeline) =>
      insertLayer(timeline, name ?? defaultLayerName(timeline.layers)),
    );
  }

  addGroup(name?: string) {
    this.port.commitLayerTimeline("New Group", (timeline) => {
      let maximum = 0;
      for (const layer of timeline.layers) {
        const match = /^Group ([\t\n\r ]*[+-]?\d+)/.exec(layer.name);
        if (match) maximum = Math.max(maximum, Number(match[1]));
      }
      return groupLayers(timeline, name ?? `Group ${maximum + 1}`);
    });
  }

  duplicateLayer() {
    this.port.commitLayerTimeline("Duplicate Layer", (timeline) =>
      duplicateLayers(
        timeline,
        timeline.range?.kind === "layers" ? timeline.range.layers : undefined,
      ),
    );
  }

  mergeDown() {
    this.port.commitLayerTimeline("Merge Down", mergeDown);
  }

  flattenLayers(visibleOnly = false) {
    this.port.commitLayerTimeline("Flatten Layers", (timeline, dimensions) =>
      flattenLayers(timeline, dimensions.width, dimensions.height, visibleOnly),
    );
  }

  setLayerProperties(
    properties: {
      name?: string;
      opacity?: number;
      blendMode?: number;
      userData?: AsepriteUserData | null;
    },
    layerIndex?: number,
  ) {
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const at = layerIndex ?? timeline.activeLayer;
    const layer = timeline.layers[at];
    if (!layer) return;
    const name = properties.name ?? layer.name;
    const opacity = isBackgroundLayer(layer)
      ? UINT8_MAX
      : properties.opacity !== undefined && Number.isFinite(properties.opacity)
        ? Math.max(0, Math.min(UINT8_MAX, Math.round(properties.opacity)))
        : layer.opacity;
    const blendMode = isBackgroundLayer(layer)
      ? 0
      : properties.blendMode !== undefined &&
          Number.isInteger(properties.blendMode) &&
          properties.blendMode >= 0 &&
          properties.blendMode <= 18
        ? properties.blendMode
        : (layer.blendMode ?? 0);
    const userDataChanged = Object.prototype.hasOwnProperty.call(properties, "userData");
    const currentUserData =
      layer.userData === null ? undefined : (layer.userData ?? layer.source?.userData);
    const userData = userDataChanged ? (properties.userData ?? null) : layer.userData;
    if (
      name === layer.name &&
      opacity === layer.opacity &&
      blendMode === (layer.blendMode ?? 0) &&
      (!userDataChanged ||
        JSON.stringify(userData ?? null) === JSON.stringify(currentUserData ?? null))
    )
      return;
    this.port.commitLayerTimeline("Edit Layer", (current) => ({
      ...current,
      layers: current.layers.map((candidate, index) =>
        index === at
          ? { ...candidate, name, opacity, blendMode, ...(userDataChanged ? { userData } : {}) }
          : candidate,
      ),
    }));
  }

  setCelProperties(properties: CelProperties, range?: TimelineRange) {
    this.port.commitLayerTimeline("Edit Layer", (timeline) =>
      setTimelineCelProperties(timeline, properties, range),
    );
  }

  renameLayer(name: string) {
    this.setLayerProperties({ name });
  }

  setLayerOpacity(opacity: number) {
    this.setLayerProperties({ opacity });
  }

  deleteLayer() {
    this.port.commitLayerTimeline("Remove Layer", (timeline) =>
      removeLayers(
        timeline,
        timeline.range?.kind === "layers" ? timeline.range.layers : [timeline.activeLayer],
      ),
    );
  }

  reorderLayer(target: number, intoGroup = false) {
    this.port.commitLayerTimeline("Move Layer", (timeline) =>
      moveLayerTree(timeline, timeline.activeLayer, target, intoGroup),
    );
  }

  moveLayer(direction: -1 | 1) {
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const active = timeline.activeLayer;
    const parent = timeline.layers[active].parentId ?? null;
    const siblings = timeline.layers.flatMap((layer, index) =>
      (layer.parentId ?? null) === parent ? [index] : [],
    );
    const at = siblings.indexOf(active);
    const target = siblings[at + direction];
    if (target !== undefined) this.reorderLayer(target);
  }

  linkCels(range?: TimelineRange) {
    if (!this.port.resolvePendingEdits()) return;
    this.port.commitLayerTimeline("Edit Layer", (timeline) =>
      linkTimelineCels(
        timeline,
        range ??
          timeline.range ?? {
            kind: "cels",
            frames: [timeline.activeFrame],
            layers: [timeline.activeLayer],
          },
      ),
    );
  }

  unlinkCels(range?: TimelineRange) {
    if (!this.port.resolvePendingEdits()) return;
    this.port.commitLayerTimeline("Edit Layer", (timeline) =>
      unlinkTimelineCels(
        timeline,
        range ??
          timeline.range ?? {
            kind: "cels",
            frames: [timeline.activeFrame],
            layers: [timeline.activeLayer],
          },
      ),
    );
  }

  duplicateCels(linked = false, range?: TimelineRange) {
    if (!this.port.resolvePendingEdits()) return;
    this.port.commitLayerTimeline("Edit Layer", (timeline) =>
      duplicateTimelineCels(
        timeline,
        range ??
          timeline.range ?? {
            kind: "cels",
            frames: [timeline.activeFrame],
            layers: [timeline.activeLayer],
          },
        linked,
      ),
    );
  }

  transferTimelineRange(
    range: TimelineRange,
    frameDelta: number,
    layerDelta: number,
    copy = false,
  ) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const next = transferTimelineRangeOperation(timeline, range, frameDelta, layerDelta, copy);
    if (next === timeline) return;
    this.port.commitTimeline(
      copy ? "Copy Cels" : "Move Cels",
      (current) => transferTimelineRangeOperation(current, range, frameDelta, layerDelta, copy),
      true,
    );
  }

  dropTimelineLayers(
    range: TimelineRange,
    target: number,
    position: TimelineLayerDropPosition,
    copy = false,
  ) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const next = dropTimelineLayersOperation(timeline, range, target, position, copy);
    if (next === timeline) return;
    this.port.commitLayerTimeline(copy ? "Copy Layers" : "Move Layers", (current) =>
      current === timeline
        ? next
        : dropTimelineLayersOperation(current, range, target, position, copy),
    );
  }

  clearTimelineRange(range: TimelineRange) {
    if (!this.port.resolvePendingEdits()) return;
    const timeline = this.port.getTimeline();
    if (!timeline || !validTimelineRange(timeline, range)) return;
    if (
      range.kind === "cels" &&
      range.layers.some(
        (layer) => !layerEditable(timeline, layer) || isBackgroundLayer(timeline.layers[layer]),
      )
    )
      return;
    if (range.kind === "frames" && range.frames.length >= timeline.frames.length) return;
    if (range.kind === "layers" && range.layers.length >= timeline.layers.length) return;
    this.port.commitTimeline(
      "Clear Timeline Range",
      (current) => {
        let next = current;
        if (range.kind === "frames") {
          for (const index of [...range.frames].sort((a, b) => b - a))
            next = adjustTimelineTags(
              { ...next, frames: next.frames.filter((_, at) => at !== index) },
              index,
              -1,
            );
        } else if (range.kind === "layers") {
          next = removeLayers(next, range.layers);
        } else {
          next = {
            ...next,
            frames: next.frames.map((frame, index) =>
              range.frames.includes(index)
                ? {
                    ...frame,
                    cels: frame.cels.map((cel, layer) =>
                      range.layers.includes(layer) ? null : cel,
                    ),
                  }
                : frame,
            ),
          };
        }
        return {
          ...next,
          range: undefined,
          activeFrame: Math.min(next.activeFrame, next.frames.length - 1),
          activeLayer: Math.min(next.activeLayer, next.layers.length - 1),
        };
      },
      true,
    );
  }
}
