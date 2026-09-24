/** Full-size brush raster ported from doc/brush.cpp, doc/algo.cpp and algorithm/polygon.cpp. */
import type { Brush, BrushImage, PixelMask, Point as RasterPoint } from "$/base/primitives";
type Point = readonly [number, number];
const MAX_FULL_SIZE_BRUSH_SIZE = 64;
const FULL_SIZE_BRUSH_ELLIPSE_EXTRA_OFFSET_SIZES = [8, 12, 22] as const;

export function line(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plot: (x: number, y: number) => void,
) {
  const dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1,
    dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    const e2 = 2 * err;
    if (e2 >= dy) {
      if (x0 === x1) break;
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      if (y0 === y1) break;
      err += dx;
      y0 += sy;
    }
  }
}
/** Expand a path into its deduplicated Bresenham centerline pixels. */
export function lineStrokePoints(points: readonly RasterPoint[]): RasterPoint[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const centers: RasterPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    line(
      Math.floor(points[i - 1].x),
      Math.floor(points[i - 1].y),
      Math.floor(points[i].x),
      Math.floor(points[i].y),
      (x, y) => {
        const previous = centers[centers.length - 1];
        if (!previous || previous.x !== x || previous.y !== y) centers.push({ x, y });
      },
    );
  }
  return centers;
}
function ellipse(
  size: number,
  span: (x: number, y: number, end: number) => void,
  extraOffsetSizes: readonly number[],
) {
  let x0 = 0,
    y0 = 0,
    x1 = size - 1,
    y1 = size - 1;
  let extra = extraOffsetSizes.includes(size) ? 1 : 0;
  if (size > 5 && size % 2 === 0) extra--;
  x1 -= extra;
  y1 -= extra;
  let a = x1 - x0,
    b = y1 - y0,
    b1 = b & 1;
  let dx = 4 * (1 - a) * b * b,
    dy = 4 * (b1 + 1) * a * a,
    err = dx + dy + b1 * a * a;
  y0 += Math.trunc((b + 1) / 2);
  y1 = y0 - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;
  const initialY0 = y0,
    initialY1 = y1,
    initialX1 = x1 + extra;
  do {
    span(x0, y0 + extra, x1 + extra);
    span(x0, y1, x1 + extra);
    const e2 = 2 * err;
    if (e2 <= dy) {
      y0++;
      y1--;
      dy += a;
      err += dy;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++;
      x1--;
      dx += b1;
      err += dx;
    }
  } while (x0 <= x1);
  while (y0 + extra - y1 + 1 <= size) {
    span(x0 - 1, y0 + extra, x0 - 1);
    span(x1 + 1 + extra, y0 + extra, x1 + 1 + extra);
    y0++;
    span(x0 - 1, y1, x0 - 1);
    span(x1 + 1 + extra, y1--, x1 + 1 + extra);
  }
  if (extra > 0) for (let y = initialY1 + 1; y < initialY0 + extra; y++) span(0, y, initialX1);
}
export function polygon(vertices: Point[], span: (x: number, y: number, end: number) => void) {
  const points: Point[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    line(...a, ...b, (x, y) => {
      const last = points[points.length - 1];
      if (!last || last[0] !== x || last[1] !== y) points.push([x, y]);
    });
  }
  if (points.length > 1) points.pop();
  const ymin = Math.min(...vertices.map((p) => p[1])),
    ymax = Math.max(...vertices.map((p) => p[1]));
  for (let y = ymin; y <= ymax; y++) {
    const pairs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      let a = points[(i + points.length - 1) % points.length],
        b = points[i];
      if (a[1] === b[1]) continue;
      if (a[1] > b[1]) [a, b] = [b, a];
      if ((y >= a[1] && y < b[1]) || (y === ymax && y > a[1] && y <= b[1]))
        pairs.push(Math.trunc(((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]) + 0.5 + a[0]));
    }
    pairs.sort((a, b) => a - b);
    // Union boundary pixels with the scanline intervals, including horizontal edges.
    const intervals: [number, number][] = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) intervals.push([pairs[i], pairs[i + 1]]);
    for (const p of points) if (p[1] === y) intervals.push([p[0], p[0]]);
    intervals.sort((a, b) => a[0] - b[0]);
    for (const [a, b] of intervals) span(a, y, b);
  }
}

export function rasterizeBrushShape(
  shape: Exclude<Brush["shape"], "image">,
  requestedSize: number,
  requestedAngle: number,
  options: {
    maxSize: number;
    ellipseExtraOffsetSizes: readonly number[];
  },
): { extent: number; bitmap: number[] } {
  const size = Math.max(
      1,
      Math.min(options.maxSize, Math.trunc(Number.isFinite(requestedSize) ? requestedSize : 1)),
    ),
    angle = Math.trunc(Number.isFinite(requestedAngle) ? requestedAngle : 0);
  const extent =
    shape === "square" && angle !== 0 && size > 3 ? Math.ceil(Math.sqrt(2 * size * size)) : size;
  const bitmap = Array.from({ length: extent * extent }, () => 0);
  const plot = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < extent && y < extent) bitmap[y * extent + x] = 1;
  };
  const span = (x: number, y: number, end: number) => {
    for (let i = x; i <= end; i++) plot(i, y);
  };
  if (size === 1) bitmap.fill(1);
  else if (shape === "circle") ellipse(extent, span, options.ellipseExtraOffsetSizes);
  else if (shape === "line") {
    const c = Math.trunc(extent / 2),
      a = (Math.PI * angle) / 180,
      r = size / 2,
      dx = Math.trunc(r * Math.cos(-a)),
      dy = Math.trunc(r * Math.sin(-a));
    line(c, c, c + dx, c + dy, plot);
    line(c, c, c - dx, c - dy, plot);
  } else if (angle === 0 || extent <= 2) bitmap.fill(1);
  else {
    const a = (Math.PI * angle) / 180,
      cos = Math.cos(a),
      sin = Math.sin(a);
    let points: Point[];
    if (extent === 3)
      points =
        Math.abs(cos) >= 0.92387953 || Math.abs(cos) <= 0.38268343
          ? [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
            ]
          : [
              [1, 0],
              [2, 1],
              [1, 2],
              [0, 1],
            ];
    else {
      const c = Math.trunc(extent / 2),
        half = Math.trunc(size / 2),
        ac = Math.trunc(half * cos),
        bs = Math.trunc(half * sin);
      points = [
        [c - ac - bs, c + bs - ac],
        [c + ac - bs, c - bs - ac],
        [c + ac + bs, c - bs + ac],
        [c - ac + bs, c + bs + ac],
      ];
    }
    polygon(points, span);
  }
  return { extent, bitmap };
}

export function isValidBrushImage(image: BrushImage | undefined): image is BrushImage {
  return !!(
    image &&
    Number.isSafeInteger(image.width) &&
    Number.isSafeInteger(image.height) &&
    image.width >= 1 &&
    image.height >= 1 &&
    image.width * image.height * 4 <= image.data.length
  );
}

export function brushMask(brush: Brush): PixelMask {
  if (brush.shape === "image") return imageBrushMask(brush.image);
  const { extent, bitmap } = rasterizeBrushShape(brush.shape, brush.size, brush.angle, {
    maxSize: MAX_FULL_SIZE_BRUSH_SIZE,
    ellipseExtraOffsetSizes: FULL_SIZE_BRUSH_ELLIPSE_EXTRA_OFFSET_SIZES,
  });
  return {
    x: -Math.floor(extent / 2),
    y: -Math.floor(extent / 2),
    width: extent,
    height: extent,
    data: Uint8Array.from(bitmap),
  };
}

/** Convert the alpha channel of a custom RGBA brush into the point-shape mask
 * shared by paint rasterization, symmetry, cursors, and Pixel Perfect bounds. */
function imageBrushMask(image: BrushImage | undefined): PixelMask {
  if (!isValidBrushImage(image)) {
    return { x: 0, y: 0, width: 1, height: 1, data: new Uint8Array([0]) };
  }

  const { width, height } = image;
  const anchorX =
    image.anchor && Number.isFinite(image.anchor.x)
      ? Math.max(0, Math.min(width - 1, Math.trunc(image.anchor.x)))
      : Math.floor(width / 2);
  const anchorY =
    image.anchor && Number.isFinite(image.anchor.y)
      ? Math.max(0, Math.min(height - 1, Math.trunc(image.anchor.y)))
      : Math.floor(height / 2);
  const data = new Uint8Array(width * height);
  if (image.mask?.length === data.length) {
    for (let i = 0; i < data.length; i++) data[i] = image.mask[i] ? 1 : 0;
  } else if (
    image.asepriteSamples?.depth === 8 &&
    image.asepriteSamples.width === width &&
    image.asepriteSamples.height === height &&
    image.asepriteSamples.data.length === data.length
  ) {
    const maskIndex = image.sourceBackground ? -1 : (image.transparentIndex ?? 0);
    for (let i = 0; i < data.length; i++)
      data[i] = image.asepriteSamples.data[i] === maskIndex ? 0 : 1;
  } else {
    for (let i = 0; i < data.length; i++) data[i] = image.data[i * 4 + 3] > 0 ? 1 : 0;
  }
  return { x: -anchorX, y: -anchorY, width, height, data };
}
