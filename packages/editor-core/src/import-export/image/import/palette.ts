import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { assertPixelBuffer, clampByte } from "$/document/pixel-validation";
import { optimizePalette, paletteCoordinates } from "$/import-export/image/import/quantization";
import type { ExtractPaletteOptions, PaletteEntry } from "$/import-export/image/import/types";

const HISTOGRAM_BINS = 32 * 32 * 32 * 16 + 1;
const MAX_EXACT_COLORS = 16_384;
const REDUCTION_CACHE_SIZE = 65_536;

function colorKey(data: Uint8ClampedArray, offset: number): number {
  if (data[offset + 3] === 0) return 0;
  return (
    (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3] | 0
  );
}

function colorFromKey(key: number): Rgba {
  return [
    (key >>> 24) & UINT8_MAX,
    (key >>> 16) & UINT8_MAX,
    (key >>> 8) & UINT8_MAX,
    key & UINT8_MAX,
  ];
}

function paletteLimit(value: number | undefined): number {
  if (value === undefined) return 256;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("maxColors must be a positive integer");
  }
  return Math.min(256, value);
}

function histogramIndex(r: number, g: number, b: number, a: number): number {
  if (!a) return HISTOGRAM_BINS - 1;
  return (r >>> 3) | ((g >>> 3) << 5) | ((b >>> 3) << 10) | ((a >>> 4) << 15);
}

function histogramPalette(
  image: PixelBuffer,
  maxColors: number,
  ignoreTransparent: boolean,
): PaletteEntry[] {
  const counts = new Uint32Array(HISTOGRAM_BINS);
  const sumR = new Float64Array(HISTOGRAM_BINS);
  const sumG = new Float64Array(HISTOGRAM_BINS);
  const sumB = new Float64Array(HISTOGRAM_BINS);
  const sumA = new Float64Array(HISTOGRAM_BINS);
  const touched: number[] = [];
  const { data } = image;
  let total = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const a = data[offset + 3];
    if (ignoreTransparent && !a) continue;
    total++;
    const r = a ? data[offset] : 0;
    const g = a ? data[offset + 1] : 0;
    const b = a ? data[offset + 2] : 0;
    const index = histogramIndex(r, g, b, a);
    if (counts[index] === 0) touched.push(index);
    counts[index] += 1;
    sumR[index] += r;
    sumG[index] += g;
    sumB[index] += b;
    sumA[index] += a;
  }

  touched.sort((left, right) => counts[right] - counts[left] || left - right);
  const entries: PaletteEntry[] = [];
  for (let i = 0; i < touched.length; i += 1) {
    const index = touched[i];
    const count = counts[index];
    entries.push({
      color: [
        clampByte(sumR[index] / count),
        clampByte(sumG[index] / count),
        clampByte(sumB[index] / count),
        clampByte(sumA[index] / count),
      ],
      count,
      coverage: count / total,
    });
  }
  return optimizePalette(entries, maxColors);
}

/**
 * Extract a deterministic, bounded palette. Exact colors are retained for
 * ordinary sprites; a fixed 32x32x32x16 histogram is used for noisy images so
 * memory stays bounded instead of growing with every photograph pixel.
 */
export function extractPalette(
  image: PixelBuffer,
  options: ExtractPaletteOptions = {},
): PaletteEntry[] {
  assertPixelBuffer(image);
  const maxColors = paletteLimit(options.maxColors);
  const exact = new Map<number, number>();
  const data = image.data;
  let overflowed = false;
  let total = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    if (options.ignoreTransparent && !data[offset + 3]) continue;
    total++;
    const key = colorKey(data, offset);
    const previous = exact.get(key);
    if (previous !== undefined) {
      exact.set(key, previous + 1);
    } else if (exact.size < MAX_EXACT_COLORS) {
      exact.set(key, 1);
    } else {
      overflowed = true;
      break;
    }
  }

  if (overflowed) return histogramPalette(image, maxColors, options.ignoreTransparent ?? false);

  const entries = [...exact.entries()]
    .sort(([keyA, countA], [keyB, countB]) => countB - countA || (keyA >>> 0) - (keyB >>> 0))
    .map(([key, count]) => ({
      color: colorFromKey(key),
      count,
      coverage: count / total,
    }));
  return optimizePalette(entries, maxColors);
}

/** Count distinct RGBA values with a bounded result for large images. */
export function countDistinctColors(image: PixelBuffer, limit = MAX_EXACT_COLORS): number {
  assertPixelBuffer(image);
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError("limit must be a positive integer");
  const colors = new Set<number>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    colors.add(colorKey(image.data, offset));
    if (colors.size > limit) return limit + 1;
  }
  return colors.size;
}

function validatePalette(palette: readonly Rgba[]): Rgba[] {
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 256) {
    throw new RangeError("palette must contain between 1 and 256 colors");
  }
  return palette.map((color, index) => {
    if (
      !Array.isArray(color) ||
      color.length !== 4 ||
      color.some((channel) => !Number.isFinite(channel))
    ) {
      throw new TypeError(`palette[${index}] must be an RGBA tuple`);
    }
    return [
      clampByte(color[0]),
      clampByte(color[1]),
      clampByte(color[2]),
      clampByte(color[3]),
    ] as Rgba;
  });
}

function paletteMatcher(palette: readonly Rgba[], preserveAlpha = false) {
  const colors = validatePalette(palette);
  const transparent = colors.some((color) => color[3] === 0);
  const cache = new Map<number, number>();
  const coordinates = colors.map((color) =>
    paletteCoordinates(
      preserveAlpha && color[3] ? [color[0], color[1], color[2], UINT8_MAX] : color,
    ),
  );
  const nearest = (r: number, g: number, b: number, a: number): number => {
    const opacity = preserveAlpha && a ? UINT8_MAX : a;
    const cacheKey = opacity ? (r << 24) | (g << 16) | (b << 8) | opacity : 0;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const sample = paletteCoordinates([r, g, b, opacity]);
    let best = 0,
      bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < coordinates.length; i++) {
      if (preserveAlpha && a && !colors[i][3]) continue;
      const color = coordinates[i];
      const dl = sample[0] - color[0],
        da = sample[1] - color[1],
        db = sample[2] - color[2],
        opacityDifference = sample[3] - color[3];
      const distance = dl * dl + da * da + db * db + opacityDifference * opacityDifference;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    if (cache.size < REDUCTION_CACHE_SIZE) cache.set(cacheKey, best);
    return best;
  };
  return { colors, transparent, nearest };
}

/** Perceptual matching with exact RGBA cache keys; colors within a coarse bin may differ. */
export function reduceToPalette(
  image: PixelBuffer,
  palette: readonly Rgba[],
  options: { preserveAlpha?: boolean } = {},
): PixelBuffer {
  assertPixelBuffer(image);
  const { colors, transparent, nearest } = paletteMatcher(palette, options.preserveAlpha);
  const output = new Uint8ClampedArray(image.data.length);
  const source = image.data;

  for (let offset = 0; offset < source.length; offset += 4) {
    if ((transparent || options.preserveAlpha) && source[offset + 3] === 0) continue;
    const index = nearest(
      source[offset],
      source[offset + 1],
      source[offset + 2],
      source[offset + 3],
    );
    const color = colors[index];
    output[offset] = color[0];
    output[offset + 1] = color[1];
    output[offset + 2] = color[2];
    output[offset + 3] = options.preserveAlpha ? source[offset + 3] : color[3];
  }
  return { width: image.width, height: image.height, data: output };
}

/** Palette generation counts visible RGB independently of coverage. */
export function extractPixelationPalette(
  image: PixelBuffer,
  options: ExtractPaletteOptions = {},
): PaletteEntry[] {
  const data = new Uint8ClampedArray(image.data);
  for (let offset = 3; offset < data.length; offset += 4)
    if (data[offset]) data[offset] = UINT8_MAX;
  const entries = extractPalette(
    { width: image.width, height: image.height, data },
    { ...options, ignoreTransparent: true },
  );
  return entries.length
    ? entries
    : [{ color: [0, 0, 0, 0], count: image.width * image.height, coverage: 1 }];
}

/** Compact mapped-RGB groups for the bounded Structure/TwoStage palettes. */
export function reduceToPixelationLabels(image: PixelBuffer, palette: readonly Rgba[]) {
  assertPixelBuffer(image);
  const { colors, nearest } = paletteMatcher(palette, true);
  const keys = [0];
  const groups = new Map<number, number>([[0, 0]]);
  const paletteGroups = colors.map((color) => {
    const key = (color[0] << 16) | (color[1] << 8) | color[2];
    let group = groups.get(key);
    if (group === undefined) {
      group = keys.length;
      groups.set(key, group);
      keys.push(key);
    }
    return group;
  });
  const data = new Uint8Array(image.width * image.height);
  const source = image.data;
  for (let offset = 0; offset < source.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    data[offset / 4] =
      paletteGroups[
        nearest(source[offset], source[offset + 1], source[offset + 2], source[offset + 3])
      ];
  }
  return { data, keys };
}
