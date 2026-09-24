import { UINT8_MAX, UINT16_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { blendImageAt, blendNormalAt, mulUn8 } from "$/canvas/blend-modes";
import { AsepriteTagDirection, type AsepriteTag } from "$/import-export/aseprite/model";
import { timelineTags, withTimelineTags } from "$/timeline/tags";
import type { SpriteTimeline, TimelineCel, TimelineFrame, TimelineLayer } from "$/timeline/types";

export type {
  SpriteTimeline,
  TimelineCel,
  TimelineFrame,
  TimelineLayer,
  TimelineRange,
} from "$/timeline/types";

/** Bit values stored in ASE layer records. */
export const LAYER_VISIBLE = 1;
export const LAYER_EDITABLE = 2;
export const LAYER_LOCK_MOVE = 4;
export const LAYER_BACKGROUND = 8;
export const LAYER_CONTINUOUS = 16;
export const LAYER_COLLAPSED = 32;
export const LAYER_REFERENCE = 64;

export function isBackgroundLayer(layer: Pick<TimelineLayer, "flags">): boolean {
  return (layer.flags & LAYER_BACKGROUND) !== 0;
}

/** A background layer is a single opaque image at the bottom of the root stack. */
export function assertSupportedBackgroundStack(layers: readonly TimelineLayer[]): void {
  let backgroundIndex = -1;
  for (let index = 0; index < layers.length; index += 1) {
    if (!isBackgroundLayer(layers[index])) continue;
    if (backgroundIndex >= 0) throw new Error("A sprite may contain only one background layer.");
    if (index !== 0 || layers[index].parentId)
      throw new Error("A background layer must be the bottom layer.");
    backgroundIndex = index;
  }
}
export const MAX_TIMELINE_FRAMES = 4096;
export const MAX_TIMELINE_LAYERS = 256;
/** Effective properties include ancestors; group/reference rows cannot receive raster edits. */
export function layerAncestors(t: SpriteTimeline, index: number): TimelineLayer[] {
  const out: TimelineLayer[] = [];
  let p = t.layers[index]?.parentId;
  const seen = new Set<string>();
  while (p && !seen.has(p)) {
    seen.add(p);
    const parent = t.layers.find((l) => l.id === p);
    if (!parent) break;
    out.push(parent);
    p = parent.parentId;
  }
  return out;
}
export function layerEditable(t: SpriteTimeline, index: number): boolean {
  const l = t.layers[index];
  return (
    !!l &&
    l.kind !== "group" &&
    !(l.flags & LAYER_REFERENCE) &&
    !l.locked &&
    layerAncestors(t, index).every((p) => !p.locked && p.visible)
  );
}
export function layerMovable(t: SpriteTimeline, index: number): boolean {
  const l = t.layers[index];
  return (
    !!l &&
    l.kind !== "group" &&
    l.visible &&
    !l.locked &&
    !(l.flags & LAYER_LOCK_MOVE) &&
    layerAncestors(t, index).every((p) => p.visible && !p.locked && !(p.flags & LAYER_LOCK_MOVE))
  );
}
export function effectiveLayerVisible(t: SpriteTimeline, index: number): boolean {
  return !!t.layers[index]?.visible && layerAncestors(t, index).every((p) => p.visible);
}
/** Render sibling plans independently, isolating group opacity/blend as Aseprite Render does. */
export function renderTimelineFrame(
  t: SpriteTimeline,
  width: number,
  height: number,
  frameIndex: number,
  overlay?: { pixels: PixelBuffer; x: number; y: number },
  showReferenceLayers = true,
): PixelBuffer {
  const frame = t.frames[frameIndex];
  if (!frame) throw new RangeError("Invalid frame");
  // A freshly allocated target is transparent everywhere, including RGB. The
  // first unscaled, full-opacity cel can therefore be copied exactly by rows.
  const pristine = new WeakSet<PixelBuffer>();
  const empty = (): PixelBuffer => {
    const out = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    pristine.add(out);
    return out;
  };
  function draw(
    out: PixelBuffer,
    cel: TimelineCel,
    opacity: number,
    mode: number,
    reference = false,
  ) {
    const image = cel.pixels,
      b =
        reference && cel.preciseBounds
          ? cel.preciseBounds
          : { x: cel.x, y: cel.y, width: image.width, height: image.height };
    if (b.width <= 0 || b.height <= 0) return;
    const left = Math.max(0, Math.floor(b.x)),
      top = Math.max(0, Math.floor(b.y)),
      right = Math.min(width, Math.ceil(b.x + b.width)),
      bottom = Math.min(height, Math.ceil(b.y + b.height));
    if (right <= left || bottom <= top) return;
    const unscaled =
      Number.isInteger(b.x) &&
      Number.isInteger(b.y) &&
      b.width === image.width &&
      b.height === image.height;
    const copy = pristine.has(out) && opacity === UINT8_MAX;
    pristine.delete(out);
    if (unscaled) {
      for (let y = top; y < bottom; y++) {
        let at = (y * width + left) * 4,
          from = ((y - b.y) * image.width + left - b.x) * 4;
        const end = at + (right - left) * 4;
        if (copy) {
          out.data.set(image.data.subarray(from, from + end - at), at);
          continue;
        }
        if (mode === 0)
          for (; at < end; at += 4, from += 4) {
            if (
              image.data[from] ||
              image.data[from + 1] ||
              image.data[from + 2] ||
              image.data[from + 3]
            )
              blendNormalAt(out.data, at, image.data, from, opacity);
          }
        else
          for (; at < end; at += 4, from += 4)
            blendImageAt(out.data, at, image.data, from, opacity, mode);
      }
      return;
    }
    // Reference cels retain the exact fractional sampling phase. Compute the
    // horizontal map once instead of repeating divisions for every scanline.
    const columns = Int32Array.from(
      { length: right - left },
      (_, i) =>
        Math.max(
          0,
          Math.min(image.width - 1, Math.floor(((left + i - b.x) * image.width) / b.width)),
        ) * 4,
    );
    for (let y = top; y < bottom; y++) {
      const row =
        Math.max(0, Math.min(image.height - 1, Math.floor(((y - b.y) * image.height) / b.height))) *
        image.width *
        4;
      let at = (y * width + left) * 4;
      for (let x = 0; x < columns.length; x++, at += 4)
        blendImageAt(out.data, at, image.data, row + columns[x], opacity, mode);
    }
  }
  function render(
    parent: string | null,
    seen: Set<string>,
    out: PixelBuffer = empty(),
  ): PixelBuffer {
    const order = t.layers
      .map((layer, index) => ({ layer, index, cel: frame.cels[index] }))
      .filter((v) =>
        t.composeGroups !== true ? v.layer.kind !== "group" : (v.layer.parentId ?? null) === parent,
      )
      .map((item, ordinal) => ({ ...item, order: t.composeGroups !== true ? item.index : ordinal }))
      .sort(
        (a, b) =>
          a.order + (a.cel?.zIndex ?? 0) - (b.order + (b.cel?.zIndex ?? 0)) ||
          (a.cel?.zIndex ?? 0) - (b.cel?.zIndex ?? 0),
      );
    for (const { layer, index, cel } of order) {
      if (
        !effectiveLayerVisible(t, index) ||
        seen.has(layer.id) ||
        (!showReferenceLayers && !!(layer.flags & LAYER_REFERENCE))
      )
        continue;
      if (layer.kind === "group") {
        if (t.composeGroups !== true) {
          render(layer.id, new Set([...seen, layer.id]), out);
          continue;
        }
        const child = render(layer.id, new Set([...seen, layer.id]));
        draw(
          out,
          { pixels: child, x: 0, y: 0, opacity: UINT8_MAX, zIndex: 0 },
          layer.opacity,
          layer.blendMode ?? 0,
        );
        continue;
      }
      let image = cel;
      if (overlay && index === t.activeLayer) {
        const merged = empty();
        if (cel) draw(merged, cel, UINT8_MAX, 0);
        draw(merged, { ...overlay, opacity: UINT8_MAX, zIndex: 0 }, UINT8_MAX, 0);
        image = {
          pixels: merged,
          x: 0,
          y: 0,
          opacity: cel?.opacity ?? UINT8_MAX,
          zIndex: cel?.zIndex ?? 0,
        };
      }
      if (image)
        draw(
          out,
          image,
          mulUn8(layer.opacity, image.opacity),
          layer.blendMode ?? 0,
          !!(layer.flags & LAYER_REFERENCE),
        );
    }
    return out;
  }
  return render(null, new Set());
}
/** Immutable container copy; cel pixels remain shared until raster history records edits. */
export function cloneTimeline(timeline: SpriteTimeline): SpriteTimeline {
  return {
    ...timeline,
    layers: timeline.layers.map((layer) => ({ ...layer })),
    frames: timeline.frames.map((frame) => ({
      ...frame,
      cels: frame.cels.map((cel) => (cel ? { ...cel } : null)),
    })),
  };
}

export interface TimelinePlaybackRange {
  direction?: AsepriteTag["direction"];
  from: number;
  to: number;
  /** The ASE tag repeat field uses zero for infinite; positive is total passes. */
  repeat?: number;
}
export interface TimelinePlaybackAdvance {
  phase?: number;
  frame: number;
  elapsed: number;
  cycles: number;
  completed: boolean;
}

/** Time policy only; adapters supply elapsed monotonic milliseconds. This is
 * the forward-tag subset of doc::Playback: finite tags stop after their
 * declared total number of passes, while repeat=0 remains infinite. */
export function advanceTimelinePlaybackWithRepeats(
  frames: readonly TimelineFrame[],
  frame: number,
  elapsed: number,
  delta: number,
  range: TimelinePlaybackRange = { from: 0, to: frames.length - 1 },
  completedCycles = 0,
  phase?: number,
): TimelinePlaybackAdvance {
  if (
    range.direction &&
    range.direction !== AsepriteTagDirection.Forward &&
    frames.length &&
    Number.isFinite(delta) &&
    delta >= 0
  ) {
    const forward = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i);
    const base =
      range.direction === AsepriteTagDirection.Reverse ||
      range.direction === AsepriteTagDirection.PingPongReverse
        ? [...forward].reverse()
        : forward;
    const sequence =
      range.direction.startsWith(AsepriteTagDirection.PingPong) && base.length > 1
        ? [...base, ...base.slice(1, -1).reverse()]
        : base;
    let index = phase ?? Math.max(0, sequence.indexOf(frame));
    const cycle = sequence.reduce((sum, f) => sum + frames[f].duration, 0);
    let total =
      completedCycles * cycle +
      sequence.slice(0, index).reduce((sum, f) => sum + frames[f].duration, 0) +
      elapsed +
      delta;
    if (range.repeat && total >= range.repeat * cycle)
      return {
        frame: sequence[sequence.length - 1],
        elapsed: 0,
        cycles: range.repeat,
        completed: true,
        phase: sequence.length - 1,
      };
    const cycles = Math.floor(total / cycle);
    total %= cycle;
    index = 0;
    while (total >= frames[sequence[index]].duration) {
      total -= frames[sequence[index]].duration;
      index++;
    }
    return { frame: sequence[index], elapsed: total, cycles, completed: false, phase: index };
  }
  if (!frames.length || !Number.isFinite(delta) || delta < 0)
    return { frame, elapsed, cycles: completedCycles, completed: false };
  let cycle = 0;
  for (let index = range.from; index <= range.to; index += 1) cycle += frames[index].duration;
  const startFrame = frame < range.from || frame > range.to ? range.from : frame;
  let offset = elapsed;
  for (let index = range.from; index < startFrame; index += 1) offset += frames[index].duration;
  const total = completedCycles * cycle + offset + delta;
  const repeat = range.repeat ?? 0;
  if (repeat > 0 && total >= repeat * cycle)
    return { frame: range.to, elapsed: 0, cycles: repeat, completed: true };
  const cycles = Math.floor(total / cycle);
  let remaining = total - cycles * cycle;
  let next = range.from;
  while (remaining >= frames[next].duration) {
    remaining -= frames[next].duration;
    next = next < range.to ? next + 1 : range.from;
  }
  return { frame: next, elapsed: remaining, cycles, completed: false };
}

/** DocApi::adjustTags default insertion/removal policy. Inserting immediately
 * after a tag extends it; deleting its sole frame removes that tag. */
export function adjustTimelineTags(
  timeline: SpriteTimeline,
  frame: number,
  delta: 1 | -1,
): SpriteTimeline {
  const tags = timelineTags(timeline).flatMap((tag) => {
    let from = tag.from,
      to = tag.to;
    if (delta === 1) {
      if (frame <= from) from++;
      if (frame <= to + 1) to++;
    } else {
      if (frame < from) from--;
      if (frame <= to) to--;
    }
    return from > to ? [] : [{ ...tag, from, to }];
  });
  return withTimelineTags(timeline, tags);
}

/** RGB shrink_bounds ignores hidden RGB when alpha is zero. Aseprite paint
 * transactions trim transparent cel margins instead of storing canvas padding. */
/** LibreSprite GPLv2 NewLayerCommand::get_max_layer_num uses a case-sensitive "Layer " prefix and
 * strtol, then chooses the largest suffix plus one (not the first gap). */
export function defaultLayerName(layers: readonly TimelineLayer[]): string {
  let maximum = 0;
  for (const layer of layers) {
    const match = /^Layer ([\t\n\r ]*[+-]?\d+)/.exec(layer.name);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return `Layer ${maximum + 1}`;
}

export function assertSupportedAnimationTags(tags: readonly AsepriteTag[], frameCount: number) {
  for (const tag of tags) {
    if (tag.from < 0 || tag.to < tag.from || tag.to >= frameCount)
      throw new Error("Invalid animation tag range");
    if (
      ![
        AsepriteTagDirection.Forward,
        AsepriteTagDirection.Reverse,
        AsepriteTagDirection.PingPong,
        AsepriteTagDirection.PingPongReverse,
      ].includes(tag.direction) ||
      !Number.isInteger(tag.repeat) ||
      tag.repeat < 0 ||
      tag.repeat > UINT16_MAX
    )
      throw new Error(`Animation tag “${tag.name}” has invalid playback metadata.`);
  }
}

/** Timeline paints topmost siblings first, keeping group headers above descendants. */
export function visibleTimelineLayers(t: SpriteTimeline): number[] {
  const result: number[] = [];
  const visit = (parent: string | null, seen: Set<string>) => {
    for (let i = t.layers.length - 1; i >= 0; i--) {
      const l = t.layers[i];
      if ((l.parentId ?? null) !== parent || seen.has(l.id)) continue;
      result.push(i);
      if (l.kind === "group" && !(l.flags & 32)) visit(l.id, new Set([...seen, l.id]));
    }
  };
  visit(null, new Set());
  return result;
}
export function timelineLayerDepth(t: SpriteTimeline, index: number): number {
  return layerAncestors(t, index).length;
}
