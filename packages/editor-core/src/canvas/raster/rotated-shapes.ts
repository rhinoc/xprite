/** MIT-licensed doc/algo.cpp rotated rational-conic raster port. */
import type { Point } from "$/base/primitives";
import { line } from "$/canvas/raster/geometry";
type Plot = (x: number, y: number) => void;
function conic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  plot: Plot,
): void {
  let sx = x2 - x1,
    sy = y2 - y1,
    dx = x0 - x2,
    dy = y0 - y2,
    xx = x0 - x1,
    yy = y0 - y1,
    xy = xx * sy + yy * sx,
    cur = xx * sy - yy * sx;
  if (cur !== 0 && w > 0) {
    if (sx * sx + sy * sy > xx * xx + yy * yy) {
      x2 = x0;
      x0 -= dx;
      y2 = y0;
      y0 -= dy;
      cur = -cur;
    }
    xx = Math.trunc(2 * (4 * w * sx * xx + dx * dx));
    yy = Math.trunc(2 * (4 * w * sy * yy + dy * dy));
    sx = x0 < x2 ? 1 : -1;
    sy = y0 < y2 ? 1 : -1;
    xy = -2 * sx * sy * (2 * w * xy + dx * dy);
    if (cur * sx * sy < 0) {
      xx = -xx;
      yy = -yy;
      xy = -xy;
      cur = -cur;
    }
    dx = Math.trunc(4 * w * (x1 - x0) * sy * cur + xx / 2 + xy);
    dy = Math.trunc(4 * w * (y0 - y1) * sx * cur + yy / 2 + xy);
    if (w < 0.5 && (dy > xy || dx < xy)) {
      cur = (w + 1) / 2;
      w = Math.sqrt(w);
      xy = 1 / (w + 1);
      sx = Math.floor(((x0 + 2 * w * x1 + x2) * xy) / 2 + 0.5);
      sy = Math.floor(((y0 + 2 * w * y1 + y2) * xy) / 2 + 0.5);
      dx = Math.floor((w * x1 + x0) * xy + 0.5);
      dy = Math.floor((y1 * w + y0) * xy + 0.5);
      conic(x0, y0, dx, dy, sx, sy, cur, plot);
      dx = Math.floor((w * x1 + x2) * xy + 0.5);
      dy = Math.floor((y1 * w + y2) * xy + 0.5);
      conic(sx, sy, dx, dy, x2, y2, cur, plot);
      return;
    }
    let err = dx + dy - xy;
    do {
      plot(x0, y0);
      if (x0 === x2 && y0 === y2) return;
      x1 = 2 * err > dy ? 1 : 0;
      y1 = 2 * (err + yy) < -dy ? 1 : 0;
      if (2 * err < dx || y1) {
        y0 += sy;
        dy = Math.trunc(dy + xy);
        dx += xx;
        err += dx;
      }
      if (2 * err > dx || x1) {
        x0 += sx;
        dx = Math.trunc(dx + xy);
        dy += yy;
        err += dy;
      }
    } while (dy <= xy && dx >= xy);
  }
  line(x0, y0, x2, y2, plot);
}
export function rotatedEllipsePixels(
  start: Point,
  end: Point,
  angle: number,
  filled: boolean,
  axisEllipse: (a: Point, b: Point, filled: boolean) => Point[],
): Point[] {
  const x0 = Math.min(start.x, end.x),
    x1 = Math.max(start.x, end.x),
    y0 = Math.min(start.y, end.y),
    y1 = Math.max(start.y, end.y);
  const cx = Math.trunc((x0 + x1) / 2),
    cy = Math.trunc((y0 + y1) / 2);
  let a = Math.trunc((x1 - x0) / 2),
    b = Math.trunc((y1 - y0) / 2);
  let xd = a * a,
    yd = b * b;
  const s = Math.sin(angle);
  let zd = (xd - yd) * s;
  xd = Math.sqrt(xd - zd * s);
  yd = Math.sqrt(yd + zd * s);
  if (xd === 0 || yd === 0) return axisEllipse(start, end, filled);
  a = Math.floor(xd + 0.5);
  b = Math.floor(yd + 0.5);
  zd = 4 * ((zd * a * b) / (xd * yd)) * Math.cos(angle);
  const left = cx - a,
    right = cx + a,
    top = cy - b,
    bottom = cy + b;
  if (zd === 0) return axisEllipse({ x: left, y: top }, { x: right, y: bottom }, filled);
  xd = right - left;
  yd = bottom - top;
  let weight = xd * yd;
  if (weight !== 0) weight = (weight - zd) / (weight + weight);
  weight = Math.max(0, Math.min(1, weight));
  xd = Math.floor(weight * xd + 0.5);
  yd = Math.floor(weight * yd + 0.5);
  const pixels: Point[] = [],
    plot = (x: number, y: number) => pixels.push({ x, y });
  conic(left, top + yd, left, top, left + xd, top, 1 - weight, plot);
  conic(left, top + yd, left, bottom, right - xd, bottom, weight, plot);
  conic(right, bottom - yd, right, bottom, right - xd, bottom, 1 - weight, plot);
  conic(right, bottom - yd, right, top, left + xd, top, weight, plot);
  if (!filled) return pixels;
  const rows = new Map<number, [number, number]>();
  for (const p of pixels) {
    const row = rows.get(p.y);
    if (row) {
      row[0] = Math.min(row[0], p.x);
      row[1] = Math.max(row[1], p.x);
    } else rows.set(p.y, [p.x, p.x]);
  }
  const out: Point[] = [];
  for (const [y, [x, end]] of rows) for (let px = x; px <= end; px++) out.push({ x: px, y });
  return out;
}
export function rotatedRectanglePath(start: Point, end: Point, angle: number): Point[] {
  const x0 = Math.min(start.x, end.x),
    x1 = Math.max(start.x, end.x),
    y0 = Math.min(start.y, end.y),
    y1 = Math.max(start.y, end.y),
    cx = Math.trunc((x0 + x1) / 2),
    cy = Math.trunc((y0 + y1) / 2),
    a = Math.trunc((x1 - x0 + 1) / 2),
    b = Math.trunc((y1 - y0 + 1) / 2),
    s = -Math.sin(angle),
    c = Math.cos(angle),
    ac = Math.trunc(a * c),
    bs = Math.trunc(b * s),
    as = Math.trunc(a * s),
    bc = Math.trunc(b * c);
  return [
    { x: cx - ac - bs, y: cy + as - bc },
    { x: cx + ac - bs, y: cy - as - bc },
    { x: cx + ac + bs, y: cy - as + bc },
    { x: cx - ac + bs, y: cy + as + bc },
  ];
}
