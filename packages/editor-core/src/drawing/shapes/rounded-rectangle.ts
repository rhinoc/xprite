/** Integer circle rasterization follows the MIT doc/algo.cpp library.
 * Copyright (c) 2018-present Igara Studio S.A.
 * Copyright (c) 2001-2018 David Capello
 * The applicable permission notice is in LICENSES/aseprite-doc.txt. */
import type { Point } from "$/base/primitives";
import { line, polygon } from "$/canvas/raster/geometry";
import { rotatedRectanglePath } from "$/canvas/raster/rotated-shapes";
import { normalizeCornerRadius } from "$/drawing/shapes/modifiers";

const ROTATION_THRESHOLD = 0.001;
const QUARTER_TURN = Math.PI / 2;
const FULL_TURN = Math.PI * 2;

function circleSteps(radius: number, visit: (x: number, y: number) => void): void {
  let x = -radius;
  let y = 0;
  let error = 2 - 2 * radius;
  do {
    visit(x, y);
    const previousError = error;
    if (previousError <= y) error += ++y * 2 + 1;
    if (previousError > x || error > y) error += ++x * 2 + 1;
  } while (x < 0);
}

function normalizedAngle(angle: number): number {
  const value = angle % FULL_TURN;
  return value > Math.PI ? value - FULL_TURN : value < -Math.PI ? value + FULL_TURN : value;
}

function quadrant(angle: number): number {
  return angle <= 0 && angle > -QUARTER_TURN
    ? 4
    : angle <= -QUARTER_TURN && angle >= -Math.PI
      ? 3
      : angle > 0 && angle < QUARTER_TURN
        ? 1
        : 2;
}

function circleArc(
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  plot: (x: number, y: number) => void,
): void {
  const start = normalizedAngle(startAngle);
  const end = normalizedAngle(endAngle);
  const firstQuadrant = quadrant(start);
  const lastQuadrant = quadrant(end);
  const startX = Math.trunc(Math.cos(start) * radius);
  const endX = Math.trunc(Math.cos(end) * radius);
  const included = new Set<number>();
  if (firstQuadrant === lastQuadrant && start > end) {
    for (let q = 1; q <= 4; q++) included.add(q);
  } else {
    for (let offset = 0; offset < 4; offset++) {
      const q = ((firstQuadrant - 1 + offset) % 4) + 1;
      included.add(q);
      if (q === lastQuadrant) break;
    }
  }
  circleSteps(radius, (x, y) => {
    const candidates = [
      { x: -x, y },
      { x: -y, y: -x },
      { x, y: -y },
      { x: y, y: x },
    ];
    candidates.forEach((point, index) => {
      const q = index + 1;
      if (!included.has(q)) return;
      const descending = q <= 2;
      const afterStart = descending ? point.x <= startX : point.x >= startX;
      const beforeEnd = descending ? point.x >= endX : point.x <= endX;
      const visible =
        firstQuadrant === q && lastQuadrant === q
          ? start <= end
            ? afterStart && beforeEnd
            : afterStart || beforeEnd
          : (firstQuadrant !== q || afterStart) && (lastQuadrant !== q || beforeEnd);
      if (visible) plot(center.x + point.x, center.y + point.y);
    });
  });
}

/** Inclusive integer rectangle, with the same clipped circular corners for
 * paint and marquee. Geometry is rounded before clipping to the canvas. */
export function roundedRectanglePixels(
  start: Point,
  end: Point,
  requestedRadius: number,
  filled: boolean,
  angle = 0,
  plotPixel?: (x: number, y: number) => void,
): Point[] {
  const left = Math.min(Math.floor(start.x), Math.floor(end.x));
  const right = Math.max(Math.floor(start.x), Math.floor(end.x));
  const top = Math.min(Math.floor(start.y), Math.floor(end.y));
  const bottom = Math.max(Math.floor(start.y), Math.floor(end.y));
  const radius = Math.min(
    normalizeCornerRadius(requestedRadius),
    Math.trunc(Math.min(right - left + 1, bottom - top + 1) / 2),
  );
  const pixels: Point[] = [];
  const plot = (x: number, y: number) => {
    if (plotPixel) plotPixel(x, y);
    else pixels.push({ x, y });
  };
  const span = (x: number, y: number, endX: number) => {
    for (let px = x; px <= endX; px++) plot(px, y);
  };
  if (Math.abs(angle) >= ROTATION_THRESHOLD && !radius) {
    const path = rotatedRectanglePath(start, end, angle);
    if (filled)
      polygon(
        path.map((point) => [point.x, point.y] as const),
        span,
      );
    else
      path.forEach((point, index) => {
        const next = path[(index + 1) % path.length];
        line(point.x, point.y, next.x, next.y, plot);
      });
    return pixels;
  }
  if (Math.abs(angle) < ROTATION_THRESHOLD) {
    if (radius) {
      circleSteps(radius, (x, y) => {
        if (filled) {
          span(right - radius, bottom - radius + y, right - radius - x);
          span(left + radius - y, bottom - radius - x, left + radius);
          span(left + radius + x, top + radius - y, left + radius);
          span(right - radius, top + radius + x, right - radius + y);
        } else {
          plot(right - radius - x, bottom - radius + y);
          plot(left + radius - y, bottom - radius - x);
          plot(left + radius + x, top + radius - y);
          plot(right - radius + y, top + radius + x);
        }
      });
    }
    if (filled) {
      for (let y = top; y <= bottom; y++) {
        const inset = y < top + radius || y > bottom - radius ? radius : 0;
        span(left + inset, y, right - inset);
      }
    } else {
      span(left + radius, top, right - radius);
      span(left + radius, bottom, right - radius);
      for (let y = top + radius; y <= bottom - radius; y++) {
        plot(left, y);
        plot(right, y);
      }
    }
    return pixels;
  }

  const center = { x: Math.trunc((left + right) / 2), y: Math.trunc((top + bottom) / 2) };
  const halfWidth = Math.trunc((right - left) / 2);
  const halfHeight = Math.trunc((bottom - top) / 2);
  const insideWidth = halfWidth - radius;
  const insideHeight = halfHeight - radius;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const rotate = (x: number, y: number): Point => ({
    x: Math.trunc(center.x + x * cosine - y * sine),
    y: Math.trunc(center.y + x * sine + y * cosine),
  });
  const segments = [
    [rotate(-insideWidth, -halfHeight), rotate(insideWidth, -halfHeight)],
    [rotate(halfWidth, -insideHeight), rotate(halfWidth, insideHeight)],
    [rotate(insideWidth, halfHeight), rotate(-insideWidth, halfHeight)],
    [rotate(-halfWidth, insideHeight), rotate(-halfWidth, -insideHeight)],
  ];
  const centers = [
    rotate(insideWidth, -insideHeight),
    rotate(insideWidth, insideHeight),
    rotate(-insideWidth, insideHeight),
    rotate(-insideWidth, -insideHeight),
  ];
  if (filled) {
    const path = segments.flatMap((segment, index) => [...segment, centers[index]]);
    polygon(
      path.map((point) => [point.x, point.y] as const),
      span,
    );
    for (const corner of centers) {
      circleSteps(radius, (x, y) => {
        span(corner.x, corner.y + y, corner.x - x);
        span(corner.x - y, corner.y - x, corner.x);
        span(corner.x + x, corner.y - y, corner.x);
        span(corner.x, corner.y + x, corner.x + y);
      });
    }
  } else {
    segments.forEach(([a, b], index) => {
      line(a.x, a.y, b.x, b.y, plot);
      circleArc(
        centers[index],
        radius,
        angle - QUARTER_TURN + index * QUARTER_TURN,
        angle + index * QUARTER_TURN,
        plot,
      );
    });
  }
  return pixels;
}
