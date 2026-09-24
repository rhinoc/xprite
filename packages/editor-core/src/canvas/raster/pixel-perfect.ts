import type { Brush, PixelMask, Point } from "$/base/primitives";
import { brushMask, line } from "$/canvas/raster/geometry";
export type PixelPerfectOperation = {
  kind: "paint" | "save" | "restore";
  point: Point;
};
export enum PixelPerfectTracePolicy {
  Accumulate = "accumulate",
  Last = "last",
}
export interface PixelPerfectPathOptions {
  /** Stamp geometry can veto thinning when removing a line-brush center leaves a hole. */
  brush?: Brush;
  brushAngleStatic?: boolean;
}
export function usesCornerThinning(brush: Pick<Brush, "shape">, brushAngleStatic = true): boolean {
  return brush.shape !== "line" || brushAngleStatic;
}
const equal = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
function covers(mask: PixelMask, center: Point, x: number, y: number): boolean {
  const mx = x - Math.floor(center.x) - mask.x;
  const my = y - Math.floor(center.y) - mask.y;
  return (
    mx >= 0 && my >= 0 && mx < mask.width && my < mask.height && !!mask.data[my * mask.width + mx]
  );
}
function touchesStamp(mask: PixelMask, center: Point, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if (covers(mask, center, x + dx, y + dy)) return true;
  return false;
}
/** A line brush may leave a gap at a turn. Thin its center only when every
 * omitted stamp pixel remains connected to one of the neighboring stamps. */
function lineStampIsRedundant(before: Point, point: Point, after: Point, mask: PixelMask): boolean {
  const px = Math.floor(point.x),
    py = Math.floor(point.y);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (!mask.data[y * mask.width + x]) continue;
      const sx = px + mask.x + x,
        sy = py + mask.y + y;
      if (!touchesStamp(mask, before, sx, sy) && !touchesStamp(mask, after, sx, sy)) return false;
    }
  }
  return true;
}
function isOrthogonalTurn(points: readonly Point[], index: number): boolean {
  const before = points[index - 1],
    point = points[index],
    after = points[index + 1];
  return (
    (before.x === point.x || before.y === point.y) &&
    (after.x === point.x || after.y === point.y) &&
    before.x !== after.x &&
    before.y !== after.y
  );
}
/** Incremental pixel-center path simplifier. The most recent stamp is saved so
 * it can be rolled back if the next input turns it into a redundant L corner.
 * Raster and document mutation stays with the stroke consumers. */
export class PixelPerfectPath {
  private points: Point[] = [];
  private saved: { index: number; point: Point } | null = null;
  getPoints(): readonly Point[] {
    return this.points.map((point) => ({ ...point }));
  }
  join(
    stroke: readonly Point[],
    tracePolicy: PixelPerfectTracePolicy = PixelPerfectTracePolicy.Accumulate,
    options: PixelPerfectPathOptions = {},
  ): PixelPerfectOperation[] {
    const operations: PixelPerfectOperation[] = [];
    if (!stroke.length) return operations;
    if (tracePolicy === PixelPerfectTracePolicy.Last) {
      this.points = [];
      this.saved = null;
    }
    const emit = (kind: PixelPerfectOperation["kind"], point: Point) =>
      operations.push({ kind, point: { ...point } });
    if (stroke.length === 1) {
      if (!this.points.length) this.points = [{ ...stroke[0] }];
      emit("paint", stroke[0]);
      return operations;
    }
    if (equal(stroke[0], stroke[stroke.length - 1])) return operations;
    let next = this.points.length;
    const inspectFrom = Math.max(0, this.points.length - 3);
    for (let c = 0; c + 1 < stroke.length; c++)
      line(stroke[c].x, stroke[c].y, stroke[c + 1].x, stroke[c + 1].y, (x, y) => {
        const point = { x, y },
          last = this.points[this.points.length - 1];
        if (!last || !equal(last, point)) this.points.push(point);
      });
    const brush = options.brush;
    const thinCorners = brush ? usesCornerThinning(brush, options.brushAngleStatic) : true;
    const lineMask = brush?.shape === "line" && thinCorners ? brushMask(brush) : null;
    if (thinCorners) {
      let c = Math.max(1, inspectFrom);
      while (c + 1 < this.points.length) {
        const point = this.points[c];
        if (
          isOrthogonalTurn(this.points, c) &&
          (!lineMask ||
            lineStampIsRedundant(this.points[c - 1], point, this.points[c + 1], lineMask))
        ) {
          if (this.saved?.index === c && equal(this.saved.point, point)) emit("restore", point);
          if (c === next - 1) next--;
          this.points.splice(c, 1);
          // The path now contains a new neighbor at this index; leave it for
          // the next sample so one corner decision cannot cascade backward.
          c++;
        } else {
          c++;
        }
      }
    }
    for (let c = next; c < this.points.length; c++) {
      const point = this.points[c];
      if (tracePolicy === PixelPerfectTracePolicy.Last && c === 0) continue;
      if (tracePolicy === PixelPerfectTracePolicy.Accumulate && c === this.points.length - 1) {
        this.saved = { index: c, point: { ...point } };
        emit("save", point);
      }
      emit("paint", point);
    }
    return operations;
  }
}
