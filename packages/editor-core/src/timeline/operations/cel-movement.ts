import type { PixelMask, Point } from "$/base/primitives";
import { layerSubtree } from "$/timeline/layer-operations";
import { validTimelineRange } from "$/timeline/tags";
import {
  effectiveLayerVisible,
  isBackgroundLayer,
  layerAncestors,
  LAYER_LOCK_MOVE,
  LAYER_REFERENCE,
} from "$/timeline/timeline";
import type { SpriteTimeline, TimelineCel } from "$/timeline/types";

function editableHierarchy(timeline: SpriteTimeline, index: number): boolean {
  const layer = timeline.layers[index];
  return (
    !!layer && !layer.locked && layerAncestors(timeline, index).every((parent) => !parent.locked)
  );
}

/** Groups are valid movement entry points even though they have no paintable cel. */
export function canMoveTimelineLayer(timeline: SpriteTimeline, index: number): boolean {
  const layer = timeline.layers[index];
  return (
    !!layer &&
    effectiveLayerVisible(timeline, index) &&
    editableHierarchy(timeline, index) &&
    !(layer.flags & LAYER_LOCK_MOVE) &&
    !isBackgroundLayer(layer)
  );
}

function movementSites(timeline: SpriteTimeline, useTimelineRange: boolean) {
  const range =
    useTimelineRange && timeline.range && validTimelineRange(timeline, timeline.range)
      ? timeline.range
      : null;
  const frames = !range
    ? [timeline.activeFrame]
    : range.kind === "layers"
      ? timeline.frames.map((_, index) => index)
      : range.frames;
  const roots = !range
    ? [timeline.activeLayer]
    : range.kind === "frames"
      ? timeline.layers.map((_, index) => index)
      : range.layers;
  const layers = new Set(roots.flatMap((index) => layerSubtree(timeline, index)));
  return { frames, layers };
}

export function isLayerInCelMovementRange(
  timeline: SpriteTimeline,
  index: number,
  useTimelineRange = true,
): boolean {
  return !!(
    useTimelineRange &&
    timeline.range &&
    validTimelineRange(timeline, timeline.range) &&
    movementSites(timeline, true).layers.has(index)
  );
}

function identity(cel: TimelineCel): object {
  return cel.asepriteSamples ?? cel.tilemap ?? cel.pixels;
}

function roundedOffset(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Captures one frozen target set. Linked aliases share movement, including outside the range. */
export class TimelineCelMovement {
  private offset: Point = { x: 0, y: 0 };
  private moved = false;

  private constructor(
    private readonly timeline: SpriteTimeline,
    private readonly targets: ReadonlyMap<number, ReadonlySet<object>>,
  ) {}

  static create(timeline: SpriteTimeline, useTimelineRange = true): TimelineCelMovement | null {
    if (!canMoveTimelineLayer(timeline, timeline.activeLayer)) return null;
    const sites = movementSites(timeline, useTimelineRange);
    const targets = new Map<number, Set<object>>();
    for (const layer of sites.layers) {
      const item = timeline.layers[layer];
      if (
        item.kind === "group" ||
        !editableHierarchy(timeline, layer) ||
        item.flags & LAYER_LOCK_MOVE ||
        isBackgroundLayer(item)
      )
        continue;
      for (const frame of sites.frames) {
        const cel = timeline.frames[frame].cels[layer];
        if (!cel) continue;
        const images = targets.get(layer) ?? new Set<object>();
        images.add(identity(cel));
        targets.set(layer, images);
      }
    }
    return targets.size ? new TimelineCelMovement(timeline, targets) : null;
  }

  render(offset: Point, grid?: { width: number; height: number }): SpriteTimeline {
    const hasReference = [...this.targets.keys()].some(
      (layer) => !!(this.timeline.layers[layer].flags & LAYER_REFERENCE),
    );
    this.moved ||= hasReference
      ? offset.x !== 0 || offset.y !== 0
      : roundedOffset(offset.x) !== 0 || roundedOffset(offset.y) !== 0;
    const dx = grid ? Math.round(offset.x / grid.width) * grid.width : offset.x;
    const dy = grid ? Math.round(offset.y / grid.height) * grid.height : offset.y;
    this.offset = { x: dx, y: dy };
    if (dx === 0 && dy === 0) return this.timeline;
    let moved = false;
    const frames = this.timeline.frames.map((frame) => {
      let changed = false;
      const cels = frame.cels.map((cel, layer) => {
        if (!cel || !this.targets.get(layer)?.has(identity(cel))) return cel;
        const precise = !!(this.timeline.layers[layer].flags & LAYER_REFERENCE);
        const x = precise ? dx : roundedOffset(dx),
          y = precise ? dy : roundedOffset(dy);
        if (x === 0 && y === 0) return cel;
        changed = true;
        moved = true;
        return {
          ...cel,
          x: cel.x + x,
          y: cel.y + y,
          ...(cel.preciseBounds
            ? {
                preciseBounds: {
                  ...cel.preciseBounds,
                  x: cel.preciseBounds.x + x,
                  y: cel.preciseBounds.y + y,
                },
              }
            : {}),
        };
      });
      return changed ? { ...frame, cels } : frame;
    });
    return moved ? { ...this.timeline, frames } : this.timeline;
  }

  hasMoved(): boolean {
    return this.moved;
  }

  moveSelection(selection: PixelMask | null): PixelMask | null {
    const x = roundedOffset(this.offset.x),
      y = roundedOffset(this.offset.y);
    return selection && (x !== 0 || y !== 0)
      ? { ...selection, x: selection.x + x, y: selection.y + y }
      : selection;
  }
}
