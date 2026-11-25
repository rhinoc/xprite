import { BYTE_ROUNDING_BIAS, UINT8_MAX, BITS_PER_BYTE } from "$/base/numeric-constants";
import type { PixelBuffer, PixelMask, Rect, Rgba } from "$/base/primitives";
import { createOpaquePaletteMatcher, labToRgb } from "$/color";
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
import {
  cleanPixels,
  hasSemiTransparentPixels,
  type PixelCleanupOptions,
} from "$/image-editing/pixel-cleanup";
import {
  darkenOutlineSample,
  selectiveOutlinePaletteMatcher,
  selectiveOutlineSampler,
} from "$/image-editing/selective-outline";
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
  CleanPixels = "clean-pixels",
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
export enum OutlineColorMode {
  Solid = "solid",
  Selective = "selective",
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
    | { kind: EffectKind.CleanPixels; options: PixelCleanupOptions }
    | {
        kind: EffectKind.Outline;
        colorMode?: OutlineColorMode;
        darkening?: number;
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
export const OUTLINE_DARKENING = { min: 1, max: 100, default: 30 } as const;
const RGBA_BYTES_PER_PIXEL = 4;
const BYTE_VALUE_COUNT = UINT8_MAX + 1;
const CHANNEL_RED = 1;
const CHANNEL_GREEN = 2;
const CHANNEL_BLUE = 4;
const CHANNEL_ALPHA = 8;
const CHANNEL_GRAY = 16;
const CHANNEL_INDEX = 32;
const RGB_CHANNELS_MASK = CHANNEL_RED | CHANNEL_GREEN | CHANNEL_BLUE;
const RGBA_CHANNELS_MASK = RGB_CHANNELS_MASK | CHANNEL_ALPHA;
const HUE_MAX_DEGREES = 360;
const HUE_HALF_DEGREES = 180;
const HUE_SECTOR_DEGREES = 60;
const PERCENT_SCALE = 100;
const HSL_LIGHTNESS_DIVISOR = UINT8_MAX * 2;
const INVERT_LUT = Uint8Array.from({ length: BYTE_VALUE_COUNT }, (_, value) => UINT8_MAX - value);
const clamp = (v: number, min: number, max: number) =>
  clampNumber(Number.isFinite(v) ? v : 0, min, max);
type OutlineSpec = Extract<EffectSpec, { kind: EffectKind.Outline }>;
const outlineShadeScale = ({ darkening }: OutlineSpec) =>
  1 -
  clamp(
    darkening !== undefined && Number.isFinite(darkening) ? darkening : OUTLINE_DARKENING.default,
    OUTLINE_DARKENING.min,
    OUTLINE_DARKENING.max,
  ) /
    PERCENT_SCALE;
export const effectChannels = (spec: EffectSpec, background = false, depth: 8 | 16 | 32 = 32) => {
  if (spec.kind === EffectKind.Outline && spec.colorMode === OutlineColorMode.Selective) {
    if (depth === 8) return CHANNEL_INDEX;
    return (depth === 16 ? CHANNEL_GRAY : RGB_CHANNELS_MASK) | (background ? 0 : CHANNEL_ALPHA);
  }
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
    case EffectKind.CleanPixels:
      return { kind, options: {} };
    case EffectKind.Outline:
      return {
        kind,
        colorMode: OutlineColorMode.Solid,
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
function writeHueSaturationPixel(
  red: number,
  green: number,
  blue: number,
  alpha0: number,
  hsl: boolean,
  multiply: boolean,
  hueShift: number,
  satAmount: number,
  levelChange: number,
  alphaFactor: number,
  doR: boolean,
  doG: boolean,
  doB: boolean,
  doA: boolean,
  dstData: Uint8ClampedArray,
  dstAt: number,
): void {
  const alpha = alpha0 && doA ? Math.trunc(clamp(alpha0 * alphaFactor, 0, UINT8_MAX)) : alpha0;
  if (alpha === 0) {
    dstData[dstAt] = 0;
    dstData[dstAt + 1] = 0;
    dstData[dstAt + 2] = 0;
    dstData[dstAt + 3] = 0;
    return;
  }
  if (!doR && !doG && !doB) {
    dstData[dstAt] = red;
    dstData[dstAt + 1] = green;
    dstData[dstAt + 2] = blue;
    dstData[dstAt + 3] = alpha;
    return;
  }
  const high = red > green ? (red > blue ? red : blue) : green > blue ? green : blue;
  const low = red < green ? (red < blue ? red : blue) : green < blue ? green : blue;
  const delta = high - low;
  const lightness = hsl ? (high + low) / HSL_LIGHTNESS_DIVISOR : high / UINT8_MAX;
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
    hue = (((sector * HUE_SECTOR_DEGREES) % HUE_MAX_DEGREES) + HUE_MAX_DEGREES) % HUE_MAX_DEGREES;
  }
  hue = (hue + hueShift + HUE_MAX_DEGREES) % HUE_MAX_DEGREES;
  const saturation = clamp(
    multiply ? originalSaturation * (1 + satAmount) : originalSaturation + satAmount,
    0,
    1,
  );
  const level = clamp(multiply ? lightness * (1 + levelChange) : lightness + levelChange, 0, 1);
  const chroma = (hsl ? 1 - Math.abs(2 * level - 1) : level) * saturation;
  const sector = hue / HUE_SECTOR_DEGREES;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  let r1: number;
  let g1: number;
  let b1: number;
  if (sector < 1) {
    r1 = chroma;
    g1 = secondary;
    b1 = 0;
  } else if (sector < 2) {
    r1 = secondary;
    g1 = chroma;
    b1 = 0;
  } else if (sector < 3) {
    r1 = 0;
    g1 = chroma;
    b1 = secondary;
  } else if (sector < 4) {
    r1 = 0;
    g1 = secondary;
    b1 = chroma;
  } else if (sector < 5) {
    r1 = secondary;
    g1 = 0;
    b1 = chroma;
  } else {
    r1 = chroma;
    g1 = 0;
    b1 = secondary;
  }
  const offset = hsl ? level - chroma / 2 : level - chroma;
  dstData[dstAt] = doR ? Math.trunc((r1 + offset) * UINT8_MAX + 0.5) : red;
  dstData[dstAt + 1] = doG ? Math.trunc((g1 + offset) * UINT8_MAX + 0.5) : green;
  dstData[dstAt + 2] = doB ? Math.trunc((b1 + offset) * UINT8_MAX + 0.5) : blue;
  dstData[dstAt + 3] = alpha;
}
const hueScratch = new Uint8ClampedArray(RGBA_BYTES_PER_PIXEL);
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
  writeHueSaturationPixel(
    color[0],
    color[1],
    color[2],
    color[3],
    spec.mode.startsWith("hsl"),
    spec.mode.endsWith("mul"),
    clamp(spec.hue, -HUE_HALF_DEGREES, HUE_HALF_DEGREES),
    clamp(spec.saturation, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE,
    clamp(spec.lightness, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE,
    1 + clamp(spec.alpha, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE,
    (channels & CHANNEL_RED) !== 0,
    (channels & CHANNEL_GREEN) !== 0,
    (channels & CHANNEL_BLUE) !== 0,
    (channels & CHANNEL_ALPHA) !== 0,
    hueScratch,
    0,
  );
  return [hueScratch[0], hueScratch[1], hueScratch[2], hueScratch[3]];
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
  if (
    spec.kind === EffectKind.MedianBlur ||
    spec.kind === EffectKind.ConvolutionMatrix ||
    spec.kind === EffectKind.CleanPixels
  )
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
function forEachSelectedOffset(
  width: number,
  height: number,
  selection: PixelMask,
  visit: (at: number) => void,
): void {
  const selX = selection.x;
  const selY = selection.y;
  const selWidth = selection.width;
  const selData = selection.data;
  const startY = Math.max(0, selY);
  const endY = Math.min(height, selY + selection.height);
  const startX = Math.max(0, selX);
  const endX = Math.min(width, selX + selWidth);
  for (let y = startY; y < endY; y++) {
    const maskRow = (y - selY) * selWidth - selX;
    const pixelRow = y * width;
    for (let x = startX; x < endX; x++) {
      if (selData[maskRow + x]) visit((pixelRow + x) * RGBA_BYTES_PER_PIXEL);
    }
  }
}
function applyChannelLut(
  srcData: Uint8ClampedArray,
  dstData: Uint8ClampedArray,
  width: number,
  height: number,
  selection: PixelMask | null,
  channelMask: number,
  lut: Uint8Array,
): void {
  const doR = (channelMask & CHANNEL_RED) !== 0;
  const doG = (channelMask & CHANNEL_GREEN) !== 0;
  const doB = (channelMask & CHANNEL_BLUE) !== 0;
  const doA = (channelMask & CHANNEL_ALPHA) !== 0;
  if (!doR && !doG && !doB && !doA) return;
  if (!selection) {
    const length = srcData.length;
    if (doR && doG && doB && !doA) {
      for (let at = 0; at < length; at += RGBA_BYTES_PER_PIXEL) {
        dstData[at] = lut[srcData[at]];
        dstData[at + 1] = lut[srcData[at + 1]];
        dstData[at + 2] = lut[srcData[at + 2]];
      }
    } else if (doR && doG && doB && doA) {
      for (let at = 0; at < length; at++) {
        dstData[at] = lut[srcData[at]];
      }
    } else {
      for (let at = 0; at < length; at += RGBA_BYTES_PER_PIXEL) {
        if (doR) dstData[at] = lut[srcData[at]];
        if (doG) dstData[at + 1] = lut[srcData[at + 1]];
        if (doB) dstData[at + 2] = lut[srcData[at + 2]];
        if (doA) dstData[at + 3] = lut[srcData[at + 3]];
      }
    }
    return;
  }
  forEachSelectedOffset(width, height, selection, (at) => {
    if (doR) dstData[at] = lut[srcData[at]];
    if (doG) dstData[at + 1] = lut[srcData[at + 1]];
    if (doB) dstData[at + 2] = lut[srcData[at + 2]];
    if (doA) dstData[at + 3] = lut[srcData[at + 3]];
  });
}
function applyGrayscaleHueSaturationPixels(
  srcData: Uint8ClampedArray,
  dstData: Uint8ClampedArray,
  width: number,
  height: number,
  selection: PixelMask | null,
  spec: Extract<EffectSpec, { kind: EffectKind.HueSaturation }>,
  channels: number,
): void {
  const lightnessFactor = 1 + clamp(spec.lightness, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE;
  const alphaFactor = 1 + clamp(spec.alpha, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE;
  const adjustGray = (channels & CHANNEL_GRAY) !== 0;
  const adjustAlpha = (channels & CHANNEL_ALPHA) !== 0;
  const grayLut = new Uint8Array(BYTE_VALUE_COUNT);
  const alphaLut = new Uint8Array(BYTE_VALUE_COUNT);
  for (let i = 0; i < BYTE_VALUE_COUNT; i++) {
    grayLut[i] = adjustGray
      ? Math.trunc(clamp((i / UINT8_MAX) * lightnessFactor, 0, 1) * UINT8_MAX + 0.5)
      : i;
    alphaLut[i] = i && adjustAlpha ? Math.trunc(clamp(i * alphaFactor, 0, UINT8_MAX)) : i;
  }
  const processAt = (at: number) => {
    const k = grayLut[srcData[at]];
    dstData[at] = k;
    dstData[at + 1] = k;
    dstData[at + 2] = k;
    dstData[at + 3] = alphaLut[srcData[at + 3]];
  };
  if (!selection) {
    for (let at = 0; at < srcData.length; at += RGBA_BYTES_PER_PIXEL) processAt(at);
    return;
  }
  forEachSelectedOffset(width, height, selection, processAt);
}
function applyHueSaturationPixels(
  srcData: Uint8ClampedArray,
  dstData: Uint8ClampedArray,
  width: number,
  height: number,
  selection: PixelMask | null,
  spec: Extract<EffectSpec, { kind: EffectKind.HueSaturation }>,
  channels: number,
): void {
  const hsl = spec.mode.startsWith("hsl");
  const multiply = spec.mode.endsWith("mul");
  const hueShift = clamp(spec.hue, -HUE_HALF_DEGREES, HUE_HALF_DEGREES);
  const satAmount = clamp(spec.saturation, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE;
  const levelChange = clamp(spec.lightness, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE;
  const alphaFactor = 1 + clamp(spec.alpha, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE;
  const doR = (channels & CHANNEL_RED) !== 0;
  const doG = (channels & CHANNEL_GREEN) !== 0;
  const doB = (channels & CHANNEL_BLUE) !== 0;
  const doA = (channels & CHANNEL_ALPHA) !== 0;
  const processAt = (at: number) => {
    writeHueSaturationPixel(
      srcData[at],
      srcData[at + 1],
      srcData[at + 2],
      srcData[at + 3],
      hsl,
      multiply,
      hueShift,
      satAmount,
      levelChange,
      alphaFactor,
      doR,
      doG,
      doB,
      doA,
      dstData,
      at,
    );
  };
  if (!selection) {
    for (let at = 0; at < srcData.length; at += RGBA_BYTES_PER_PIXEL) processAt(at);
    return;
  }
  forEachSelectedOffset(width, height, selection, processAt);
}
function applyReplaceColorPixels(
  srcData: Uint8ClampedArray,
  dstData: Uint8ClampedArray,
  width: number,
  height: number,
  selection: PixelMask | null,
  spec: Extract<EffectSpec, { kind: EffectKind.ReplaceColor }>,
  channels: number,
): void {
  const tolerance = Math.round(clamp(spec.tolerance, 0, UINT8_MAX));
  const fromR = spec.from[0];
  const fromG = spec.from[1];
  const fromB = spec.from[2];
  const fromA = spec.from[3];
  const toR = spec.to[0];
  const toG = spec.to[1];
  const toB = spec.to[2];
  const toA = spec.to[3];
  const doR = (channels & CHANNEL_RED) !== 0;
  const doG = (channels & CHANNEL_GREEN) !== 0;
  const doB = (channels & CHANNEL_BLUE) !== 0;
  const doA = (channels & CHANNEL_ALPHA) !== 0;
  if (!doR && !doG && !doB && !doA) return;
  const processAt = (at: number) => {
    if (
      (!doR || Math.abs(srcData[at] - fromR) <= tolerance) &&
      (!doG || Math.abs(srcData[at + 1] - fromG) <= tolerance) &&
      (!doB || Math.abs(srcData[at + 2] - fromB) <= tolerance) &&
      (!doA || Math.abs(srcData[at + 3] - fromA) <= tolerance)
    ) {
      if (doR) dstData[at] = toR;
      if (doG) dstData[at + 1] = toG;
      if (doB) dstData[at + 2] = toB;
      if (doA) dstData[at + 3] = toA;
    }
  };
  if (!selection) {
    for (let at = 0; at < srcData.length; at += RGBA_BYTES_PER_PIXEL) processAt(at);
    return;
  }
  forEachSelectedOffset(width, height, selection, processAt);
}
function applyOutlinePixels(
  srcData: Uint8ClampedArray,
  dstData: Uint8ClampedArray,
  width: number,
  height: number,
  selection: PixelMask | null,
  spec: Extract<EffectSpec, { kind: EffectKind.Outline }>,
  outlineChannels: number,
): void {
  const offsets = outlineOffsets(spec.matrix);
  const offsetCount = offsets.length;
  if (!offsetCount) return;
  const doR = (outlineChannels & CHANNEL_RED) !== 0;
  const doG = (outlineChannels & CHANNEL_GREEN) !== 0;
  const doB = (outlineChannels & CHANNEL_BLUE) !== 0;
  const doA = (outlineChannels & CHANNEL_ALPHA) !== 0;
  if (!doR && !doG && !doB && !doA) return;
  const offsetDx = new Int8Array(offsetCount);
  const offsetDy = new Int8Array(offsetCount);
  for (let k = 0; k < offsetCount; k++) {
    offsetDx[k] = offsets[k][0];
    offsetDy[k] = offsets[k][1];
  }
  const bgR = spec.bgColor[0];
  const bgG = spec.bgColor[1];
  const bgB = spec.bgColor[2];
  const bgA = spec.bgColor[3];
  const pixelCount = width * height;
  const emptyMask = new Uint8Array(pixelCount);
  for (let i = 0, at = 0; i < pixelCount; i++, at += RGBA_BYTES_PER_PIXEL) {
    const a = srcData[at + 3];
    if (
      a === 0 ||
      (a === bgA && srcData[at] === bgR && srcData[at + 1] === bgG && srcData[at + 2] === bgB)
    ) {
      emptyMask[i] = 1;
    }
  }
  const wantEmpty = spec.place === "outside" ? 1 : 0;
  const neighborWantEmpty = wantEmpty ^ 1;
  const tiledMode = spec.tiledMode ?? 0;
  const tiledX = (tiledMode & 1) !== 0;
  const tiledY = (tiledMode & 2) !== 0;
  const outR = spec.color[0];
  const outG = spec.color[1];
  const outB = spec.color[2];
  const outA = spec.color[3];
  const startY = selection ? Math.max(0, selection.y) : 0;
  const endY = selection ? Math.min(height, selection.y + selection.height) : height;
  const startX = selection ? Math.max(0, selection.x) : 0;
  const endX = selection ? Math.min(width, selection.x + selection.width) : width;
  const selX = selection?.x ?? 0;
  const selY = selection?.y ?? 0;
  const selWidth = selection?.width ?? 0;
  const selData = selection?.data ?? null;
  for (let y = startY; y < endY; y++) {
    const pixelRow = y * width;
    const maskRow = selData ? (y - selY) * selWidth - selX : 0;
    for (let x = startX; x < endX; x++) {
      if (selData && !selData[maskRow + x]) continue;
      const pixelIndex = pixelRow + x;
      if (emptyMask[pixelIndex] !== wantEmpty) continue;
      let hasNeighbor = false;
      for (let k = 0; k < offsetCount; k++) {
        let nx = x + offsetDx[k];
        if (nx < 0) nx = tiledX ? nx + width : 0;
        else if (nx >= width) nx = tiledX ? nx - width : width - 1;
        let ny = y + offsetDy[k];
        if (ny < 0) ny = tiledY ? ny + height : 0;
        else if (ny >= height) ny = tiledY ? ny - height : height - 1;
        if (emptyMask[ny * width + nx] === neighborWantEmpty) {
          hasNeighbor = true;
          break;
        }
      }
      if (!hasNeighbor) continue;
      const at = pixelIndex * RGBA_BYTES_PER_PIXEL;
      if (doR) dstData[at] = outR;
      if (doG) dstData[at + 1] = outG;
      if (doB) dstData[at + 2] = outB;
      if (doA) dstData[at + 3] = outA;
    }
  }
}
function applySelectiveOutlinePixels(
  source: PixelBuffer,
  destination: Uint8ClampedArray,
  selection: PixelMask | null,
  spec: OutlineSpec,
): void {
  const { width, height, data } = source;
  const offsets = outlineOffsets(spec.matrix);
  if (!offsets.length) return;
  const [bgR, bgG, bgB, bgA] = spec.bgColor;
  const sample = selectiveOutlineSampler(
    width,
    height,
    offsets,
    spec.tiledMode ?? 0,
    spec.place === "outside",
    (pixel) => {
      const at = pixel * RGBA_BYTES_PER_PIXEL;
      return (
        data[at + 3] === 0 ||
        (data[at] === bgR && data[at + 1] === bgG && data[at + 2] === bgB && data[at + 3] === bgA)
      );
    },
    (pixel) => {
      const at = pixel * RGBA_BYTES_PER_PIXEL;
      return [data[at], data[at + 1], data[at + 2], data[at + 3]];
    },
  );
  const scale = outlineShadeScale(spec);
  const processAt = (at: number) => {
    const pixel = at / RGBA_BYTES_PER_PIXEL;
    const sampled = sample(pixel % width, Math.floor(pixel / width));
    if (sampled) destination.set(labToRgb(darkenOutlineSample(sampled, scale)), at);
  };
  if (selection) forEachSelectedOffset(width, height, selection, processAt);
  else for (let at = 0; at < data.length; at += RGBA_BYTES_PER_PIXEL) processAt(at);
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
  palette: readonly Rgba[] = [],
): PixelBuffer {
  assertDimension(source.width, "filter width");
  assertDimension(source.height, "filter height");
  assertPixelCount(source.width, source.height, "filter");
  if (spec.kind === EffectKind.CleanPixels)
    return cleanPixels(source, spec.options, {
      selection,
      background,
      palette: cleanupPalette(palette, depth),
    });
  const channels = effectChannels(spec, background, depth);
  const pixelSpec = depth === 16 ? grayscaleSpec(spec, channels) : spec;
  const pixelChannels = effectChannels(pixelSpec, background);
  const writable = (x: number, y: number) => !selection || selectionContains(selection, x, y);
  const rgbaChannels = [0, 1, 2, 3].filter((channel) => pixelChannels & (1 << channel));
  if (pixelSpec.kind === EffectKind.MedianBlur)
    return {
      ...source,
      data: medianSamples(
        source.data,
        source.width,
        source.height,
        RGBA_BYTES_PER_PIXEL,
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
        RGBA_BYTES_PER_PIXEL,
        rgbaChannels,
        pixelSpec.preset,
        pixelSpec.tiledMode ?? 0,
        writable,
        (pixel) => source.data[pixel * RGBA_BYTES_PER_PIXEL + 3] === 0,
        { kernelDivisorChannel: 3, useKernelDivisor: depth !== 8 },
      ),
    };
  const srcData = source.data;
  const dstData = srcData.slice();
  const { width, height } = source;
  if (pixelSpec.kind === EffectKind.Outline) {
    if (pixelSpec.colorMode === OutlineColorMode.Selective)
      applySelectiveOutlinePixels(source, dstData, selection, pixelSpec);
    else {
      const outlineChannels = depth === 16 ? (pixelSpec.channels ?? RGBA_CHANNELS_MASK) : channels;
      applyOutlinePixels(srcData, dstData, width, height, selection, pixelSpec, outlineChannels);
    }
  } else if (pixelSpec.kind === EffectKind.ColorCurve) {
    applyChannelLut(
      srcData,
      dstData,
      width,
      height,
      selection,
      pixelChannels,
      colorCurveMap(pixelSpec.points),
    );
  } else if (pixelSpec.kind === EffectKind.Invert) {
    applyChannelLut(srcData, dstData, width, height, selection, pixelChannels, INVERT_LUT);
  } else if (pixelSpec.kind === EffectKind.BrightnessContrast) {
    const brightness = clamp(pixelSpec.brightness, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE;
    const contrast = clamp(pixelSpec.contrast, -PERCENT_SCALE, PERCENT_SCALE) / PERCENT_SCALE;
    const lut = new Uint8Array(BYTE_VALUE_COUNT);
    for (let i = 0; i < BYTE_VALUE_COUNT; i++) {
      lut[i] = brightnessContrastValue(i, brightness, contrast);
    }
    applyChannelLut(
      srcData,
      dstData,
      width,
      height,
      selection,
      pixelChannels & RGB_CHANNELS_MASK,
      lut,
    );
  } else if (depth === 16 && spec.kind === EffectKind.HueSaturation) {
    applyGrayscaleHueSaturationPixels(srcData, dstData, width, height, selection, spec, channels);
  } else if (pixelSpec.kind === EffectKind.HueSaturation) {
    applyHueSaturationPixels(srcData, dstData, width, height, selection, pixelSpec, pixelChannels);
  } else if (pixelSpec.kind === EffectKind.ReplaceColor) {
    applyReplaceColorPixels(srcData, dstData, width, height, selection, pixelSpec, pixelChannels);
  }
  return { ...source, data: dstData };
}
function editable(t: SpriteTimeline, layer: number) {
  return (
    layerEditable(t, layer) &&
    effectiveLayerVisible(t, layer) &&
    !(t.layers[layer].flags & LAYER_REFERENCE)
  );
}

function effectCelScope(
  t: SpriteTimeline,
  target: EffectTarget,
  preview: boolean,
  previewTargetLayers = false,
) {
  const range =
    (!preview || previewTargetLayers) && target === EffectTarget.Selected ? t.range : undefined;
  return {
    frames: preview
      ? [t.activeFrame]
      : target === EffectTarget.All || range?.kind === "layers"
        ? t.frames.map((_, i) => i)
        : (range?.frames ?? [t.activeFrame]),
    layers:
      preview && !previewTargetLayers
        ? [t.activeLayer]
        : target === EffectTarget.All || range?.kind === "frames"
          ? t.layers.map((_, i) => i)
          : (range?.layers ?? [t.activeLayer]),
  };
}

function cleanupPalette(palette: readonly Rgba[], depth: 8 | 16 | 32): readonly Rgba[] {
  if (depth === 8) return [];
  return depth === 16 ? palette.filter(([r, g, b]) => r === g && g === b) : palette;
}

export function cleanupEffectAvailability(document: EditorDocument, target: EffectTarget) {
  const availability = { cleanDoubles: false, snapToPalette: false, crispAlpha: false };
  const t = document.timeline ?? ensureTimeline({ ...document });
  const { frames, layers } = effectCelScope(t, target, false);
  const visited = new Set<unknown>();
  for (const fi of frames)
    for (const li of layers) {
      const cel = t.frames[fi]?.cels[li];
      if (!cel || !editable(t, li)) continue;
      const identity = cel.tilemap ?? cel.asepriteSamples ?? cel.pixels;
      if (visited.has(identity)) continue;
      visited.add(identity);
      const palette = t.frames[fi].palette ?? document.palette ?? [];
      if (!availability.snapToPalette)
        availability.snapToPalette = cleanupPalette(palette, t.colorDepth ?? 32).some(
          (color) => color[3] === UINT8_MAX,
        );
      if (isBackgroundLayer(t.layers[li])) continue;
      availability.cleanDoubles = true;
      const selection = document.selection;
      if (!availability.crispAlpha)
        availability.crispAlpha = hasSemiTransparentPixels(cel.pixels, {
          bounds: { x: -cel.x, y: -cel.y, width: document.width, height: document.height },
          selection: selection && { ...selection, x: selection.x - cel.x, y: selection.y - cel.y },
        });
      if (availability.snapToPalette && availability.crispAlpha) return availability;
    }
  return availability;
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
  const srcData = source.data;
  const resData = result.data;
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      const at = (y * source.width + x) * RGBA_BYTES_PER_PIXEL;
      if (
        srcData[at] !== resData[at] ||
        srcData[at + 1] !== resData[at + 1] ||
        srcData[at + 2] !== resData[at + 2] ||
        srcData[at + 3] !== resData[at + 3]
      ) {
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
  keepHiddenRgb = false,
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
    for (let u = 0; u < width; u++) {
      const at = (v * width + u) * RGBA_BYTES_PER_PIXEL;
      if (data[at + 3] || (keepHiddenRgb && (data[at] || data[at + 1] || data[at + 2]))) {
        x0 = Math.min(x0, u);
        y0 = Math.min(y0, v);
        x1 = Math.max(x1, u);
        y1 = Math.max(y1, v);
      }
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
  if (spec.kind === EffectKind.CleanPixels && !Object.values(spec.options).some(Boolean))
    return document;
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
  const { frames: frameIds, layers: layerIds } = effectCelScope(
    t,
    target,
    preview,
    spec.kind === EffectKind.CleanPixels,
  );
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
          t.frames[fi].palette ?? doc.palette,
        );
      if (output === source) continue;
      const bounds = affectedBounds(source, output);
      if (!bounds) continue;
      const patch = patchEffectCel(
        cel,
        output,
        bounds,
        isBackgroundLayer(t.layers[li]),
        spec.kind === EffectKind.CleanPixels,
      );
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
  target = EffectTarget.Selected,
) => applyDocumentEffect(doc, spec, target, true, mode);
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

function indexedCleanupColors(palette: readonly Rgba[], mask: number) {
  const usable = palette.slice(0, BYTE_VALUE_COUNT);
  const indices = new Map<string, number>();
  usable.forEach((color, index) => {
    if (index === mask) return;
    const key = color.join(",");
    if (!indices.has(key)) indices.set(key, index);
  });
  const nearest = createOpaquePaletteMatcher(usable.filter((_, index) => index !== mask));
  return (filtered: Rgba, originalIndex: number): number => {
    if (!filtered[3] && mask >= 0) return mask;
    const exact = indices.get(filtered.join(","));
    if (exact !== undefined) return exact;
    // Promoting a partial-alpha swatch may require a different opaque entry.
    if (filtered[3] !== UINT8_MAX || !nearest) return originalIndex;
    return indices.get(nearest(filtered[0], filtered[1], filtered[2]).join(",")) ?? originalIndex;
  };
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
  const { frames: frameIds, layers: layerIds } = effectCelScope(
    t,
    target,
    preview,
    spec.kind === EffectKind.CleanPixels,
  );
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
      let cleanupIndex: ReturnType<typeof indexedCleanupColors> | undefined;
      if (spec.kind === EffectKind.CleanPixels) {
        originalColors = {
          width: doc.width,
          height: doc.height,
          data: expandAsepriteSamples(
            { depth: 8, width: doc.width, height: doc.height, data: source },
            pal,
            mask,
          ),
        };
        advancedColors = cleanPixels(originalColors, spec.options, {
          selection: doc.selection,
          background,
        });
        if (advancedColors === originalColors) continue;
        cleanupIndex = indexedCleanupColors(palette, mask);
      } else if (advanced) {
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
      const outline = spec.kind === EffectKind.Outline ? spec : undefined;
      const selective = outline?.colorMode === OutlineColorMode.Selective;
      const outlineColor =
          outline && !selective
            ? asepriteIndexFor(outline.color, palette, mask, outline.colorIndex)
            : 0,
        bg = outline ? asepriteIndexFor(outline.bgColor, palette, mask, outline.bgIndex) : 0;
      const outlineMatrix = outline ? outlineOffsets(outline.matrix) : [];
      const selectiveOutline =
        outline && selective
          ? selectiveOutlineSampler(
              doc.width,
              doc.height,
              outlineMatrix,
              outline.tiledMode ?? 0,
              outline.place === "outside",
              (pixel) => {
                const index = source[pixel];
                return index === mask || index === bg || !color(index)[3];
              },
              (pixel) => color(source[pixel]),
            )
          : undefined;
      const matchOutlinePalette =
        outline && selective
          ? selectiveOutlinePaletteMatcher(palette, mask, outlineShadeScale(outline))
          : undefined;
      const indexedEmptyAt =
        outline && !selective
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
              next = cleanupIndex
                ? cleanupIndex(filtered, index)
                : asepriteBestFit(...filtered, pal, mask);
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
          else if (selectiveOutline && matchOutlinePalette) {
            const sampled = selectiveOutline(x, y);
            if (sampled) next = matchOutlinePalette(sampled) ?? index;
          } else if (spec.kind === EffectKind.Outline) {
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
  const original = document.timeline!;
  const { frames, layers } = effectCelScope(
    original,
    target,
    preview,
    spec.kind === EffectKind.CleanPixels,
  );
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
