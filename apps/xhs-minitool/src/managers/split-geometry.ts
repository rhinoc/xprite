/**
 * Geometry of the before/after split, in export units. The line is described by its angle
 * (degrees, counter-clockwise from vertical, -90 to 90) and its position (0 to 1 across the
 * visible picture, measured along the line's normal). The pixelated side is the normal's side,
 * or the other one when the sides are swapped.
 */
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export enum SplitLine {
  Thin = "thin",
  Thick = "thick",
  Steps = "steps",
  None = "none",
}

export interface SplitState {
  angle: number;
  position: number;
  line: SplitLine;
  labels: boolean;
  /** The original on the normal's side instead of the pixelated picture. */
  swapped: boolean;
}

/** A new photo opens with a straight vertical split at the centre and the pixel-stepped line. */
export const DEFAULT_SPLIT: Readonly<SplitState> = {
  angle: 0,
  position: 0.5,
  line: SplitLine.Steps,
  labels: false,
  swapped: false,
};

const SPLIT_ANGLE_LIMIT = 90;
/** Rotations land on these angles when they come within the snap distance. */
const SNAP_ANGLES = [-90, -45, 0, 45, 90];
const SNAP_DEGREES = 3;
/** Far enough outside any composition that clipped edges never show. */
const FAR = 100000;

/** Whole-block placement of a pixelated picture: `cell` export units per block. */
export interface Placement {
  x: number;
  y: number;
  cell: number;
  columns: number;
  rows: number;
}

export function placementRect(placement: Placement): Rect {
  return {
    x: placement.x,
    y: placement.y,
    width: placement.columns * placement.cell,
    height: placement.rows * placement.cell,
  };
}

export function intersectRects(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Along the line, pointing up at 0°. */
export function splitAxis(angle: number): Point {
  const a = radians(angle);
  return { x: -Math.sin(a), y: -Math.cos(a) };
}

/** Across the line, pointing right at 0°. */
function splitNormal(angle: number): Point {
  const a = radians(angle);
  return { x: Math.cos(a), y: -Math.sin(a) };
}

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const center = (rect: Rect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

/** Half the rectangle's extent along the normal: the furthest the line can move from the centre. */
function reach(rect: Rect, normal: Point) {
  return (Math.abs(normal.x) * rect.width + Math.abs(normal.y) * rect.height) / 2;
}

/** A point on the line (the one closest to the rectangle's centre). */
function splitOrigin(split: Pick<SplitState, "angle" | "position">, rect: Rect): Point {
  const normal = splitNormal(split.angle);
  const offset = (clamp(split.position, 0, 1) - 0.5) * 2 * reach(rect, normal);
  const middle = center(rect);
  return { x: middle.x + normal.x * offset, y: middle.y + normal.y * offset };
}

/** The part of the line inside the rectangle, from its upper end; null when it misses. */
export function splitSegment(
  split: Pick<SplitState, "angle" | "position">,
  rect: Rect,
): [Point, Point] | null {
  const origin = splitOrigin(split, rect);
  const axis = splitAxis(split.angle);
  let low = -Infinity;
  let high = Infinity;
  const edges: [number, number, number, number][] = [
    [axis.x, origin.x, rect.x, rect.x + rect.width],
    [axis.y, origin.y, rect.y, rect.y + rect.height],
  ];
  for (const [direction, start, min, max] of edges) {
    if (Math.abs(direction) < 1e-9) {
      if (start < min - 1e-6 || start > max + 1e-6) return null;
      continue;
    }
    const a = (min - start) / direction;
    const b = (max - start) / direction;
    low = Math.max(low, Math.min(a, b));
    high = Math.min(high, Math.max(a, b));
  }
  if (low > high) return null;
  const at = (t: number) => ({ x: origin.x + axis.x * t, y: origin.y + axis.y * t });
  return [at(high), at(low)];
}

/** Where the move handle sits: the middle of the visible part of the line. */
export function splitHandle(split: Pick<SplitState, "angle" | "position">, rect: Rect): Point {
  const segment = splitSegment(split, rect);
  if (!segment) return splitOrigin(split, rect);
  return { x: (segment[0].x + segment[1].x) / 2, y: (segment[0].y + segment[1].y) / 2 };
}

/** The position that puts the line through `point` at the given angle. */
export function positionThrough(angle: number, point: Point, rect: Rect): number {
  const normal = splitNormal(angle);
  const extent = reach(rect, normal);
  if (extent <= 0) return 0.5;
  const middle = center(rect);
  const offset = dot({ x: point.x - middle.x, y: point.y - middle.y }, normal);
  return clamp(offset / (2 * extent) + 0.5, 0, 1);
}

/** The position after dragging the line by `delta` from `start`. */
export function movedPosition(
  split: Pick<SplitState, "angle" | "position">,
  delta: Point,
  rect: Rect,
): number {
  const normal = splitNormal(split.angle);
  const extent = reach(rect, normal);
  if (extent <= 0) return split.position;
  return clamp(split.position + dot(delta, normal) / (2 * extent), 0, 1);
}

/**
 * Bring an angle into -90…90. Turning the line past vertical-up flips its direction, so the
 * sides swap to keep each picture where it was.
 */
export function normalizeAngle(angle: number): { angle: number; flipped: boolean } {
  let value = angle;
  let flipped = false;
  while (value > SPLIT_ANGLE_LIMIT) {
    value -= 180;
    flipped = !flipped;
  }
  while (value < -SPLIT_ANGLE_LIMIT) {
    value += 180;
    flipped = !flipped;
  }
  // -90° and 90° are the same line; keep the sides as they are at 90°.
  if (value === -SPLIT_ANGLE_LIMIT && angle !== -SPLIT_ANGLE_LIMIT) {
    value = SPLIT_ANGLE_LIMIT;
    flipped = !flipped;
  }
  return { angle: Math.round(value * 10) / 10, flipped };
}

export function snapAngle(angle: number): number {
  for (const target of SNAP_ANGLES) if (Math.abs(angle - target) <= SNAP_DEGREES) return target;
  return Math.round(angle);
}

/** Rotate the line about `pivot` (the handle), keeping it through that point. */
export function rotateSplit(
  split: SplitState,
  angle: number,
  pivot: Point,
  rect: Rect,
): SplitState {
  const next = normalizeAngle(angle);
  return {
    ...split,
    angle: next.angle,
    swapped: next.flipped ? !split.swapped : split.swapped,
    position: positionThrough(next.angle, pivot, rect),
  };
}

/**
 * The angle the rotate knob asks for when dragged to `point` around `pivot`. `direction` is +1
 * while the knob sits along the axis and -1 on the other end of the line.
 */
export function knobAngle(pivot: Point, point: Point, direction: number): number {
  const dx = (point.x - pivot.x) * direction;
  const dy = (point.y - pivot.y) * direction;
  return (Math.atan2(-dx, -dy) * 180) / Math.PI;
}

/** Signed side of a point: positive on the pixelated side. */
function pixelSide(split: SplitState, origin: Point, point: Point) {
  const normal = splitNormal(split.angle);
  const side = dot({ x: point.x - origin.x, y: point.y - origin.y }, normal);
  return split.swapped ? -side : side;
}

export interface SplitShape {
  /** Closed polygon covering the pixelated side (clip it to the picture). */
  pixels: Point[];
  /** The divider to stroke. */
  line: Point[];
}

/**
 * The pixelated side and the divider. The stepped line follows block edges: each row (or column,
 * for lines closer to horizontal) switches at the block edge nearest the straight line.
 */
export function splitShape(split: SplitState, rect: Rect, placement: Placement): SplitShape {
  const origin = splitOrigin(split, rect);
  const axis = splitAxis(split.angle);
  const normal = splitNormal(split.angle);
  const sign = split.swapped ? -1 : 1;
  if (split.line === SplitLine.Steps) {
    const { cell } = placement;
    const steps: Point[] = [];
    if (Math.abs(axis.y) >= Math.SQRT1_2) {
      const first = Math.max(0, Math.floor((rect.y - placement.y) / cell));
      const last = Math.min(
        placement.rows - 1,
        Math.ceil((rect.y + rect.height - placement.y) / cell) - 1,
      );
      for (let row = first; row <= last; row += 1) {
        const top = placement.y + row * cell;
        const middle = top + cell / 2;
        const x = origin.x + ((middle - origin.y) / axis.y) * axis.x;
        const snapped = placement.x + Math.round((x - placement.x) / cell) * cell;
        steps.push({ x: snapped, y: top }, { x: snapped, y: top + cell });
      }
      if (steps.length) {
        const far = sign * normal.x > 0 ? FAR : -FAR;
        return {
          line: steps,
          pixels: [{ x: far, y: steps[0].y }, ...steps, { x: far, y: steps[steps.length - 1].y }],
        };
      }
    } else {
      const first = Math.max(0, Math.floor((rect.x - placement.x) / cell));
      const last = Math.min(
        placement.columns - 1,
        Math.ceil((rect.x + rect.width - placement.x) / cell) - 1,
      );
      for (let column = first; column <= last; column += 1) {
        const left = placement.x + column * cell;
        const middle = left + cell / 2;
        const y = origin.y + ((middle - origin.x) / axis.x) * axis.y;
        const snapped = placement.y + Math.round((y - placement.y) / cell) * cell;
        steps.push({ x: left, y: snapped }, { x: left + cell, y: snapped });
      }
      if (steps.length) {
        const far = sign * normal.y > 0 ? FAR : -FAR;
        return {
          line: steps,
          pixels: [{ x: steps[0].x, y: far }, ...steps, { x: steps[steps.length - 1].x, y: far }],
        };
      }
    }
  }
  const along = (t: number, across = 0): Point => ({
    x: origin.x + axis.x * t + normal.x * across * sign,
    y: origin.y + axis.y * t + normal.y * across * sign,
  });
  return {
    line: [along(FAR), along(-FAR)],
    pixels: [along(FAR), along(FAR, FAR), along(-FAR, FAR), along(-FAR)],
  };
}

export enum Corner {
  TopLeft = "top-left",
  TopRight = "top-right",
  BottomLeft = "bottom-left",
  BottomRight = "bottom-right",
}

/** The corner furthest into each side, for the 原图 and 像素化 labels; ties prefer the bottom. */
export function labelCorners(split: SplitState, rect: Rect): { original: Corner; pixels: Corner } {
  const origin = splitOrigin(split, rect);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const corners: [Corner, Point][] = [
    [Corner.BottomLeft, { x: rect.x, y: bottom }],
    [Corner.BottomRight, { x: right, y: bottom }],
    [Corner.TopLeft, { x: rect.x, y: rect.y }],
    [Corner.TopRight, { x: right, y: rect.y }],
  ];
  const side = (point: Point) => pixelSide(split, origin, point);
  let original = corners[0];
  let pixels = corners[0];
  for (const corner of corners) {
    if (side(corner[1]) < side(original[1]) - 1) original = corner;
    if (side(corner[1]) > side(pixels[1]) + 1) pixels = corner;
  }
  return { original: original[0], pixels: pixels[0] };
}
