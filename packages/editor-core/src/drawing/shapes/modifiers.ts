import type { Point } from "$/base/primitives";

export interface ShapeModifiers {
  squareAspect?: boolean;
  fromCenter?: boolean;
  rotate?: boolean;
  moveOrigin?: boolean;
  cornerRadius?: boolean;
}

type SnappedDirection = "horizontal" | "shallow" | "diagonal" | "steep" | "vertical";
type MirroredAxis = "x" | "y" | undefined;

const integerPoint = (point: Point): Point => ({ x: Math.floor(point.x), y: Math.floor(point.y) });
const directionSign = (value: number) => (value >= 0 ? 1 : -1);

function classifyLineDirection(dx: number, dy: number): SnappedDirection {
  // These five angle bands are the line-snap behavior in LibreSprite's GPLv2
  // TwoPointsController. The return value represents geometry, not C++ state.
  const degrees = (Math.abs(Math.atan(-dy / dx)) * 180) / Math.PI;
  if (degrees < 18) return "horizontal";
  if (degrees < 36) return "shallow";
  if (degrees < 54) return "diagonal";
  if (degrees < 72) return "steep";
  return "vertical";
}

function aspectConstrainedPoint(anchor: Point, cursor: Point, snapByAngle: boolean) {
  const dx = cursor.x - anchor.x;
  const dy = cursor.y - anchor.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const smaller = Math.min(absX, absY);
  const larger = Math.max(absX, absY);

  if (!snapByAngle) {
    return {
      point: {
        x: anchor.x + directionSign(dx) * smaller,
        y: anchor.y + directionSign(dy) * smaller,
      },
      mirrorAxis: undefined as MirroredAxis,
    };
  }

  const direction = classifyLineDirection(dx, dy);
  switch (direction) {
    case "horizontal":
      return { point: { x: cursor.x, y: anchor.y }, mirrorAxis: undefined as MirroredAxis };
    case "shallow":
      return {
        point: {
          x: anchor.x + directionSign(dx) * larger,
          y: anchor.y + Math.trunc((directionSign(dy) * larger) / 2),
        },
        mirrorAxis: "x" as MirroredAxis,
      };
    case "diagonal":
      return {
        point: {
          x: anchor.x + directionSign(dx) * smaller,
          y: anchor.y + directionSign(dy) * smaller,
        },
        mirrorAxis: undefined as MirroredAxis,
      };
    case "steep":
      return {
        point: {
          x: anchor.x + Math.trunc((directionSign(dx) * larger) / 2),
          y: anchor.y + directionSign(dy) * larger,
        },
        mirrorAxis: "y" as MirroredAxis,
      };
    case "vertical":
      return { point: { x: anchor.x, y: cursor.y }, mirrorAxis: undefined as MirroredAxis };
  }
}

function rotationPivot(first: Point, points: readonly Point[], fromCenter: boolean): Point {
  if (fromCenter) return { ...first };
  return {
    x: Math.trunc((points[0].x + points[1].x) / 2),
    y: Math.trunc((points[0].y + points[1].y) / 2),
  };
}

/** Return the two corners of a diameter through pivot and cursor. */
function diameterAround(pivot: Point, cursor: Point): [Point, Point] {
  const radius = { x: cursor.x - pivot.x, y: cursor.y - pivot.y };
  return [
    { x: pivot.x - radius.x, y: pivot.y - radius.y },
    { x: pivot.x + radius.x, y: pivot.y + radius.y },
  ];
}

function centerExpandedCorners(
  anchor: Point,
  edge: Point,
  oddDiagonalAxis: MirroredAxis,
): [Point, Point] {
  const radius = { x: edge.x - anchor.x, y: edge.y - anchor.y };
  const opposite = { x: anchor.x - radius.x, y: anchor.y - radius.y };

  // A 1:2 or 2:1 line occupies an odd number of pixels along its long axis
  // after centering. Move the leading corner one pixel to balance raster bounds.
  if (oddDiagonalAxis === "x" && Math.abs(radius.x) > Math.abs(radius.y) && radius.x & 1)
    opposite.x += directionSign(radius.x);
  else if (oddDiagonalAxis === "y" && Math.abs(radius.x) < Math.abs(radius.y) && radius.y & 1)
    opposite.y += directionSign(radius.y);

  return [opposite, { x: anchor.x + radius.x, y: anchor.y + radius.y }];
}

/** Two-point gesture controller. The core square/from-center and origin-drag
 * rules are adapted from .refs/libresprite/src/app/tools/controllers.h. Rotation,
 * centered-gradient sampling, and odd-pixel diagonal balancing are independent
 * geometric additions for this editor. */
export class LibreSpriteTwoPointsController {
  points: Point[];
  angle = 0;
  gradientSeed: Point | undefined;
  cornerRadius: number;
  private radiusAdjustment: number | null = null;
  private first: Point;
  private center: Point;
  private last: Point;

  constructor(
    start: Point,
    readonly snapByAngle = false,
    private readonly rounded?: { cornerRadius: number },
  ) {
    this.first = integerPoint(start);
    this.center = { ...this.first };
    this.last = { ...this.first };
    this.points = [{ ...this.first }, { ...this.first }];
    this.cornerRadius = normalizeCornerRadius(rounded?.cornerRadius);
  }

  move(input: Point, modifiers: ShapeModifiers = {}) {
    const cursor = integerPoint(input);
    const delta = { x: cursor.x - this.last.x, y: cursor.y - this.last.y };
    this.last = cursor;

    if (modifiers.moveOrigin) {
      // LibreSprite MoveOriginCapability translates all control points by the
      // change since the prior pointer sample, then consumes this movement.
      for (const point of [...this.points, this.first, this.center]) {
        point.x += delta.x;
        point.y += delta.y;
      }
      if (this.gradientSeed) {
        this.gradientSeed.x += delta.x;
        this.gradientSeed.y += delta.y;
      }
      return;
    }

    if (this.rounded && modifiers.cornerRadius) {
      const [anchor, edge] = this.points;
      const limit = Math.trunc(
        Math.min(Math.abs(edge.x - anchor.x + 1), Math.abs(edge.y - anchor.y + 1)) / 2,
      );
      this.radiusAdjustment ??= Math.min(this.cornerRadius, limit);
      const inwardX = (edge.x - cursor.x) * directionSign(edge.x - anchor.x);
      const inwardY = (edge.y - cursor.y) * directionSign(edge.y - anchor.y);
      this.cornerRadius = Math.min(limit, Math.max(0, this.radiusAdjustment + inwardX + inwardY));
      return;
    }
    if (this.radiusAdjustment !== null) {
      this.radiusAdjustment = null;
      return;
    }

    if (!this.snapByAngle && modifiers.rotate) {
      this.center = rotationPivot(this.first, this.points, !!modifiers.fromCenter);
      this.angle = Math.atan2(cursor.y - this.center.y, cursor.x - this.center.x);
      return;
    }

    let edge = cursor;
    let diagonalAxis: MirroredAxis = undefined;
    if (modifiers.squareAspect) {
      const constrained = aspectConstrainedPoint(this.first, cursor, this.snapByAngle);
      edge = constrained.point;
      diagonalAxis = constrained.mirrorAxis;
    }

    let corners: [Point, Point];
    if (Math.abs(this.angle) > 0.001) {
      corners = diameterAround(this.center, edge);
    } else if (modifiers.fromCenter) {
      corners = centerExpandedCorners(this.first, edge, diagonalAxis);
    } else {
      corners = [{ ...this.first }, { ...edge }];
    }

    this.points = corners;
    this.gradientSeed = modifiers.fromCenter
      ? {
          x: Math.trunc((corners[0].x + corners[1].x) / 2),
          y: Math.trunc((corners[0].y + corners[1].y) / 2),
        }
      : undefined;
  }
}

export function normalizeCornerRadius(value: number | undefined): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value! : 0));
}

export const supportsCornerRadius = (tool: string) =>
  ["rectangle", "filled_rectangle", "marquee"].includes(tool);

export const isTwoPointShape = (tool: string) =>
  [
    "line",
    "rectangle",
    "filled_rectangle",
    "ellipse",
    "filled_ellipse",
    "gradient",
    "marquee",
    "elliptical_marquee",
  ].includes(tool);
