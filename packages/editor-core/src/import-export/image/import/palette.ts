import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { assertPixelBuffer, clampByte } from "$/document/pixel-validation";
import type { ExtractPaletteOptions, PaletteEntry } from "$/import-export/image/import/types";

const HISTOGRAM_BINS = 32 * 32 * 32 * 16;
const MAX_EXACT_COLORS = 16_384;
const REDUCTION_CACHE_SIZE = 16 * 16 * 16 * 4;

function colorKey(data: Uint8ClampedArray, offset: number): number {
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
  return (r >>> 3) | ((g >>> 3) << 5) | ((b >>> 3) << 10) | ((a >>> 4) << 15);
}

function histogramPalette(image: PixelBuffer, maxColors: number): PaletteEntry[] {
  const counts = new Uint32Array(HISTOGRAM_BINS);
  const sumR = new Float64Array(HISTOGRAM_BINS);
  const sumG = new Float64Array(HISTOGRAM_BINS);
  const sumB = new Float64Array(HISTOGRAM_BINS);
  const sumA = new Float64Array(HISTOGRAM_BINS);
  const touched: number[] = [];
  const { data } = image;

  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    const index = histogramIndex(r, g, b, a);
    if (counts[index] === 0) touched.push(index);
    counts[index] += 1;
    sumR[index] += r;
    sumG[index] += g;
    sumB[index] += b;
    sumA[index] += a;
  }

  touched.sort((left, right) => counts[right] - counts[left] || left - right);
  const total = image.width * image.height;
  const entries: PaletteEntry[] = [];
  for (let i = 0; i < touched.length && i < maxColors; i += 1) {
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
  return entries;
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

  for (let offset = 0; offset < data.length; offset += 4) {
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

  if (overflowed) return histogramPalette(image, maxColors);

  const total = image.width * image.height;
  return [...exact.entries()]
    .sort(([keyA, countA], [keyB, countB]) => countB - countA || (keyA >>> 0) - (keyB >>> 0))
    .slice(0, maxColors)
    .map(([key, count]) => ({
      color: colorFromKey(key),
      count,
      coverage: count / total,
    }));
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

/** Reduce colors with a small quantized lookup cache, avoiding O(pixels * colors). */
export function reduceToPalette(image: PixelBuffer, palette: readonly Rgba[]): PixelBuffer {
  assertPixelBuffer(image);
  const colors = validatePalette(palette);
  const cache = new Int16Array(REDUCTION_CACHE_SIZE);
  cache.fill(-1);
  const output = new Uint8ClampedArray(image.data.length);
  const source = image.data;

  const nearest = (r: number, g: number, b: number, a: number): number => {
    const cacheKey = (r >>> 4) | ((g >>> 4) << 4) | ((b >>> 4) << 8) | ((a >>> 6) << 12);
    const cached = cache[cacheKey];
    if (cached >= 0) return cached;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < colors.length; i += 1) {
      const color = colors[i];
      const dr = r - color[0];
      const dg = g - color[1];
      const db = b - color[2];
      const da = a - color[3];
      const distance = dr * dr + dg * dg + db * db + da * da;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    cache[cacheKey] = best;
    return best;
  };

  for (let offset = 0; offset < source.length; offset += 4) {
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
    output[offset + 3] = color[3];
  }
  return { width: image.width, height: image.height, data: output };
}
