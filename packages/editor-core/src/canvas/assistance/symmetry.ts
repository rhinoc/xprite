import type { Point, PixelMask } from "$/base/primitives";
export type SymmetryMode = 0 | 1 | 2 | 3 | 4 | 8 | 12 | 15;
export type SymmetryIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export interface SymmetryOptions {
  mode: number;
  x: number;
  y: number;
  enabled?: boolean;
}
export interface SymmetryBrush {
  width: number;
  height: number;
  center: Point;
  floodFill?: boolean;
  dynamic?: boolean;
}
export interface SymmetryPoint extends Point {
  size?: number;
  symmetry?: SymmetryIndex;
}
export function resolveSymmetryMode(mode: number): SymmetryMode {
  mode &= 15;
  return (mode & 3 && mode & 12 ? 15 : mode) as SymmetryMode;
}
export function symmetryAxisPosition(initial: number, delta: number, extent: number): number {
  const n = initial + delta;
  return Math.max(1, Math.min(extent - 1, (Math.sign(n) * Math.floor(Math.abs(n) * 2 + 0.5)) / 2));
}
/** Aseprite Symmetry::generateStrokes preserves order and duplicate axis pixels;
 * overlap/opacity deduplication belongs to the ink's trace policy, not this stage. */
export function generateSymmetryStrokes<T extends SymmetryPoint>(
  stroke: readonly T[],
  options: SymmetryOptions,
  brush: SymmetryBrush,
): T[][] {
  const mode = options.enabled === false ? 0 : resolveSymmetryMode(options.mode),
    out: T[][] = [stroke.map((p) => ({ ...p, symmetry: 0 }))];
  const transform = (source: readonly T[], index: SymmetryIndex, doubleDiagonal = false): T[] =>
    source.map((p) => {
      const rotate = index >= 4;
      let width = brush.floodFill ? 1 : rotate ? brush.height : brush.width,
        height = brush.floodFill ? 1 : rotate ? brush.width : brush.height,
        cx = brush.floodFill ? 0 : rotate ? brush.center.y : brush.center.x,
        cy = brush.floodFill ? 0 : rotate ? brush.center.x : brush.center.y;
      if (brush.dynamic) {
        width = height = p.size ?? 1;
        cx = cy = (width - (width % 2)) / 2;
      }
      let x = p.x,
        y = p.y;
      if (index === 7) {
        let ax = options.y - Math.trunc(options.y) > 0 ? 1 : 0,
          ay = options.x - Math.trunc(options.x) > 0 ? 1 : 0;
        if (ax && ay) ax = ay = 0;
        x = -p.y + options.x + options.y - (width % 2 ? 1 : 0) + ax;
        y = -p.x + options.x + options.y - (height % 2 ? 1 : 0) + ay;
      } else if (index === 5) {
        x = p.y + options.x - options.y + (options.x - Math.trunc(options.x));
        y = p.x - options.x + options.y + (options.y - Math.trunc(options.y));
      } else if (index === 4 || index === 6) y = 2 * options.y - p.y - (height % 2 ? 1 : 0);
      else if (index === 1 || index === 3) {
        x = 2 * (options.x + cx) - p.x - width;
        if (doubleDiagonal) y = 2 * (options.y + cy) - p.y - height;
      } else y = 2 * (options.y + cy) - p.y - height;
      return { ...p, x: Math.trunc(x) || 0, y: Math.trunc(y) || 0, symmetry: index };
    });
  if (mode === 1 || mode === 3 || mode === 15) out.push(transform(stroke, 1));
  if (mode === 2 || mode === 3 || mode === 15) {
    const y = transform(stroke, 2);
    out.push(y);
    if (mode !== 2) out.push(transform(y, 3));
  }
  if (mode === 4) out.push(transform(stroke, 7));
  if (mode === 8) out.push(transform(stroke, 5));
  if (mode === 12) {
    out.push(transform(stroke, 7), transform(stroke, 5), transform(stroke, 3, true));
  }
  if (mode === 15) {
    const a = transform(stroke, 5),
      b = transform(stroke, 7);
    out.push(a, transform(a, 4), b, transform(b, 6));
  }
  return out;
}
/** Brush bitmap orientation from doc::Brush::getSymmetryImage, including
 * diagonal transposition. Stamp bounds retain the document-space (possibly rotated) center. */
export function symmetryBrushMask(mask: PixelMask, index: SymmetryIndex): PixelMask {
  if (index === 0) return mask;
  const rotated = index >= 4,
    width = rotated ? mask.height : mask.width,
    height = rotated ? mask.width : mask.height,
    data = new Uint8Array(width * height);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      let xx = x,
        yy = y;
      if (index === 1 || index === 3) xx = mask.width - 1 - x;
      if (index === 2 || index === 3) yy = mask.height - 1 - y;
      if (index === 4) {
        xx = y;
        yy = mask.width - 1 - x;
      }
      if (index === 5) {
        xx = y;
        yy = x;
      }
      if (index === 6) {
        xx = mask.height - 1 - y;
        yy = x;
      }
      if (index === 7) {
        xx = mask.height - 1 - y;
        yy = mask.width - 1 - x;
      }
      data[yy * width + xx] = mask.data[y * mask.width + x];
    }
  return { x: rotated ? mask.y : mask.x, y: rotated ? mask.x : mask.y, width, height, data };
}
export interface SymmetryHandle {
  axis: "x" | "y";
  bounds: { x: number; y: number; width: number; height: number };
}
export function symmetryHandles(
  options: SymmetryOptions,
  origin: Point,
  zoom: number,
  canvas: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): SymmetryHandle[] {
  if (options.enabled === false || !options.mode) return [];
  const handles: SymmetryHandle[] = [],
    size = 5;
  const x = origin.x + options.x * zoom,
    y = origin.y + options.y * zoom,
    left = origin.x + canvas.x * zoom,
    top = origin.y + canvas.y * zoom,
    right = left + canvas.width * zoom,
    bottom = top + canvas.height * zoom;
  // Source part->width()/2 and height()/2 are INTEGER divisions before the
  // floating point position is truncated; using2.5 for a5px handle shifts it.
  if (options.mode & 13)
    for (const yy of [Math.max(top - size, 0), Math.min(bottom, viewport.height - size)])
      handles.push({
        axis: "x",
        bounds: {
          x: Math.trunc(x - Math.trunc(size / 2)),
          y: Math.trunc(yy),
          width: size,
          height: size,
        },
      });
  if (options.mode & 14)
    for (const xx of [Math.max(left - size, 0), Math.min(right, viewport.width - size)])
      handles.push({
        axis: "y",
        bounds: {
          x: Math.trunc(xx),
          y: Math.trunc(y - Math.trunc(size / 2)),
          width: size,
          height: size,
        },
      });
  return handles;
}
/** Clip before software line rasterization: huge sprites/zoom must not iterate
 * millions of offscreen pixels merely to draw a short visible axis. */
export function clipSymmetryLine(
  from: Point,
  to: Point,
  rect: { x: number; y: number; width: number; height: number },
): [Point, Point] | null {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  let lo = 0,
    hi = 1;
  const p = [-dx, dx, -dy, dy],
    q = [
      from.x - rect.x,
      rect.x + rect.width - 1 - from.x,
      from.y - rect.y,
      rect.y + rect.height - 1 - from.y,
    ];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  return [
    { x: Math.trunc(from.x + lo * dx), y: Math.trunc(from.y + lo * dy) },
    { x: Math.trunc(from.x + hi * dx), y: Math.trunc(from.y + hi * dy) },
  ];
}
