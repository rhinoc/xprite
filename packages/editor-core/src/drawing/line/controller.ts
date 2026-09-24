import type { Point } from "$/base/primitives";

const pixel = (point: Point): Point => ({ x: Math.floor(point.x), y: Math.floor(point.y) });
const sign = (value: number) => (value >= 0 ? 1 : -1);

function snapByAngle(start: Point, end: Point): Point {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const min = Math.min(Math.abs(dx), Math.abs(dy)),
    max = Math.max(Math.abs(dx), Math.abs(dy));
  const angle = (Math.abs(Math.atan(-dy / dx)) * 180) / Math.PI;
  if (angle < 18) return { x: end.x, y: start.y };
  if (angle < 36)
    return { x: start.x + sign(dx) * max, y: start.y + Math.trunc((sign(dy) * max) / 2) };
  if (angle < 54) return { x: start.x + sign(dx) * min, y: start.y + sign(dy) * min };
  if (angle < 72)
    return { x: start.x + Math.trunc((sign(dx) * max) / 2), y: start.y + sign(dy) * max };
  return { x: start.x, y: end.y };
}

/** LineFreehandController's incremental segment used by Shift+freehand. */
export class AsepriteLineFreehandController {
  private readonly start: Point;
  private last: Point;

  constructor(start: Point) {
    this.start = pixel(start);
    this.last = { ...this.start };
  }

  getStartPoint(): Point {
    return { ...this.start };
  }
  getLastPoint(): Point {
    return { ...this.last };
  }

  move(point: Point, snapAngle = false): Point[] {
    const target = pixel(point);
    const next = snapAngle ? snapByAngle(this.start, target) : target;
    const segment = [{ ...this.last }, next];
    this.last = next;
    return segment;
  }
}
