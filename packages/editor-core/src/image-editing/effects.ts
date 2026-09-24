import { BYTE_ROUNDING_BIAS, UINT8_MAX, BITS_PER_BYTE } from "$/base/numeric-constants";
import type { PixelBuffer, PixelMask, Rect, Rgba } from "$/base/primitives";
import {
  updateAsepriteFramePalette,
  normalizeAsepriteDocument,
} from "$/color/operations/color-mode";
import {
  encodeAsepriteSamples,
  expandAsepriteSamples,
  asepriteBestFit,
  paletteForColors,
  type AsepriteImageSamples,
} from "$/color/samples";
import { activateTimelineCel, ensureTimeline } from "$/document/document";
import { assertDimension, assertPixelCount } from "$/document/pixel-validation";
/** Color transforms and neighborhood effects for the editor's RGBA canvas.
 * The document, palette, selection, and tileset rules below operate on the
 * editor's own data model. */
import type { EditorDocument } from "$/document/types";
import {
  ConvolutionPreset,
  DEFAULT_MEDIAN_SIZE,
  colorCurveMap,
  convolutionKernel,
  convolutionSamples,
  medianSamples,
  type ColorCurvePoint,
} from "$/image-editing/advanced-filters";
import { selectionContains, selectionLayerReference } from "$/selection/operations";
import {
  commitTilemapPixels,
  rasterizeTilemapSamples,
  refreshTilemapProjections,
  tilesetForLayer,
  TilesetMode,
  type TilemapEditMode,
} from "$/tilemap/model";
import {
  effectiveLayerVisible,
  isBackgroundLayer,
  layerEditable,
  LAYER_REFERENCE,
  type SpriteTimeline,
  type TimelineCel,
} from "$/timeline/timeline";
import { clamp as clampNumber } from "@xprite/bedrock/common/clamp";

export enum EffectKind {
  ReplaceColor = "replace-color",
  HueSaturation = "hue-saturation",
  BrightnessContrast = "brightness-contrast",
  Invert = "invert",
  Outline = "outline",
  MedianBlur = "median-blur",
  ConvolutionMatrix = "convolution-matrix",
  ColorCurve = "color-curve",
}
export enum EffectTarget {
  Selected = "selected",
  All = "all",
}
export enum HueSaturationMode {
  HsvMul = "hsv-mul",
  HslMul = "hsl-mul",
  HsvAdd = "hsv-add",
  HslAdd = "hsl-add",
}
interface Channels {
  channels?: number;
  fromIndex?: number;
  toIndex?: number;
  colorIndex?: number;
  bgIndex?: number;
}
export type EffectSpec = Channels &
  (
    | {
        kind: EffectKind.ReplaceColor;
        from: Rgba;
        to: Rgba;
        tolerance: number;
      }
    | {
        kind: EffectKind.HueSaturation;
        mode: HueSaturationMode;
        hue: number;
        saturation: number;
        lightness: number;
        alpha: number;
      }
    | {
        kind: EffectKind.BrightnessContrast;
        brightness: number;
        contrast: number;
      }
    | {
        kind: EffectKind.Invert;
      }
    | {
        kind: EffectKind.MedianBlur;
        width: number;
        height: number;
        tiledMode?: 0 | 1 | 2 | 3;
      }
    | {
        kind: EffectKind.ConvolutionMatrix;
        preset: ConvolutionPreset;
        tiledMode?: 0 | 1 | 2 | 3;
      }
    | {
        kind: EffectKind.ColorCurve;
        points: readonly ColorCurvePoint[];
      }
    | {
        kind: EffectKind.Outline;
        color: Rgba;
        bgColor: Rgba;
        place: "outside" | "inside";
        matrix: number;
        tiledMode?: 0 | 1 | 2 | 3;
      }
  );
export const OUTLINE_MATRICES = {
  circle: 0o252,
  square: 0o757,
  horizontal: 0o050,
  vertical: 0o202,
} as const;
const clamp = (v: number, min: number, max: number) =>
  clampNumber(Number.isFinite(v) ? v : 0, min, max);
export const effectChannels = (spec: EffectSpec, background = false, depth: 8 | 16 | 32 = 32) => {
  if (
    spec.kind === EffectKind.ColorCurve ||
    spec.kind === EffectKind.MedianBlur ||
    spec.kind === EffectKind.ConvolutionMatrix
  ) {
    const base =
      spec.kind === EffectKind.ConvolutionMatrix ? convolutionKernel(spec.preset).channels : 7;
    const fallback = depth === 16 ? 16 | (base & 8) : base;
    return (spec.channels ?? fallback) & (background ? ~8 : 63);
  }
  const fallback =
    depth === 16
      ? spec.kind === EffectKind.Invert
        ? 16
        : 24
      : depth === 8 && (spec.kind === EffectKind.ReplaceColor || spec.kind === EffectKind.Outline)
        ? 32
        : spec.kind === EffectKind.Invert
          ? 7
          : 15;
  return (spec.channels ?? fallback) & (background ? ~8 : 63);
};
export interface EffectColorIndices {
  foregroundIndex?: number | null;
  backgroundIndex?: number | null;
  outlineBackgroundIndex?: number | null;
}
export function defaultEffect(
  kind: EffectKind,
  foreground: Rgba,
  background: Rgba,
  backgroundPixel?: Rgba,
  indices: EffectColorIndices = {},
): EffectSpec {
  const valid = (value: number | null | undefined) =>
    Number.isInteger(value) &&
    value !== null &&
    value !== undefined &&
    value >= 0 &&
    value <= UINT8_MAX
      ? value
      : undefined;
  switch (kind) {
    case EffectKind.ReplaceColor:
      return {
        kind,
        from: foreground,
        to: background,
        fromIndex: valid(indices.foregroundIndex),
        toIndex: valid(indices.backgroundIndex),
        tolerance: 0,
      };
    case EffectKind.HueSaturation:
      return {
        kind,
        mode: HueSaturationMode.HslMul,
        hue: 0,
        saturation: 0,
        lightness: 0,
        alpha: 0,
      };
    case EffectKind.BrightnessContrast:
      return { kind, brightness: 0, contrast: 0 };
    case EffectKind.MedianBlur:
      return { kind, width: DEFAULT_MEDIAN_SIZE, height: DEFAULT_MEDIAN_SIZE, tiledMode: 0 };
    case EffectKind.ConvolutionMatrix:
      return { kind, preset: ConvolutionPreset.GaussianBlur, tiledMode: 0 };
    case EffectKind.ColorCurve:
      return {
        kind,
        points: [
          { x: 0, y: 0 },
          { x: UINT8_MAX, y: UINT8_MAX },
        ],
      };
    case EffectKind.Outline:
      return {
        kind,
        color: foreground,
        colorIndex: valid(indices.foregroundIndex),
        bgIndex: valid(indices.outlineBackgroundIndex),
        bgColor: backgroundPixel ?? [0, 0, 0, 0],
        place: "outside",
        matrix: OUTLINE_MATRICES.circle,
        tiledMode: 0,
      };
    default:
      return { kind };
  }
}
/** A direct RGBA edit loses palette-index identity only when color changes.
 * Equal-color edits must not collapse two source palette indices. */
export function updateEffectColor(
  spec: EffectSpec,
  key: "from" | "to" | "color" | "bgColor",
  color: Rgba,
): EffectSpec {
  if (spec.kind === EffectKind.ReplaceColor && (key === "from" || key === "to")) {
    if (spec[key].every((value, i) => value === color[i])) return spec;
    return { ...spec, [key]: color, [key === "from" ? "fromIndex" : "toIndex"]: undefined };
  }
  if (spec.kind === EffectKind.Outline && (key === "color" || key === "bgColor")) {
    if (spec[key].every((value, i) => value === color[i])) return spec;
    return { ...spec, [key]: color, [key === "color" ? "colorIndex" : "bgIndex"]: undefined };
  }
  return spec;
}
function hueSaturation(
  color: Rgba,
  spec: Extract<
    EffectSpec,
    {
      kind: EffectKind.HueSaturation;
    }
  >,
  channels: number,
): Rgba {
  const [red, green, blue, alpha0] = color;
  const high = Math.max(red, green, blue),
    low = Math.min(red, green, blue),
    delta = high - low;
  const hsl = spec.mode.startsWith("hsl"),
    multiply = spec.mode.endsWith("mul");
  const lightness = hsl ? (high + low) / 510 : high / UINT8_MAX;
  const originalSaturation =
    delta === 0
      ? 0
      : hsl
        ? delta / UINT8_MAX / (1 - Math.abs(2 * lightness - 1))
        : high === 0
          ? 0
          : delta / high;
  let hue = 0;
  if (delta !== 0) {
    const sector =
      high === red
        ? ((green - blue) / delta) % 6
        : high === green
          ? (blue - red) / delta + 2
          : (red - green) / delta + 4;
    hue = (((sector * 60) % 360) + 360) % 360;
  }
  hue = (hue + clamp(spec.hue, -180, 180) + 360) % 360;
  const amount = clamp(spec.saturation, -100, 100) / 100;
  const saturation = clamp(
    multiply ? originalSaturation * (1 + amount) : originalSaturation + amount,
    0,
    1,
  );
  const levelChange = clamp(spec.lightness, -100, 100) / 100;
  const level = clamp(multiply ? lightness * (1 + levelChange) : lightness + levelChange, 0, 1);
  const chroma = (hsl ? 1 - Math.abs(2 * level - 1) : level) * saturation;
  const sector = hue / 60,
    secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const rgbBySector =
    sector < 1
      ? [chroma, secondary, 0]
      : sector < 2
        ? [secondary, chroma, 0]
        : sector < 3
          ? [0, chroma, secondary]
          : sector < 4
            ? [0, secondary, chroma]
            : sector < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const offset = hsl ? level - chroma / 2 : level - chroma;
  const transformed = rgbBySector.map((component) =>
    Math.trunc((component + offset) * UINT8_MAX + 0.5),
  );
  const alpha =
    alpha0 && channels & 8
      ? Math.trunc(clamp(alpha0 * (1 + clamp(spec.alpha, -100, 100) / 100), 0, UINT8_MAX))
      : alpha0;
  return alpha === 0
    ? [0, 0, 0, 0]
    : [
        channels & 1 ? transformed[0] : red,
        channels & 2 ? transformed[1] : green,
        channels & 4 ? transformed[2] : blue,
        alpha,
      ];
}
function brightnessContrastValue(value: number, brightness: number, contrast: number): number {
  const shifted = value / UINT8_MAX - 0.5;
  const adjusted = (contrast + 1) * shifted + 0.5;
  return Math.trunc((UINT8_MAX + BYTE_ROUNDING_BIAS) * clamp(adjusted * (1 + brightness), 0, 1));
}
function outlineOffsets(matrix: number): readonly (readonly [number, number])[] {
  const offsets: [number, number][] = [];
  let bit = 1;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++, bit <<= 1) {
      if (matrix & bit) offsets.push([dx, dy]);
    }
  }
  return offsets;
}
function outlineHasNeighbor(
  width: number,
  height: number,
  x: number,
  y: number,
  offsets: readonly (readonly [number, number])[],
  tiledMode: number,
  place: "outside" | "inside",
  emptyAt: (x: number, y: number) => boolean,
): boolean {
  for (const [dx, dy] of offsets) {
    const nx = tiledMode & 1 ? (((x + dx) % width) + width) % width : clamp(x + dx, 0, width - 1);
    const ny =
      tiledMode & 2 ? (((y + dy) % height) + height) % height : clamp(y + dy, 0, height - 1);
    const neighborIsEmpty = emptyAt(nx, ny);
    if (place === "outside" ? !neighborIsEmpty : neighborIsEmpty) return true;
  }
  return false;
}
export function effectPixel(
  color: Rgba,
  spec: Exclude<
    EffectSpec,
    {
      kind: EffectKind.Outline;
    }
  >,
  background = false,
): Rgba {
  const channels = effectChannels(spec, background);
  if (spec.kind === EffectKind.HueSaturation) return hueSaturation(color, spec, channels);
  if (spec.kind === EffectKind.ReplaceColor) {
    const tolerance = Math.round(clamp(spec.tolerance, 0, UINT8_MAX));
    if (
      !color.every(
        (value, c) => !(channels & (1 << c)) || Math.abs(value - spec.from[c]) <= tolerance,
      )
    )
      return color;
    return color.map((v, c) => (channels & (1 << c) ? spec.to[c] : v)) as unknown as Rgba;
  }
  if (spec.kind === EffectKind.Invert)
    return color.map((v, c) => (channels & (1 << c) ? UINT8_MAX - v : v)) as unknown as Rgba;
  if (spec.kind === EffectKind.ColorCurve) {
    const map = colorCurveMap(spec.points);
    return color.map((v, c) => (channels & (1 << c) ? map[v] : v)) as unknown as Rgba;
  }
  // Neighborhood transforms require a source snapshot; they have no single-pixel fallback.
  if (spec.kind === EffectKind.MedianBlur || spec.kind === EffectKind.ConvolutionMatrix)
    return color;
  const brightness = clamp(spec.brightness, -100, 100) / 100,
    contrast = clamp(spec.contrast, -100, 100) / 100;
  return color.map((value, channel) =>
    channel < 3 && channels & (1 << channel)
      ? brightnessContrastValue(value, brightness, contrast)
      : value,
  ) as unknown as Rgba;
}
function colorAt(image: PixelBuffer, x: number, y: number): Rgba {
  const at = (y * image.width + x) * 4;
  return [image.data[at], image.data[at + 1], image.data[at + 2], image.data[at + 3]];
}
/** Apply a canvas-sized transform to a snapshot. Selection limits writes,
 * while neighborhood reads always use the unmodified source. Untiled reads
 * clamp at the canvas edge. */
export function applyEffectPixels(
  source: PixelBuffer,
  spec: EffectSpec,
  selection: PixelMask | null = null,
  background = false,
  depth: 8 | 16 | 32 = 32,
): PixelBuffer {
  assertDimension(source.width, "filter width");
  assertDimension(source.height, "filter height");
  assertPixelCount(source.width, source.height, "filter");
  const channels = effectChannels(spec, background, depth);
  const transparent = (c: Rgba, bg: Rgba) => !c[3] || c.every((v, i) => v === bg[i]);
  const pixelSpec = depth === 16 ? grayscaleSpec(spec, channels) : spec;
  const writable = (x: number, y: number) => !selection || selectionContains(selection, x, y);
  const rgbaChannels = [0, 1, 2, 3].filter(
    (channel) => effectChannels(pixelSpec, background) & (1 << channel),
  );
  if (pixelSpec.kind === EffectKind.MedianBlur)
    return {
      ...source,
      data: medianSamples(
        source.data,
        source.width,
        source.height,
        4,
        rgbaChannels,
        pixelSpec.width,
        pixelSpec.height,
        pixelSpec.tiledMode ?? 0,
        writable,
      ),
    };
  if (pixelSpec.kind === EffectKind.ConvolutionMatrix)
    return {
      ...source,
      data: convolutionSamples(
        source.data,
        source.width,
        source.height,
        4,
        rgbaChannels,
        pixelSpec.preset,
        pixelSpec.tiledMode ?? 0,
        writable,
        (pixel) => source.data[pixel * 4 + 3] === 0,
        { kernelDivisorChannel: 3, useKernelDivisor: depth !== 8 },
      ),
    };
  const curve = pixelSpec.kind === EffectKind.ColorCurve ? colorCurveMap(pixelSpec.points) : null;
  const result = { ...source, data: source.data.slice() };
  const outlineSpec = pixelSpec.kind === EffectKind.Outline ? pixelSpec : null;
  const offsets = outlineSpec ? outlineOffsets(outlineSpec.matrix) : [];
  const emptyAt = outlineSpec
    ? (x: number, y: number) => transparent(colorAt(source, x, y), outlineSpec.bgColor)
    : null;
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      if (selection && !selectionContains(selection, x, y)) continue;
      const color = colorAt(source, x, y);
      let out: Rgba = color;
      if (outlineSpec) {
        const spec = outlineSpec;
        const outlineChannels = depth === 16 ? (spec.channels ?? 15) : channels;
        const hasNeighbor = outlineHasNeighbor(
          source.width,
          source.height,
          x,
          y,
          offsets,
          spec.tiledMode ?? 0,
          spec.place,
          emptyAt!,
        );
        if (
          hasNeighbor &&
          (spec.place === "outside"
            ? transparent(color, spec.bgColor)
            : !transparent(color, spec.bgColor))
        )
          out = color.map((v, c) =>
            outlineChannels & (1 << c) ? spec.color[c] : v,
          ) as unknown as Rgba;
      } else if (curve) {
        out = color.map((value, channel) =>
          rgbaChannels.includes(channel) ? curve[value] : value,
        ) as unknown as Rgba;
      } else if (depth === 16 && spec.kind === EffectKind.HueSaturation) {
        const k =
            channels & 16
              ? Math.trunc(
                  clamp(
                    (color[0] / UINT8_MAX) * (1 + clamp(spec.lightness, -100, 100) / 100),
                    0,
                    1,
                  ) *
                    UINT8_MAX +
                    0.5,
                )
              : color[0],
          a =
            color[3] && channels & 8
              ? Math.trunc(clamp(color[3] * (1 + clamp(spec.alpha, -100, 100) / 100), 0, UINT8_MAX))
              : color[3];
        out = [k, k, k, a];
      } else
        out = effectPixel(
          color,
          pixelSpec as Exclude<
            EffectSpec,
            {
              kind: EffectKind.Outline;
            }
          >,
          background,
        );
      result.data.set(out, (y * source.width + x) * 4);
    }
  return result;
}
function editable(t: SpriteTimeline, layer: number) {
  return (
    layerEditable(t, layer) &&
    effectiveLayerVisible(t, layer) &&
    !(t.layers[layer].flags & LAYER_REFERENCE)
  );
}
/** Effects require an active image and cannot target a reference layer. */
export function canOpenEffect(doc: EditorDocument | null): boolean {
  if (!doc) return false;
  const t = doc.timeline;
  return t
    ? !!t.frames[t.activeFrame]?.cels[t.activeLayer] &&
        !(t.layers[t.activeLayer].flags & LAYER_REFERENCE)
    : !doc.layer.emptyCel;
}
function affectedBounds(source: PixelBuffer, result: PixelBuffer): Rect | null {
  let x0 = source.width,
    y0 = source.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      const at = (y * source.width + x) * 4;
      if (source.data.subarray(at, at + 4).some((v, c) => v !== result.data[at + c])) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
function patchEffectCel(
  cel: TimelineCel,
  result: PixelBuffer,
  changed: Rect,
  background: boolean,
): TimelineCel | null {
  const x = Math.min(cel.x, changed.x),
    y = Math.min(cel.y, changed.y),
    width = Math.max(cel.x + cel.pixels.width, changed.x + changed.width) - x,
    height = Math.max(cel.y + cel.pixels.height, changed.y + changed.height) - y;
  assertDimension(width, "effect cel width");
  assertDimension(height, "effect cel height");
  assertPixelCount(width, height, "effect cel");
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < cel.pixels.height; row++)
    data.set(
      cel.pixels.data.subarray(row * cel.pixels.width * 4, (row + 1) * cel.pixels.width * 4),
      ((cel.y - y + row) * width + cel.x - x) * 4,
    );
  for (let row = changed.y; row < changed.y + changed.height; row++)
    data.set(
      result.data.subarray(
        (row * result.width + changed.x) * 4,
        (row * result.width + changed.x + changed.width) * 4,
      ),
      ((row - y) * width + changed.x - x) * 4,
    );
  if (background) return { ...cel, x, y, pixels: { width, height, data } };
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let v = 0; v < height; v++)
    for (let u = 0; u < width; u++)
      if (data[(v * width + u) * 4 + 3]) {
        x0 = Math.min(x0, u);
        y0 = Math.min(y0, v);
        x1 = Math.max(x1, u);
        y1 = Math.max(y1, v);
      }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1,
    trimmed = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++)
    trimmed.set(
      data.subarray(((row + y0) * width + x0) * 4, ((row + y0) * width + x0 + w) * 4),
      row * w * 4,
    );
  return { ...cel, x: x + x0, y: y + y0, pixels: { width: w, height: h, data: trimmed } };
}
/** Apply a filter as one document transaction. Shared image identities are
 * visited once; linked cels retain their relationship and relative offsets. */
export function applyDocumentEffect(
  document: EditorDocument,
  spec: EffectSpec,
  target: EffectTarget = EffectTarget.Selected,
  preview = false,
  mode: TilemapEditMode = TilesetMode.Auto,
): EditorDocument {
  if (document.timeline?.layers.some((layer) => layer.kind === "tilemap")) {
    if (
      document.timeline.colorDepth === 8 &&
      !document.selection &&
      (spec.kind === EffectKind.HueSaturation || spec.kind === EffectKind.BrightnessContrast)
    )
      return applyIndexedDocumentEffect(document, spec, target, preview);
    return applyTilemapDocumentEffect(document, spec, target, preview, mode);
  }
  const doc = { ...document, layer: { ...document.layer } },
    t = ensureTimeline(doc);
  if (t.colorDepth === 8) return applyIndexedDocumentEffect(document, spec, target, preview);
  const range = !preview && target === EffectTarget.Selected ? t.range : undefined;
  const frameIds = preview
    ? [t.activeFrame]
    : target === EffectTarget.All
      ? t.frames.map((_, i) => i)
      : range?.kind === "layers"
        ? t.frames.map((_, i) => i)
        : (range?.frames ?? [t.activeFrame]);
  const layerIds = preview
    ? [t.activeLayer]
    : target === EffectTarget.All
      ? t.layers.map((_, i) => i)
      : range?.kind === "frames"
        ? t.layers.map((_, i) => i)
        : (range?.layers ?? [t.activeLayer]);
  let timeline = t,
    changed = false;
  const visited = new Set<PixelBuffer>();
  for (const fi of frameIds)
    for (const li of layerIds) {
      const cel = t.frames[fi]?.cels[li];
      if (!cel || visited.has(cel.pixels) || !editable(t, li)) continue;
      visited.add(cel.pixels);
      const source = selectionLayerReference(cel, doc.width, doc.height),
        output = applyEffectPixels(
          source,
          spec,
          doc.selection,
          isBackgroundLayer(t.layers[li]),
          t.colorDepth ?? 32,
        ),
        bounds = affectedBounds(source, output);
      if (!bounds) continue;
      const patch = patchEffectCel(cel, output, bounds, isBackgroundLayer(t.layers[li]));
      changed = true;
      timeline = {
        ...timeline,
        frames: timeline.frames.map((frame) => ({
          ...frame,
          cels: frame.cels.map((link) =>
            link?.pixels !== cel.pixels
              ? link
              : patch
                ? {
                    ...link,
                    pixels: patch.pixels,
                    x: link.x + patch.x - cel.x,
                    y: link.y + patch.y - cel.y,
                  }
                : null,
          ),
        })),
      };
    }
  if (!changed) return document;
  doc.timeline = timeline;
  activateTimelineCel(doc, t.activeFrame, t.activeLayer);
  if (t.colorDepth === 16) normalizeAsepriteDocument(doc);
  return doc;
}
export const previewDocumentEffect = (
  doc: EditorDocument,
  spec: EffectSpec,
  mode: TilemapEditMode = TilesetMode.Auto,
) => applyDocumentEffect(doc, spec, EffectTarget.Selected, true, mode);
function grayscaleSpec(spec: EffectSpec, channels: number): EffectSpec {
  const gray = (c: Rgba): Rgba => {
    const v = Math.trunc((Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 2);
    return [v, v, v, c[3]];
  };
  const mapped = (channels & 16 ? 7 : 0) | (channels & 8);
  if (spec.kind === EffectKind.ReplaceColor)
    return { ...spec, channels: mapped, from: gray(spec.from), to: gray(spec.to) };
  if (spec.kind === EffectKind.Outline)
    return { ...spec, channels: mapped, color: gray(spec.color), bgColor: gray(spec.bgColor) };
  return { ...spec, channels: mapped };
}
function asepriteIndexFor(
  c: Rgba,
  palette: readonly Rgba[],
  mask: number,
  explicit?: number,
): number {
  if (explicit !== undefined) return Math.max(0, Math.min(UINT8_MAX, Math.trunc(explicit)));
  return asepriteBestFit(...c, paletteForColors(palette), mask);
}
/** Indexed documents keep their index bytes for direct index edits. Hue and
 * brightness changes without a mask update the palette while retaining cel
 * linkage. */
function applyIndexedDocumentEffect(
  document: EditorDocument,
  spec: EffectSpec,
  target: EffectTarget,
  preview: boolean,
): EditorDocument {
  const doc = { ...document, layer: { ...document.layer } },
    t = ensureTimeline(doc),
    colors = t.frames[t.activeFrame].palette ?? doc.palette ?? [];
  if (!colors.length) return document;
  if (
    !doc.selection &&
    (spec.kind === EffectKind.HueSaturation || spec.kind === EffectKind.BrightnessContrast)
  ) {
    const next = colors.map((c) => effectPixel(c, spec));
    if (next.every((c, i) => c.every((v, k) => v === colors[i][k]))) return document;
    updateAsepriteFramePalette(doc, next);
    return doc;
  }
  const range = !preview && target === EffectTarget.Selected ? t.range : undefined;
  const frameIds = preview
    ? [t.activeFrame]
    : target === EffectTarget.All || range?.kind === "layers"
      ? t.frames.map((_, i) => i)
      : (range?.frames ?? [t.activeFrame]);
  const layerIds = preview
    ? [t.activeLayer]
    : target === EffectTarget.All || range?.kind === "frames"
      ? t.layers.map((_, i) => i)
      : (range?.layers ?? [t.activeLayer]);
  let timeline = t,
    changed = false;
  const visited = new Set<AsepriteImageSamples | PixelBuffer>();
  for (const fi of frameIds)
    for (const li of layerIds) {
      const cel = t.frames[fi]?.cels[li];
      if (!cel || !editable(t, li)) continue;
      const identity = cel.asepriteSamples ?? cel.pixels;
      if (visited.has(identity)) continue;
      visited.add(identity);
      const palette = t.frames[fi].palette ?? doc.palette ?? colors,
        pal = paletteForColors(palette),
        background = isBackgroundLayer(t.layers[li]),
        mask = background ? -1 : (t.transparentIndex ?? 0);
      const asepriteSamples =
        cel.asepriteSamples?.depth === 8
          ? cel.asepriteSamples
          : encodeAsepriteSamples(cel.pixels, 8, pal, mask);
      const source = new Uint8Array(doc.width * doc.height).fill(t.transparentIndex ?? 0);
      for (
        let y = Math.max(0, cel.y);
        y < Math.min(doc.height, cel.y + asepriteSamples.height);
        y++
      )
        for (
          let x = Math.max(0, cel.x);
          x < Math.min(doc.width, cel.x + asepriteSamples.width);
          x++
        )
          source[y * doc.width + x] =
            asepriteSamples.data[(y - cel.y) * asepriteSamples.width + x - cel.x];
      const output = source.slice(),
        channels = effectChannels(spec, background, 8),
        color = (i: number) => palette[i] ?? ([0, 0, 0, UINT8_MAX] as Rgba);
      const advanced =
        spec.kind === EffectKind.MedianBlur ||
        spec.kind === EffectKind.ConvolutionMatrix ||
        spec.kind === EffectKind.ColorCurve;
      let advancedIndices: Uint8ClampedArray | null = null;
      let advancedColors: PixelBuffer | null = null;
      let originalColors: PixelBuffer | null = null;
      if (advanced) {
        const writable = (x: number, y: number) =>
          !doc.selection || selectionContains(doc.selection, x, y);
        if (channels & 32) {
          if (spec.kind === EffectKind.MedianBlur)
            advancedIndices = medianSamples(
              source,
              doc.width,
              doc.height,
              1,
              [0],
              spec.width,
              spec.height,
              spec.tiledMode ?? 0,
              writable,
            );
          else if (spec.kind === EffectKind.ConvolutionMatrix)
            advancedIndices = convolutionSamples(
              source,
              doc.width,
              doc.height,
              1,
              [0],
              spec.preset,
              spec.tiledMode ?? 0,
              writable,
              (pixel) => color(source[pixel])[3] === 0,
              { includeTransparentSamples: true, kernelDivisorChannel: 0 },
            );
          else if (spec.kind === EffectKind.ColorCurve) {
            const map = colorCurveMap(spec.points);
            advancedIndices = Uint8ClampedArray.from(source, (index) =>
              Math.min(palette.length - 1, map[index]),
            );
          }
        } else {
          // Indexed filters sample palette entries, including their stored alpha,
          // rather than the rendered transparent-index projection.
          const data = new Uint8ClampedArray(source.length * 4);
          for (let pixel = 0; pixel < source.length; pixel++)
            data.set(color(source[pixel]), pixel * 4);
          originalColors = { width: doc.width, height: doc.height, data };
          advancedColors = applyEffectPixels(
            originalColors,
            { ...spec, channels },
            doc.selection,
            background,
            8,
          );
        }
      }
      const from =
          spec.kind === EffectKind.ReplaceColor
            ? asepriteIndexFor(spec.from, palette, mask, spec.fromIndex)
            : 0,
        to =
          spec.kind === EffectKind.ReplaceColor
            ? asepriteIndexFor(spec.to, palette, mask, spec.toIndex)
            : 0;
      const outlineColor =
          spec.kind === EffectKind.Outline
            ? asepriteIndexFor(spec.color, palette, mask, spec.colorIndex)
            : 0,
        bg =
          spec.kind === EffectKind.Outline
            ? asepriteIndexFor(spec.bgColor, palette, mask, spec.bgIndex)
            : 0;
      const outlineMatrix = spec.kind === EffectKind.Outline ? outlineOffsets(spec.matrix) : [];
      const indexedEmptyAt =
        spec.kind === EffectKind.Outline
          ? (x: number, y: number) => {
              const index = source[y * doc.width + x];
              return !color(index)[3] || index === bg;
            }
          : null;
      let x0 = doc.width,
        y0 = doc.height,
        x1 = -1,
        y1 = -1;
      for (let y = 0; y < doc.height; y++)
        for (let x = 0; x < doc.width; x++) {
          if (doc.selection && !selectionContains(doc.selection, x, y)) continue;
          const at = y * doc.width + x,
            index = source[at],
            rgba = color(index);
          let next = index;
          if (advancedIndices) next = advancedIndices[at];
          else if (advancedColors && originalColors) {
            const filtered = colorAt(advancedColors, x, y);
            const original = colorAt(originalColors, x, y);
            // Equal-color edits retain duplicate palette-index identity.
            if (filtered.some((value, channel) => value !== original[channel]))
              next = asepriteBestFit(...filtered, pal, mask);
          } else if (spec.kind === EffectKind.ReplaceColor) {
            if (channels & 32) {
              if (index >= from && index - from <= clamp(spec.tolerance, 0, UINT8_MAX)) next = to;
            } else {
              const c = effectPixel(rgba, { ...spec, from: color(from), to: color(to), channels });
              next = asepriteBestFit(...c, pal, mask);
            }
          } else if (spec.kind === EffectKind.Invert)
            next =
              channels & 32
                ? index ^ UINT8_MAX
                : asepriteBestFit(...effectPixel(rgba, { ...spec, channels }), pal, mask);
          else if (spec.kind === EffectKind.Outline) {
            const hasNeighbor = outlineHasNeighbor(
              doc.width,
              doc.height,
              x,
              y,
              outlineMatrix,
              spec.tiledMode ?? 0,
              spec.place,
              indexedEmptyAt!,
            );
            const isEmpty = channels & 32 ? index === bg : !rgba[3] || index === bg;
            if (hasNeighbor && (spec.place === "outside" ? isEmpty : !isEmpty)) {
              if (channels & 32) next = outlineColor;
              else {
                const to = color(outlineColor),
                  c = rgba.map((v, k) => (channels & (1 << k) ? to[k] : v)) as unknown as Rgba;
                next = asepriteBestFit(...c, pal, mask);
              }
            }
          } else next = asepriteBestFit(...effectPixel(rgba, { ...spec, channels }), pal, mask);
          output[at] = next;
          if (next !== index) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
        }
      if (x1 < 0) continue;
      const bx = Math.min(cel.x, x0),
        by = Math.min(cel.y, y0),
        width = Math.max(cel.x + asepriteSamples.width, x1 + 1) - bx,
        height = Math.max(cel.y + asepriteSamples.height, y1 + 1) - by;
      assertDimension(width, "effect cel width");
      assertDimension(height, "effect cel height");
      assertPixelCount(width, height, "effect cel");
      const data = new Uint8Array(width * height).fill(t.transparentIndex ?? 0);
      for (let y = 0; y < asepriteSamples.height; y++)
        data.set(
          asepriteSamples.data.subarray(y * asepriteSamples.width, (y + 1) * asepriteSamples.width),
          (cel.y - by + y) * width + cel.x - bx,
        );
      for (let y = y0; y <= y1; y++)
        data.set(
          output.subarray(y * doc.width + x0, y * doc.width + x1 + 1),
          (y - by) * width + x0 - bx,
        );
      let left = background ? 0 : width,
        top = background ? 0 : height,
        right = background ? width - 1 : -1,
        bottom = background ? height - 1 : -1;
      if (!background)
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            if (data[y * width + x] !== mask) {
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
      const w = right - left + 1,
        h = bottom - top + 1,
        newAsepriteSamples: AsepriteImageSamples | null =
          right < 0 ? null : { depth: 8, width: w, height: h, data: new Uint8Array(w * h) };
      if (newAsepriteSamples)
        for (let y = 0; y < h; y++)
          newAsepriteSamples.data.set(
            data.subarray((y + top) * width + left, (y + top) * width + left + w),
            y * w,
          );
      timeline = {
        ...timeline,
        frames: timeline.frames.map((frame) => ({
          ...frame,
          cels: frame.cels.map((link, l) => {
            if (!link || (link.asepriteSamples ?? link.pixels) !== identity) return link;
            if (!newAsepriteSamples) return null;
            const pixels = {
              width: w,
              height: h,
              data: expandAsepriteSamples(
                newAsepriteSamples,
                paletteForColors(frame.palette ?? doc.palette ?? colors),
                isBackgroundLayer(t.layers[l]) ? -1 : (t.transparentIndex ?? 0),
              ),
            };
            return {
              ...link,
              asepriteSamples: newAsepriteSamples,
              pixels,
              x: link.x + bx + left - cel.x,
              y: link.y + by + top - cel.y,
            };
          }),
        })),
      };
      changed = true;
    }
  if (!changed) return document;
  doc.timeline = timeline;
  activateTimelineCel(doc, t.activeFrame, t.activeLayer);
  return doc;
}

/** Visit each shared cel image once and route pixel changes through the active
 * tileset mode. Later cels see earlier edits to a shared tile. */
function applyTilemapDocumentEffect(
  document: EditorDocument,
  spec: EffectSpec,
  target: EffectTarget,
  preview: boolean,
  mode: TilemapEditMode,
): EditorDocument {
  const original = document.timeline!,
    range = !preview && target === EffectTarget.Selected ? original.range : undefined;
  const frames = preview
    ? [original.activeFrame]
    : target === EffectTarget.All || range?.kind === "layers"
      ? original.frames.map((_, i) => i)
      : (range?.frames ?? [original.activeFrame]);
  const layers = preview
    ? [original.activeLayer]
    : target === EffectTarget.All || range?.kind === "frames"
      ? original.layers.map((_, i) => i)
      : (range?.layers ?? [original.activeLayer]);
  let timeline = original,
    changed = false;
  const visited = new Set<unknown>();
  for (const fi of frames)
    for (const li of layers) {
      const initial = original.frames[fi]?.cels[li];
      if (!initial || !editable(original, li)) continue;
      const identity = initial.tilemap ?? initial.asepriteSamples ?? initial.pixels;
      if (visited.has(identity)) continue;
      visited.add(identity);
      const cel = timeline.frames[fi]?.cels[li];
      if (!cel) continue;
      const palette = timeline.frames[fi].palette ?? document.palette;
      let asepriteSamples = cel.asepriteSamples;
      if (cel.tilemap && (timeline.colorDepth === 8 || timeline.colorDepth === 16)) {
        const set = tilesetForLayer(timeline, li),
          depth = timeline.colorDepth;
        asepriteSamples = rasterizeTilemapSamples(
          cel.tilemap,
          set.asepritePixels
            ? set
            : {
                ...set,
                asepritePixels: encodeAsepriteSamples(
                  {
                    width: set.tileWidth,
                    height: set.tileHeight * set.tileCount,
                    data: new Uint8ClampedArray(set.pixels),
                  },
                  depth,
                  paletteForColors(palette),
                  timeline.transparentIndex ?? 0,
                ).data,
              },
          depth,
          timeline.transparentIndex,
        );
      }
      const raster = { ...cel, tilemap: undefined, asepriteSamples };
      const proxy: EditorDocument = {
        ...document,
        palette,
        layer: { ...document.layer },
        timeline: {
          ...timeline,
          tilesets: undefined,
          range: undefined,
          activeFrame: 0,
          activeLayer: 0,
          layers: [{ ...timeline.layers[li], kind: "image", tilesetId: undefined }],
          frames: [{ ...timeline.frames[fi], cels: [raster] }],
        },
      };
      activateTimelineCel(proxy, 0, 0);
      const filtered = applyDocumentEffect(proxy, spec);
      if (filtered === proxy) continue;
      changed = true;
      const patch = filtered.timeline!.frames[0].cels[0];
      if (cel.tilemap) {
        const pixels = patch?.pixels ?? {
          ...cel.pixels,
          data: new Uint8ClampedArray(cel.pixels.data.length),
        };
        let samples = patch?.asepriteSamples;
        if (!patch && (timeline.colorDepth === 8 || timeline.colorDepth === 16)) {
          const data = new Uint8Array(
            pixels.width * pixels.height * (timeline.colorDepth / BITS_PER_BYTE),
          );
          if (timeline.colorDepth === 8) data.fill(timeline.transparentIndex ?? 0);
          samples = {
            depth: timeline.colorDepth,
            width: pixels.width,
            height: pixels.height,
            data,
          };
        }
        timeline = commitTilemapPixels(
          timeline,
          fi,
          li,
          pixels,
          patch?.x ?? cel.x,
          patch?.y ?? cel.y,
          mode,
          samples,
        );
      } else {
        timeline = {
          ...timeline,
          frames: timeline.frames.map((frame) => ({
            ...frame,
            cels: frame.cels.map((link) =>
              !link || (link.asepriteSamples ?? link.pixels) !== (cel.asepriteSamples ?? cel.pixels)
                ? link
                : patch
                  ? {
                      ...link,
                      pixels: patch.pixels,
                      asepriteSamples: patch.asepriteSamples,
                      x: link.x + patch.x - cel.x,
                      y: link.y + patch.y - cel.y,
                    }
                  : null,
            ),
          })),
        };
      }
    }
  if (!changed) return document;
  const doc = {
    ...document,
    layer: { ...document.layer },
    timeline: refreshTilemapProjections(timeline),
  };
  activateTimelineCel(doc, original.activeFrame, original.activeLayer);
  return doc;
}
