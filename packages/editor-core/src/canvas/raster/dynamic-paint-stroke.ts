import { UINT8_MAX } from "$/base/numeric-constants";
import type { Brush, PixelBuffer, Point, RasterResult, Rgba } from "$/base/primitives";
import { PixelPerfectPath, PixelPerfectTracePolicy } from "$/canvas/raster/pixel-perfect";
import {
  restorePixelPerfectArea,
  savePixelPerfectArea,
  type PixelPerfectReplicaMapper,
} from "$/canvas/raster/pixel-perfect-stroke";
import { shadePixel } from "$/canvas/raster/shading";
import {
  interpolateDynamicStroke,
  type DynamicBrushSample,
  StrokeDynamics,
} from "$/canvas/raster/stroke-dynamics";
import type { RasterOptions } from "$/canvas/raster/types";
import {
  AsepriteDynamicSensor,
  AsepriteDynamicsColorDirection,
  AsepriteInk,
  type AsepriteDynamicsSettings,
} from "$/drawing/tool-settings";

import { blurStroke, eraseStroke, normalBlend, paintStroke, samplePixel } from ".";

const f = Math.fround;
const overlapRevisions = new WeakMap<Map<string, Rgba>, number>();
export function dynamicDitherSize(name: string): number {
  return name.includes("8x8") ? 8 : name.includes("4x4") ? 4 : name.includes("2x2") ? 2 : 1;
}
export function dynamicBayer(size: number, x: number, y: number): number {
  x = ((x % size) + size) % size;
  y = ((y % size) + size) % size;
  if (size === 1) return 0;
  const half = size / 2;
  return (
    4 * dynamicBayer(half, x % half, y % half) +
    [
      [0, 2],
      [3, 1],
    ][Math.floor(y / half)][Math.floor(x / half)]
  );
}
/** Interpolate a gradient ramp. When one endpoint is fully transparent, use
 * the visible endpoint's RGB throughout that fade to avoid hidden-color fringes. */
export function dynamicGradientColor(a: Rgba, b: Rgba, value: number): Rgba {
  const t = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  if (a[3] === 0) return [b[0], b[1], b[2], Math.trunc(t * b[3])];
  if (b[3] === 0) return [a[0], a[1], a[2], Math.trunc((1 - t) * a[3])];
  const leftWeight = 1 - t,
    rightWeight = t;
  return [
    Math.trunc(leftWeight * a[0] + rightWeight * b[0]),
    Math.trunc(leftWeight * a[1] + rightWeight * b[1]),
    Math.trunc(leftWeight * a[2] + rightWeight * b[2]),
    Math.trunc((1 - t) * a[3] + t * b[3]),
  ];
}
/** Keep pre-stroke source pixels for the duration of one stroke. Fresh sample
 * coverage permits pressure/gradient changes to replace an earlier stamp while
 * blending size/angle geometric brushes against pre-stroke source. Gradient
 * dynamics refresh once per input event and share that source across symmetry
 * branches, so event-to-event color can accumulate. Bayer dynamics use an
 * image stamp composited on the destination. */
export class DynamicPaintStroke {
  private previous: DynamicBrushSample | undefined;
  private perfectPath = new PixelPerfectPath();
  private savedPerfect = new Map<number, ReturnType<typeof savePixelPerfectArea>>();
  private readonly original: Map<string, Rgba>;
  private colors:
    | {
        primary: Rgba;
        secondary: Rgba;
      }
    | undefined;
  constructor(original = new Map<string, Rgba>()) {
    this.original = original;
  }
  /** Symmetry branches keep independent interpolation history but read the same
   * pre-stroke pixels, including pixels already covered by another branch. */
  fork(): DynamicPaintStroke {
    const branch = new DynamicPaintStroke(this.original);
    branch.colors = this.colors;
    return branch;
  }
  paint(
    image: PixelBuffer,
    points: readonly Point[],
    options: RasterOptions,
    dynamics: StrokeDynamics,
    secondary: Rgba,
    tool: "pencil" | "eraser" | "blur" = "pencil",
    baseBrush: Brush = options.brush,
    pixelPerfect = false,
    tracePolicy: PixelPerfectTracePolicy = PixelPerfectTracePolicy.Accumulate,
    replicasForPoint?: PixelPerfectReplicaMapper,
  ): RasterResult {
    if (!points.length) return { dirty: null };
    this.colors ??= { primary: options.color, secondary };
    const settings = dynamics.settings,
      active = settings?.gradient !== AsepriteDynamicSensor.Static && !!settings;
    const size = active ? dynamicDitherSize(settings.matrixName) : 1;
    if (active && tool !== "eraser" && overlapRevisions.get(this.original) !== dynamics.revision) {
      this.original.clear();
      overlapRevisions.set(this.original, dynamics.revision);
    }
    const ink =
      options.ink === AsepriteInk.Simple
        ? this.colors.primary[3] === 0
          ? AsepriteInk.CopyColor
          : AsepriteInk.AlphaCompositing
        : options.ink;
    const opacity = options.ink === AsepriteInk.Simple ? UINT8_MAX : (options.opacity ?? UINT8_MAX);
    const [a, b] =
      settings?.colorFromTo === AsepriteDynamicsColorDirection.ForegroundToBackground
        ? [this.colors.primary, this.colors.secondary]
        : [this.colors.secondary, this.colors.primary];
    const origin = options.patternOrigin ?? { x: 0, y: 0 };
    const sourcePixel = (x: number, y: number): Rgba => {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [0, 0, 0, 0];
      const key = `${x + origin.x},${y + origin.y}`;
      let color = this.original.get(key);
      if (!color) {
        color = samplePixel(image, { x, y });
        this.original.set(key, color);
      }
      return color;
    };
    let dirty: RasterResult["dirty"] = null;
    const stamp = (
      point: Point,
      sample: DynamicBrushSample,
      stampOptions: RasterOptions = options,
    ) => {
      const value = sample.gradient;
      const color = active ? dynamicGradientColor(a, b, value) : options.color;
      let opts: RasterOptions = {
        ...stampOptions,
        ink,
        opacity,
        brush: sample.brush,
        color,
        sourcePixel,
        coverage: new Set(),
      };
      if (active && size > 1 && tool === "pencil") {
        // patternImage() aligns Bayer cells in destination image coordinates.
        opts = {
          ...opts,
          ink: AsepriteInk.CopyColor,
          sourcePixel: undefined,
          colorAt: (x, y) => {
            const src = sourcePixel(x, y),
              dst = samplePixel(image, { x, y }),
              c = f(f(value) * (size * size + 1)) < dynamicBayer(size, x, y) + 1 ? a : b;
            if (ink === AsepriteInk.CopyColor) return c[3] ? c : dst;
            if (ink === AsepriteInk.Shading)
              return c[3] && options.shade?.some((s) => s.every((v, i) => v === c[i]))
                ? shadePixel(src, options.shade, options.shadeDirection)
                : dst;
            const result = normalBlend(dst, c, opacity);
            return ink === AsepriteInk.LockAlpha
              ? [result[0], result[1], result[2], src[3]]
              : result;
          },
        };
      }
      const result = (tool === "eraser" ? eraseStroke : tool === "blur" ? blurStroke : paintStroke)(
        image,
        [point],
        opts,
      ).dirty;
      if (result) {
        if (!dirty) dirty = result;
        else {
          const right = Math.max(dirty.x + dirty.width, result.x + result.width),
            bottom = Math.max(dirty.y + dirty.height, result.y + result.height);
          dirty = {
            x: Math.min(dirty.x, result.x),
            y: Math.min(dirty.y, result.y),
            width: 0,
            height: 0,
          };
          dirty.width = right - dirty.x;
          dirty.height = bottom - dirty.y;
        }
      }
    };
    const next = dynamics.sample(baseBrush);
    // Dynamics are sampled per stroke point. A changing line-brush angle
    // makes the stamp footprint vary while the path is being simplified.
    const dynamicAngle = !!settings && settings.angle !== AsepriteDynamicSensor.Static;
    // A moving line-brush angle keeps every center. For a static line brush,
    // PixelPerfectPath checks whether adjacent stamps cover a removed center.
    const supportsDynamicPixelPerfect =
      baseBrush.shape === "circle" ||
      baseBrush.shape === "square" ||
      baseBrush.shape === "image" ||
      baseBrush.shape === "line";
    if (pixelPerfect && supportsDynamicPixelPerfect) {
      if (tracePolicy === PixelPerfectTracePolicy.Last) this.savedPerfect.clear();
      const samples = new Map<string, DynamicBrushSample>();
      if (this.previous && points.length > 1)
        interpolateDynamicStroke(
          points[0],
          points[points.length - 1],
          this.previous,
          next,
          (point, sample) => samples.set(`${point.x},${point.y}`, sample),
        );
      const sampleAt = (point: Point) => samples.get(`${point.x},${point.y}`) ?? next;
      for (const operation of this.perfectPath.join(points, tracePolicy, {
        brush: baseBrush,
        brushAngleStatic: !dynamicAngle,
      })) {
        const sample = sampleAt(operation.point);
        const replicas = replicasForPoint?.(operation.point, sample.brush) ?? [
          {
            key: options.symmetryIndex ?? 0,
            point: operation.point,
            options: { ...options, brush: sample.brush },
          },
        ];
        // Generate the pixel-center path once, then apply
        // each operation to all symmetry copies before advancing.
        for (const replica of replicas) {
          const replicaOptions = { ...replica.options, brush: sample.brush, coverage: undefined };
          if (operation.kind === "save")
            this.savedPerfect.set(
              replica.key,
              savePixelPerfectArea(image, replica.point, replicaOptions),
            );
          else if (operation.kind === "restore") {
            const changed = restorePixelPerfectArea(
              image,
              replica.point,
              this.savedPerfect.get(replica.key) ?? null,
              replicaOptions,
            );
            if (changed)
              dirty = dirty
                ? {
                    x: Math.min(dirty.x, changed.x),
                    y: Math.min(dirty.y, changed.y),
                    width:
                      Math.max(dirty.x + dirty.width, changed.x + changed.width) -
                      Math.min(dirty.x, changed.x),
                    height:
                      Math.max(dirty.y + dirty.height, changed.y + changed.height) -
                      Math.min(dirty.y, changed.y),
                  }
                : changed;
          } else stamp(replica.point, sample, replica.options);
        }
      }
    } else if (points.length > 1)
      interpolateDynamicStroke(
        points[0],
        points[points.length - 1],
        this.previous ?? next,
        next,
        stamp,
      );
    else stamp(points[points.length - 1], next);
    this.previous = next;
    return { dirty };
  }
}
export function usesDynamicBrush(settings: AsepriteDynamicsSettings | undefined): boolean {
  return (
    !!settings &&
    (settings.size !== AsepriteDynamicSensor.Static ||
      settings.angle !== AsepriteDynamicSensor.Static ||
      settings.gradient !== AsepriteDynamicSensor.Static)
  );
}
