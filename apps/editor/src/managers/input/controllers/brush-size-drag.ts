import type { Point } from "@xprite/editor-core";

const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 64;

/** Native drag vectors describe screen distance per unit, with positive Y up.
 * Every sample is relative to the starting value, including after clamping. */
export class CanvasBrushSizeDrag {
  constructor(
    readonly origin: Point,
    private readonly initialSize: number,
    private readonly vectors: readonly Point[],
  ) {}

  move(point: Point): number {
    const dx = point.x - this.origin.x;
    const dy = point.y - this.origin.y;
    let size = this.initialSize;
    for (const vector of this.vectors) {
      const magnitudeSquared = vector.x * vector.x + vector.y * vector.y;
      if (!magnitudeSquared) continue;
      size = Math.max(
        MIN_BRUSH_SIZE,
        Math.min(
          MAX_BRUSH_SIZE,
          Math.trunc(this.initialSize + (dx * vector.x - dy * vector.y) / magnitudeSquared),
        ),
      );
    }
    return size;
  }
}
