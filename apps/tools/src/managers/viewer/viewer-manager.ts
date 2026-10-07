import type { ViewerPort } from "$/managers/ports/viewer";
import { ToolViewport } from "$/managers/preview/tool-viewport";
import { ViewerFrameCache } from "$/managers/viewer/frame-cache";
import { MAX_IMAGE_PIXELS, type PixelBuffer } from "@xprite/editor-core/base";
import { activateTimelineCel, type EditorDocument } from "@xprite/editor-core/document";
import {
  AsepriteTagDirection,
  encodeGif,
  exportFrameOrder,
  renderExport,
  renderExportAnimation,
  type ExportFileOptions,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";
import {
  AnimationPreviewPlayer,
  animationExportLoopCount,
  defaultPlaybackSettings,
  timelineTags,
  LAYER_REFERENCE,
  LAYER_COLLAPSED,
  layerAncestors,
  type PlaybackSettings,
  type SpriteTimeline,
} from "@xprite/editor-core/timeline";
import { AppearanceMode } from "@xprite/editor-ui/appearance";

export enum ViewerStatus {
  Empty = "empty",
  Loading = "loading",
  Ready = "ready",
}
export enum ViewerExportFormat {
  Png = "png",
  Gif = "gif",
}
export const ALL_FRAMES_TAG = "all";
interface ViewerLayer {
  id: string;
  name: string;
  visible: boolean;
  reference: boolean;
  collapsed: boolean;
  depth: number;
}
interface ViewerTag {
  id: string;
  name: string;
  from: number;
  to: number;
}
type ViewerPixels = Pick<PixelBuffer, "width" | "height" | "data">;
export interface ViewerSnapshot {
  identity: number;
  appearanceMode: AppearanceMode;
  selectedLayer: number;
  status: ViewerStatus;
  name: string;
  width: number;
  height: number;
  frames: number;
  frame: number;
  duration: number;
  rangeStart: number;
  rangeEnd: number;
  tags: readonly ViewerTag[];
  selectedTag: string;
  animated: boolean;
  layers: readonly ViewerLayer[];
  playing: boolean;
  pixels: ViewerPixels | null;
  error: string | null;
  exporting: boolean;
  openingEditor: boolean;
}

const INITIAL_FRAME = 0;
const SINGLE_FRAME = 1;
const FRAME_STEP = 1;
const ORIGINAL_SCALE_PERCENT = 100;
const ACCEPTED_FILENAME = /\.(ase|aseprite)$/i;
const PREVIEW_FILENAME = "preview.png";
const emptySnapshot = (): ViewerSnapshot => ({
  identity: 0,
  appearanceMode: AppearanceMode.Light,
  selectedLayer: 0,
  status: ViewerStatus.Empty,
  name: "",
  width: 0,
  height: 0,
  frames: 0,
  frame: INITIAL_FRAME,
  duration: 0,
  rangeStart: 0,
  rangeEnd: 0,
  tags: [],
  selectedTag: ALL_FRAMES_TAG,
  animated: false,
  layers: [],
  playing: false,
  pixels: null,
  error: null,
  exporting: false,
  openingEditor: false,
});

/** Owns a read-only project; rendering, playback, tags and encoding use editor-core. */
export class ViewerManager {
  readonly viewport: ToolViewport;
  private snapshot = emptySnapshot();
  private readonly listeners = new Set<() => void>();
  private project: SessionProject | null = null;
  private readonly frameCache = new ViewerFrameCache();
  private file: File | null = null;
  private player = new AnimationPreviewPlayer();
  private request = 0;
  private closed = false;
  private readonly stopAppearance: () => void;
  constructor(private readonly port: ViewerPort) {
    this.viewport = new ToolViewport(port.readWheel);
    this.snapshot = { ...this.snapshot, appearanceMode: port.readAppearance() };
    this.stopAppearance = port.watchAppearance((mode) => this.update({ appearanceMode: mode }));
  }
  getSnapshot = () => this.snapshot;
  getAppearanceMode = () => this.snapshot.appearanceMode;
  setAppearanceMode = (mode: AppearanceMode) => this.update({ appearanceMode: mode });
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(values: Partial<ViewerSnapshot>) {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, ...values };
    for (const listener of this.listeners) listener();
  }
  private selectedSourceTag() {
    if (!this.project || this.snapshot.selectedTag === ALL_FRAMES_TAG) return undefined;
    const index = this.snapshot.tags.findIndex((tag) => tag.id === this.snapshot.selectedTag);
    return timelineTags(this.project.timeline)[index];
  }
  private playbackSettings(): PlaybackSettings {
    return {
      ...defaultPlaybackSettings,
      playAll: this.snapshot.selectedTag === ALL_FRAMES_TAG,
      playSubtags: false,
    };
  }
  getPresentationTimeline(): SpriteTimeline | null {
    if (!this.project) return null;
    return {
      ...this.project.timeline,
      activeFrame: this.snapshot.frame,
      activeLayer: this.snapshot.selectedLayer,
      layers: this.project.timeline.layers.map((layer, index) => ({
        ...layer,
        visible: this.snapshot.layers[index].visible,
        flags:
          layer.kind === "group"
            ? this.snapshot.layers[index].collapsed
              ? layer.flags | LAYER_COLLAPSED
              : layer.flags & ~LAYER_COLLAPSED
            : layer.flags,
      })),
    };
  }
  private timeline(): SpriteTimeline | null {
    const timeline = this.getPresentationTimeline();
    if (!timeline) return null;
    const tag = this.selectedSourceTag();
    return tag ? { ...timeline, tags: [tag] } : timeline;
  }
  private document(frame: number): EditorDocument | null {
    const timeline = this.timeline();
    if (!timeline || !this.project) return null;
    const document: EditorDocument = {
      name: this.snapshot.name,
      width: this.project.image.width,
      height: this.project.image.height,
      timeline,
      palette: this.project.palette,
      selection: null,
      layer: { name: "", pixels: this.project.image, x: 0, y: 0, visible: true, locked: false },
    };
    activateTimelineCel(document, frame, timeline.activeLayer);
    return document;
  }
  private exportOptions(name: string, frame: number): ExportFileOptions {
    return {
      name,
      scalePercent: ORIGINAL_SCALE_PERCENT,
      area: "canvas",
      layers: "visible",
      frame,
      frames: "current",
    };
  }
  private render(frame: number) {
    if (!this.project) return;
    const visibility = this.snapshot.layers.map((layer) => (layer.visible ? "1" : "0")).join("");
    let pixels = this.frameCache.get(frame, visibility);
    if (!pixels) {
      const document = this.document(frame)!;
      pixels = renderExport(document, this.exportOptions(PREVIEW_FILENAME, frame));
      this.frameCache.set(frame, visibility, pixels);
    }
    this.update({
      frame,
      pixels,
      duration: this.project.timeline.frames[frame].duration,
    });
  }
  async open(file: File) {
    if (!ACCEPTED_FILENAME.test(file.name)) {
      this.update({ error: "Choose an .ase or .aseprite file." });
      return;
    }
    const request = ++this.request;
    this.player.stop(this.playbackSettings());
    this.update({ status: ViewerStatus.Loading, playing: false, error: null });
    try {
      const project = await this.port.read(file);
      if (this.closed || request !== this.request) return;
      this.project = project;
      this.frameCache.clear();
      this.file = file;
      this.player = new AnimationPreviewPlayer();
      const sourceLayers = project.timeline.layers;
      const layers = sourceLayers.map((layer): ViewerLayer => {
        let depth = 0;
        let parent = layer.parentId;
        const ancestors = new Set<string>();
        while (parent && !ancestors.has(parent)) {
          ancestors.add(parent);
          depth++;
          parent = sourceLayers.find((candidate) => candidate.id === parent)?.parentId;
        }
        return {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          reference: !!(layer.flags & LAYER_REFERENCE),
          collapsed: !!(layer.flags & LAYER_COLLAPSED),
          depth,
        };
      });
      this.update({
        ...emptySnapshot(),
        identity: request,
        appearanceMode: this.snapshot.appearanceMode,
        status: ViewerStatus.Ready,
        name: file.name,
        width: project.image.width,
        height: project.image.height,
        frames: project.timeline.frames.length,
        rangeEnd: project.timeline.frames.length - FRAME_STEP,
        animated: project.timeline.frames.length > SINGLE_FRAME,
        tags: timelineTags(project.timeline).map((tag, index) => ({
          id: `tag:${index}`,
          name: tag.name,
          from: tag.from,
          to: tag.to,
        })),
        layers,
      });
      this.render(INITIAL_FRAME);
    } catch (reason) {
      if (this.closed || request !== this.request) return;
      this.update({
        status: this.project ? ViewerStatus.Ready : ViewerStatus.Empty,
        error: reason instanceof Error ? reason.message : "This file could not be opened.",
      });
    }
  }
  async openExample() {
    const request = ++this.request;
    this.player.stop(this.playbackSettings());
    this.update({ status: ViewerStatus.Loading, playing: false, error: null });
    try {
      const file = await this.port.example();
      if (!this.closed && request === this.request) await this.open(file);
    } catch {
      if (this.closed || request !== this.request) return;
      this.update({
        status: this.project ? ViewerStatus.Ready : ViewerStatus.Empty,
        error: "The example could not be loaded. Choose a file to continue.",
      });
    }
  }
  selectTag(id: string) {
    if (!this.project || this.snapshot.status !== ViewerStatus.Ready) return;
    const tag = this.snapshot.tags.find((tag) => tag.id === id);
    if (id !== ALL_FRAMES_TAG && !tag) return;
    const playing = this.player.playing;
    this.player.stop(this.playbackSettings());
    const rangeStart = tag?.from ?? INITIAL_FRAME;
    const rangeEnd = tag?.to ?? this.snapshot.frames - FRAME_STEP;
    this.update({
      selectedTag: id,
      rangeStart,
      rangeEnd,
      animated: rangeEnd > rangeStart,
      playing: false,
    });
    const sourceTag = this.selectedSourceTag();
    const reverse =
      sourceTag?.direction === AsepriteTagDirection.Reverse ||
      sourceTag?.direction === AsepriteTagDirection.PingPongReverse;
    this.selectFrame(reverse ? rangeEnd : rangeStart);
    if (playing && this.snapshot.animated) this.togglePlayback();
  }
  togglePlayback() {
    const timeline = this.timeline();
    if (!timeline || this.snapshot.status !== ViewerStatus.Ready || !this.snapshot.animated) return;
    const settings = this.playbackSettings();
    if (this.player.playing) this.player.stop(settings);
    else this.player.play(timeline, settings, this.snapshot.frame);
    this.update({ playing: this.player.playing });
    this.render(this.player.frame);
  }
  advance(elapsed: number) {
    const timeline = this.timeline();
    if (!timeline || !this.player.playing) return;
    if (this.player.advance(timeline, elapsed, this.playbackSettings()))
      this.render(this.player.frame);
    if (this.snapshot.playing !== this.player.playing)
      this.update({ playing: this.player.playing });
  }
  selectFrame(frame: number) {
    if (!this.project || this.snapshot.status !== ViewerStatus.Ready || !Number.isFinite(frame))
      return;
    this.player.stop(this.playbackSettings());
    this.player.sync(
      Math.max(this.snapshot.rangeStart, Math.min(this.snapshot.rangeEnd, Math.round(frame))),
    );
    this.update({ playing: false });
    this.render(this.player.frame);
  }
  stepFrame(direction: number) {
    const count = this.snapshot.rangeEnd - this.snapshot.rangeStart + FRAME_STEP;
    this.selectFrame(
      this.snapshot.rangeStart +
        ((this.snapshot.frame - this.snapshot.rangeStart + direction + count) % count),
    );
  }
  toggleLayer(id: string) {
    this.update({
      layers: this.snapshot.layers.map((layer) =>
        layer.id === id && !layer.reference ? { ...layer, visible: !layer.visible } : layer,
      ),
    });
    this.render(this.snapshot.frame);
  }
  selectLayer(index: number) {
    if (this.snapshot.layers[index]) this.update({ selectedLayer: index });
  }
  toggleGroup(index: number) {
    const timeline = this.project?.timeline;
    if (!timeline || timeline.layers[index]?.kind !== "group") return;
    const collapsed = !this.snapshot.layers[index].collapsed;
    const selectedLayer =
      collapsed &&
      layerAncestors(timeline, this.snapshot.selectedLayer).some(
        (layer) => layer.id === timeline.layers[index].id,
      )
        ? index
        : this.snapshot.selectedLayer;
    this.update({
      selectedLayer,
      layers: this.snapshot.layers.map((layer, position) =>
        position === index ? { ...layer, collapsed } : layer,
      ),
    });
  }
  inspectFrame(frame: number) {
    if (frame < this.snapshot.rangeStart || frame > this.snapshot.rangeEnd)
      this.selectTag(ALL_FRAMES_TAG);
    this.selectFrame(frame);
  }
  async exportFile(
    format = this.snapshot.animated ? ViewerExportFormat.Gif : ViewerExportFormat.Png,
  ) {
    if (!this.project || !this.snapshot.pixels || this.snapshot.exporting) return;
    const request = this.request;
    const tag = this.selectedSourceTag();
    const base = this.snapshot.name.replace(ACCEPTED_FILENAME, "");
    const tagSuffix = tag ? `-${tag.name.replace(/[/\\:*?"<>|]/g, "-")}` : "";
    this.update({ exporting: true, error: null });
    try {
      if (format === ViewerExportFormat.Png) {
        await this.port.saveFrame(
          this.snapshot.pixels,
          `${base}-frame-${this.snapshot.frame + FRAME_STEP}.png`,
        );
      } else {
        const document = this.document(this.snapshot.frame)!;
        const name = `${base}${tagSuffix}.gif`;
        const loopCount = animationExportLoopCount(
          this.project.timeline.loopCount,
          tag ? { loopCount: tag.repeat } : {},
        );
        const options: ExportFileOptions = {
          ...this.exportOptions(name, this.snapshot.frame),
          frames: tag ? `tag:${tag.name}` : "all",
          direction: tag?.direction ?? AsepriteTagDirection.Forward,
          playSubtags: false,
          loopCount,
        };
        const exportedPixels =
          document.width * document.height * exportFrameOrder(document, options).length;
        if (exportedPixels > MAX_IMAGE_PIXELS)
          throw new RangeError(
            "This animation is too large to export as GIF. Choose a shorter animation tag or export the current frame as PNG.",
          );
        const frames = renderExportAnimation(document, options);
        const bytes = encodeGif(frames, { loopCount });
        await this.port.saveAnimation(bytes, name);
      }
    } catch (reason) {
      if (request === this.request)
        this.update({
          error:
            reason instanceof Error
              ? reason.message
              : "The file could not be exported. Please try again.",
        });
    } finally {
      if (request === this.request) this.update({ exporting: false });
    }
  }
  async openEditor() {
    if (!this.file || this.snapshot.openingEditor) return;
    this.update({ openingEditor: true, error: null });
    try {
      await this.port.edit(this.file);
    } catch {
      this.update({
        openingEditor: false,
        error: "The editor could not be opened. Please try again.",
      });
    }
  }
  dispose() {
    this.closed = true;
    this.request++;
    this.player.stop(this.playbackSettings());
    this.project = null;
    this.frameCache.clear();
    this.file = null;
    this.listeners.clear();
    this.stopAppearance();
  }
}
