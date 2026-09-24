import { UINT8_MAX } from "$/base/numeric-constants";
/** Shape controllers follow .refs/libresprite/src/app/tools/controllers.h;
 * spline and ellipse rasterization follow the MIT doc/algo.cpp library,
 * and gradient interpolation follows the MIT render/gradient.cpp library. */
import type { PixelBuffer, Point, RasterResult, Rgba } from "$/base/primitives";
import { symmetryBrushMask } from "$/canvas/assistance/symmetry";
import {
  allows,
  inkBlend,
  normalBlend,
  paintRectangle,
  paintStroke,
  pixelWriter,
  brushMask,
  polygon,
  samplePixel,
} from "$/canvas/raster";
import { rotatedEllipsePixels, rotatedRectanglePath } from "$/canvas/raster/rotated-shapes";
import type { RasterOptions } from "$/canvas/raster/types";
import { projectTiledPixel } from "$/canvas/tiled-canvas";
import { roundedRectanglePixels } from "$/drawing/shapes/rounded-rectangle";
import { GradientDither, GradientType } from "$/drawing/types";

export type ShapeTool =
  | "rectangle"
  | "filled_rectangle"
  | "ellipse"
  | "filled_ellipse"
  | "curve"
  | "polygon"
  | "filled_polygon"
  | "gradient";
export { GradientDither, GradientType } from "$/drawing/types";
export interface ShapeOptions extends RasterOptions {
  background: Rgba;
  shapeAngle?: number;
  cornerRadius?: number;
  gradientSeed?: Point;
  gradientType?: GradientType;
  gradientDither?: GradientDither;
  tolerance?: number;
  contiguous?: boolean;
  preview?: boolean;
}
export const isShapeTool = (tool: string): tool is ShapeTool =>
  [
    "rectangle",
    "filled_rectangle",
    "ellipse",
    "filled_ellipse",
    "curve",
    "polygon",
    "filled_polygon",
    "gradient",
  ].includes(tool);
const integer = (p: Point): Point => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
/** Inclusive ellipse from the MIT doc/algo.cpp rasterizer. */
export function ellipsePixels(start: Point, end: Point, filled = false): Point[] {
  let x0 = Math.min(Math.floor(start.x), Math.floor(end.x)),
    x1 = Math.max(Math.floor(start.x), Math.floor(end.x));
  let y0 = Math.min(Math.floor(start.y), Math.floor(end.y)),
    y1 = Math.max(Math.floor(start.y), Math.floor(end.y));
  const width = x1 - x0 + 1,
    height = y1 - y0 + 1;
  const extra = (n: number) => ([8, 12, 22].includes(n) ? 1 : 0) - (n > 5 && n % 2 === 0 ? 1 : 0);
  const hp = extra(width),
    vp = extra(height);
  x1 -= hp;
  y1 -= vp;
  let a = x1 - x0,
    b = y1 - y0,
    b1 = b & 1,
    dx = 4 * (1 - a) * b * b,
    dy = 4 * (b1 + 1) * a * a,
    err = dx + dy + b1 * a * a;
  y0 += Math.trunc((b + 1) / 2);
  y1 = y0 - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;
  const initialY0 = y0,
    initialY1 = y1,
    initialX0 = x0,
    initialX1 = x1 + hp,
    points: Point[] = [];
  const plot = (x: number, y: number) => points.push({ x, y });
  const span = (x: number, y: number, end: number) => {
    for (; x <= end; x++) plot(x, y);
  };
  do {
    if (filled) {
      span(x0, y0 + vp, x1 + hp);
      span(x0, y1, x1 + hp);
    } else {
      plot(x1 + hp, y0 + vp);
      plot(x0, y0 + vp);
      plot(x0, y1);
      plot(x1 + hp, y1);
    }
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
  while (y0 + vp - y1 + 1 <= height) {
    plot(x0 - 1, y0 + vp);
    plot(x1 + 1 + hp, y0++ + vp);
    plot(x0 - 1, y1);
    plot(x1 + 1 + hp, y1--);
  }
  if (!filled && hp > 0)
    for (let x = x0; x < x1 + hp + 1; x++) {
      plot(x, y1 + 1);
      plot(x, y0 + vp - 1);
    }
  if (vp > 0)
    for (let y = initialY1 + 1; y < initialY0 + vp; y++) {
      if (filled) span(initialX0, y, initialX1);
      else {
        plot(initialX0, y);
        plot(initialX1, y);
      }
    }
  return points;
}
/** Forward-difference spline with .refs/libresprite/src/doc/algo.cpp sampling. */
export function curvePath(points: readonly Point[]): Point[] {
  if (points.length < 3) return points.map(integer);
  const [p0, p1, p2, p3] =
    points.length === 3 ? [points[0], points[1], points[1], points[2]] : points;
  const count = Math.max(
    4,
    Math.min(
      64,
      Math.trunc(
        Math.sqrt(
          Math.hypot(p1.x - p0.x, p1.y - p0.y) +
            Math.hypot(p2.x - p1.x, p2.y - p1.y) +
            Math.hypot(p3.x - p2.x, p3.y - p2.y),
        ) * 1.2,
      ),
    ),
  );
  const dt = 1 / (count - 1),
    dt2 = dt * dt,
    dt3 = dt2 * dt;
  const axis = (v0: number, v1: number, v2: number, v3: number) => {
    const term2 = dt2 * 3 * (v2 - 2 * v1 + v0),
      term3 = dt3 * (v3 + 3 * (-v2 + v1) - v0);
    return {
      v: v0 + 0.5,
      d: term3 - term2 + 3 * dt * (v1 - v0),
      dd: -6 * term3 + 2 * term2,
      ddd: 6 * term3,
    };
  };
  const x = axis(p0.x, p1.x, p2.x, p3.x),
    y = axis(p0.y, p1.y, p2.y, p3.y),
    out = [{ x: Math.trunc(p0.x), y: Math.trunc(p0.y) }];
  for (let i = 1; i < count; i++) {
    for (const a of [x, y]) {
      a.dd += a.ddd;
      a.d += a.dd;
      a.v += a.d;
    }
    out.push({ x: Math.trunc(x.v), y: Math.trunc(y.v) });
  }
  return out;
}
function paintPixels(
  image: PixelBuffer,
  points: readonly Point[],
  options: RasterOptions,
  brush: boolean,
): RasterResult {
  const coverage = options.coverage ?? new Set<number>(),
    w = pixelWriter(image, options),
    opacity = Math.max(0, Math.min(UINT8_MAX, Math.round(options.opacity ?? UINT8_MAX)));
  const mask = brush
    ? symmetryBrushMask(brushMask(options.brush), options.symmetryIndex ?? 0)
    : { x: 0, y: 0, width: 1, height: 1, data: new Uint8Array([1]) };
  for (const p of points)
    for (let my = 0; my < mask.height; my++)
      for (let mx = 0; mx < mask.width; mx++) {
        if (!mask.data[my * mask.width + mx]) continue;
        const { x, y } = projectTiledPixel(p.x + mask.x + mx, p.y + mask.y + my, options.tiled),
          key = y * image.width + x;
        if (!allows(image, x, y, options) || coverage.has(key)) continue;
        coverage.add(key);
        w.write(
          x,
          y,
          inkBlend(
            options.sourcePixel?.(x, y) ?? samplePixel(image, { x, y }),
            options.colorAt?.(x, y) ?? options.color,
            opacity,
            options.ink,
            options,
          ),
        );
      }
  return w.result();
}
function bayer(size: number, x: number, y: number): number {
  if (size === 1) return 0;
  const half = size / 2;
  return (
    4 * bayer(half, x % half, y % half) +
    [
      [0, 2],
      [3, 1],
    ][Math.floor(y / half)][Math.floor(x / half)]
  );
}
export function paintGradient(
  image: PixelBuffer,
  start: Point,
  end: Point,
  options: ShapeOptions,
): RasterResult {
  const w = pixelWriter(image, options),
    a = integer(start),
    b = integer(end),
    dx = b.x - a.x,
    dy = b.y - a.y;
  const region = new Uint8Array(image.width * image.height),
    referenceCandidate = options.referenceImage,
    referenceImage =
      referenceCandidate &&
      referenceCandidate.width === image.width &&
      referenceCandidate.height === image.height
        ? referenceCandidate
        : image,
    target = samplePixel(referenceImage, options.gradientSeed ?? a),
    tolerance = options.tolerance ?? 0;
  const matches = (x: number, y: number) => {
    if (!allows(image, x, y, options)) return false;
    const c = samplePixel(referenceImage, { x, y });
    return (!c[3] && !target[3]) || c.every((v, i) => Math.abs(v - target[i]) <= tolerance);
  };
  if (!allows(image, (options.gradientSeed ?? a).x, (options.gradientSeed ?? a).y, options))
    return w.result();
  if (options.contiguous === false) {
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) if (matches(x, y)) region[y * image.width + x] = 1;
  } else {
    const seed = options.gradientSeed ?? a;
    const queue: number[] = [seed.y * image.width + seed.x];
    region[queue[0]] = 1;
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i],
        x = key % image.width,
        y = Math.floor(key / image.width);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        const n = ny * image.width + nx;
        if (
          nx >= 0 &&
          ny >= 0 &&
          nx < image.width &&
          ny < image.height &&
          !region[n] &&
          matches(nx, ny)
        ) {
          region[n] = 1;
          queue.push(n);
        }
      }
    }
  }
  let c0 = options.color,
    c1 = options.background;
  const radial = options.gradientType === GradientType.Radial,
    degenerate = radial ? dx === 0 || dy === 0 : dx === 0 && dy === 0;
  if (!degenerate) {
    if (!c0[3] && c1[3]) c0 = [c1[0], c1[1], c1[2], 0];
    else if (c0[3] && !c1[3]) c1 = [c0[0], c0[1], c0[2], 0];
  }
  const size =
    options.gradientDither === GradientDither.Bayer2
      ? 2
      : options.gradientDither === GradientDither.Bayer4
        ? 4
        : options.gradientDither === GradientDither.Bayer8
          ? 8
          : 1;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      if (!region[y * image.width + x]) continue;
      const f = degenerate
        ? 0
        : radial
          ? Math.hypot(
              (x - (a.x + b.x) / 2) / (Math.abs(dx) / 2),
              (y - (a.y + b.y) / 2) / (Math.abs(dy) / 2),
            )
          : ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy);
      const color: Rgba = degenerate
        ? radial
          ? c1
          : c0
        : size > 1
          ? f * (size * size + 1) < bayer(size, x % size, y % size) + 1
            ? c0
            : c1
          : f < 0
            ? c0
            : f > 1
              ? c1
              : (c0.map((v, i) => Math.trunc(v + f * (c1[i] - v) + 1e-7)) as unknown as Rgba);
      w.write(x, y, normalBlend(samplePixel(image, { x, y }), color, options.opacity ?? UINT8_MAX));
    }
  return w.result();
}
export function paintShape(
  image: PixelBuffer,
  points: readonly Point[],
  tool: ShapeTool,
  options: ShapeOptions,
): RasterResult {
  if (!points.length) return { dirty: null };
  const a = points[0],
    b = points[points.length - 1];
  if (tool === "gradient") return paintGradient(image, a, b, options);
  if (tool === "curve") return paintStroke(image, curvePath(points), options);
  if (tool === "polygon" || tool === "filled_polygon") {
    if (options.preview) return paintStroke(image, [...points, points[0]], options);
    const pixels: Point[] = [];
    polygon(
      points.map((p) => [Math.floor(p.x), Math.floor(p.y)] as const),
      (x, y, end) => {
        for (; x <= end; x++) pixels.push({ x, y });
      },
    );
    return paintPixels(image, pixels, options, true);
  }
  const angle = options.shapeAngle ?? 0;
  if ((tool === "rectangle" || tool === "filled_rectangle") && (options.cornerRadius ?? 0) > 0)
    return paintPixels(
      image,
      roundedRectanglePixels(
        a,
        b,
        options.cornerRadius ?? 0,
        tool === "filled_rectangle" && !options.preview,
        angle,
      ),
      options,
      true,
    );
  if (tool === "ellipse" || tool === "filled_ellipse")
    return paintPixels(
      image,
      Math.abs(angle) > 0.001
        ? rotatedEllipsePixels(
            a,
            b,
            angle,
            tool === "filled_ellipse" && !options.preview,
            ellipsePixels,
          )
        : ellipsePixels(a, b, tool === "filled_ellipse" && !options.preview),
      options,
      true,
    );
  if (Math.abs(angle) > 0.001) {
    const path = rotatedRectanglePath(a, b, angle);
    return paintShape(image, path, "polygon", {
      ...options,
      shapeAngle: 0,
      preview: tool === "rectangle" || options.preview,
    });
  }
  if (tool === "rectangle") return paintRectangle(image, a, b, options);
  if (options.preview) return paintRectangle(image, a, b, options);
  const pts: Point[] = [];
  for (
    let y = Math.max(-64, Math.min(Math.floor(a.y), Math.floor(b.y)));
    y <= Math.min(image.height + 63, Math.max(Math.floor(a.y), Math.floor(b.y)));
    y++
  )
    for (
      let x = Math.max(-64, Math.min(Math.floor(a.x), Math.floor(b.x)));
      x <= Math.min(image.width + 63, Math.max(Math.floor(a.x), Math.floor(b.x)));
      x++
    )
      pts.push({ x, y });
  return paintPixels(image, pts, options, true);
}
/** Keep one history gesture alive while release() returns true; movement is
 * also delivered with no buttons down. Aseprite polygons finish on a no-drag click. */
export class AsepriteShapeController {
  points: Point[] = [];
  private clicks = 0;
  private last: Point = { x: 0, y: 0 };
  private acceptedTouchStage = false;
  private touchCheckpoint: { points: Point[]; clicks: number; last: Point } | null = null;
  constructor(
    readonly kind: "polygon" | "curve",
    private readonly touch = false,
  ) {}
  press(point: Point) {
    if (this.touch && this.acceptedTouchStage) {
      this.touchCheckpoint = {
        points: this.points.map((value) => ({ ...value })),
        clicks: this.clicks,
        last: { ...this.last },
      };
    }
    const p = integer(point);
    this.last = { ...p };
    if (this.kind === "polygon") this.points.push({ ...p }, { ...p });
    else if (!this.points.length) {
      this.points = Array.from({ length: 4 }, () => ({ ...p }));
      this.clicks = 0;
    } else if (!this.touch) this.clicks++;
  }
  move(point: Point, modifiers: { moveOrigin?: boolean } = {}) {
    const p = integer(point);
    if (!this.points.length) return;
    const delta = { x: p.x - this.last.x, y: p.y - this.last.y };
    this.last = { ...p };
    if (modifiers.moveOrigin) {
      this.points = this.points.map((pt) => ({ x: pt.x + delta.x, y: pt.y + delta.y }));
      return;
    }
    if (this.kind === "polygon") this.points[this.points.length - 1] = p;
    else if (this.clicks === 0 || (this.touch && this.clicks === 1))
      for (let i = 1; i < 4; i++) this.points[i] = { ...p };
    else if (this.clicks === 1 || this.clicks === 2) {
      this.points[1] = { ...p };
      this.points[2] = { ...p };
    } else if (this.clicks === 3) this.points[2] = p;
  }
  release(point: Point): boolean {
    if (this.touch) {
      this.acceptedTouchStage = true;
      this.touchCheckpoint = null;
    }
    if (this.kind === "curve") {
      // A finger can tap start/end/control points without a hover phase.
      // A first drag already specifies the endpoint and skips that tap.
      if (
        this.touch &&
        this.clicks === 0 &&
        (this.points[0].x !== this.points[3].x || this.points[0].y !== this.points[3].y)
      )
        this.clicks = 1;
      return ++this.clicks < 4;
    }
    if (this.touch) return true;
    const p = integer(point),
      a = this.points[this.points.length - 2],
      b = this.points[this.points.length - 1];
    return !!a && !(a.x === p.x && a.y === p.y && b.x === p.x && b.y === p.y);
  }

  /** Navigation abandons only the unaccepted touch point, retaining the draft. */
  cancelTouchStep(): boolean {
    if (!this.touch || !this.acceptedTouchStage) return false;
    if (this.touchCheckpoint) {
      this.points = this.touchCheckpoint.points;
      this.clicks = this.touchCheckpoint.clicks;
      this.last = this.touchCheckpoint.last;
      this.touchCheckpoint = null;
    }
    return true;
  }
}
