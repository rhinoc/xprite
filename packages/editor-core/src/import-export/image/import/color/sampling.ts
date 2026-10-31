import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { assertDimension, assertPixelCount, clampByte } from "$/document/pixel-validation";
import {
  extractPixelationPalette,
  reduceToPixelationLabels,
} from "$/import-export/image/import/color/palette";
import { paletteCoordinates } from "$/import-export/image/import/color/quantization";
import { PixelationMethod } from "$/import-export/image/import/types";

const CHANNELS = 4;
const COLOR_CHANNELS = 3;
const CLUSTERS = 2;
const ITERATIONS = 6;
const CENTER_FLOOR = 0.25;
const STRUCTURE_COLORS = 48;
const TWO_STAGE_MIN_COLORS = 16;
const TWO_STAGE_MAX_COLORS = 48;
const TWO_STAGE_COLOR_BINS = 16 ** COLOR_CHANNELS;
const CONVERGENCE = 1e-7;
const MAX_COORDINATE_COLORS = 65_536;
interface Sample {
  index: number;
  weight: number;
  visibleWeight: number;
  voteWeight: number;
  point?: Rgba;
}
interface Cell {
  samples: Sample[];
  alpha: number;
}

function cell(
  image: PixelBuffer,
  left: number,
  top: number,
  right: number,
  bottom: number,
  recovery: boolean,
): Cell {
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(image.width, right);
  bottom = Math.min(image.height, bottom);
  const samples: Sample[] = [];
  let area = 0,
    alphaSum = 0;
  for (let y = Math.floor(top); y < Math.ceil(bottom); y++)
    for (let x = Math.floor(left); x < Math.ceil(right); x++) {
      const coverage =
        (Math.min(right, x + 1) - Math.max(left, x)) * (Math.min(bottom, y + 1) - Math.max(top, y));
      if (coverage <= 0) continue;
      const index = y * image.width + x;
      const alpha = image.data[index * CHANNELS + COLOR_CHANNELS];
      area += coverage;
      alphaSum += coverage * alpha;
      if (!alpha && !recovery) continue;
      const fx = (Math.max(left, x) + Math.min(right, x + 1)) / 2;
      const fy = (Math.max(top, y) + Math.min(bottom, y + 1)) / 2;
      const horizontal = 1 - Math.abs((2 * (fx - left)) / (right - left) - 1);
      const vertical = 1 - Math.abs((2 * (fy - top)) / (bottom - top) - 1);
      const weight = coverage * (CENTER_FLOOR + (1 - CENTER_FLOOR) * horizontal * vertical);
      samples.push({
        index,
        weight,
        visibleWeight: (weight * alpha) / UINT8_MAX,
        voteWeight: recovery ? weight : (weight * alpha) / UINT8_MAX,
      });
    }
  return { samples, alpha: area ? clampByte(alphaSum / area) : 0 };
}

/**
 * Compute adaptive K for TwoStage method (Fixer-aligned).
 * Counts 4-bit RGB bins (R/16, G/16, B/16) with share ≥ 0.003 of opaque pixels.
 * Clamps to [TWO_STAGE_MIN_COLORS, TWO_STAGE_MAX_COLORS].
 */
function adaptiveTwoStageK(image: PixelBuffer): number {
  const bins = new Uint32Array(TWO_STAGE_COLOR_BINS);
  let opaqueCount = 0;

  for (let i = 0; i < image.data.length; i += CHANNELS) {
    const alpha = image.data[i + COLOR_CHANNELS];
    if (alpha === 0) continue;
    opaqueCount++;
    // 4-bit RGB: divide each channel by 16
    const r4 = image.data[i] >> 4;
    const g4 = image.data[i + 1] >> 4;
    const b4 = image.data[i + 2] >> 4;
    const key = (r4 << 8) | (g4 << 4) | b4;
    bins[key] += 1;
  }

  if (opaqueCount === 0) return TWO_STAGE_MIN_COLORS;

  const threshold = opaqueCount * 0.003;
  let count = 0;
  for (const binCount of bins) {
    if (binCount >= threshold) count++;
  }

  return Math.max(TWO_STAGE_MIN_COLORS, Math.min(TWO_STAGE_MAX_COLORS, count));
}

function coordinateLookup(image: PixelBuffer, axes: number) {
  const cache = new Map<number, Rgba>();
  return (sample: Sample, local: Map<number, Rgba>): Rgba => {
    const offset = sample.index * CHANNELS;
    const alpha = axes === CHANNELS ? image.data[offset + COLOR_CHANNELS] : UINT8_MAX;
    const key = alpha
      ? (image.data[offset] << 24) |
        (image.data[offset + 1] << 16) |
        (image.data[offset + 2] << 8) |
        alpha
      : 0;
    const cached = cache.get(key) ?? local.get(key);
    if (cached) return cached;
    const value = paletteCoordinates([
      image.data[offset],
      image.data[offset + 1],
      image.data[offset + 2],
      alpha,
    ]);
    if (cache.size < MAX_COORDINATE_COLORS) cache.set(key, value);
    else local.set(key, value);
    return value;
  };
}
function distance(sample: Sample, center: readonly number[]): number {
  let sum = 0;
  for (let axis = 0; axis < center.length; axis++) sum += (sample.point![axis] - center[axis]) ** 2;
  return sum;
}
function dominant(samples: Sample[], axes: number): Sample[] {
  if (samples.length < CLUSTERS) return samples;
  const mean = Array.from({ length: axes }, () => 0);
  let total = 0;
  for (const sample of samples) {
    total += sample.voteWeight;
    for (let c = 0; c < axes; c++) mean[c] += sample.point![c] * sample.voteWeight;
  }
  for (let c = 0; c < axes; c++) mean[c] /= total;
  const farthest = (center: readonly number[]) =>
    samples.reduce((best, point) =>
      distance(point, center) > distance(best, center) ? point : best,
    );
  const first = farthest(mean);
  const center = (sample: Sample) => sample.point!.slice(0, axes);
  const centers = [center(first), center(farthest(center(first)))];
  let groups: Sample[][] = [[], []];
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    groups = [[], []];
    for (const sample of samples)
      groups[distance(sample, centers[0]) <= distance(sample, centers[1]) ? 0 : 1].push(sample);
    let movement = 0;
    for (let cluster = 0; cluster < CLUSTERS; cluster++) {
      const values = Array.from({ length: axes }, () => 0);
      let weight = 0;
      for (const sample of groups[cluster]) {
        weight += sample.voteWeight;
        for (let c = 0; c < axes; c++) values[c] += sample.point![c] * sample.voteWeight;
      }
      if (!weight) continue;
      for (let c = 0; c < axes; c++) {
        values[c] /= weight;
        movement += (values[c] - centers[cluster][c]) ** 2;
      }
      centers[cluster] = values;
    }
    if (movement <= CONVERGENCE) break;
  }
  const weight = (group: Sample[]) => group.reduce((sum, sample) => sum + sample.voteWeight, 0);
  return weight(groups[0]) >= weight(groups[1]) ? groups[0] : groups[1];
}
/** Reuse one bounded set of statistics for every cell, in the original sample order. */
function labelSampler(
  image: PixelBuffer,
  labels: ReturnType<typeof reduceToPixelationLabels>,
  recovery: boolean,
  triangular: boolean,
) {
  const groups = labels.keys.length;
  const touched = new Uint8Array(groups);
  const active = new Uint16Array(groups);
  let activeCount = 0;
  const weights = new Float64Array(groups);
  const alphaSums = new Float64Array(groups);
  const visibleWeights = new Float64Array(groups);
  const redSums = new Float64Array(groups);
  const greenSums = new Float64Array(groups);
  const blueSums = new Float64Array(groups);
  return (
    left: number,
    top: number,
    right: number,
    bottom: number,
    output: Uint8ClampedArray,
    outputOffset: number,
  ): void => {
    for (let index = 0; index < activeCount; index++) {
      const group = active[index];
      touched[group] = 0;
      weights[group] = 0;
      alphaSums[group] = 0;
      visibleWeights[group] = 0;
      redSums[group] = 0;
      greenSums[group] = 0;
      blueSums[group] = 0;
    }
    activeCount = 0;
    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(image.width, right);
    bottom = Math.min(image.height, bottom);
    let area = 0,
      alphaSum = 0;
    for (let y = Math.floor(top); y < Math.ceil(bottom); y++)
      for (let x = Math.floor(left); x < Math.ceil(right); x++) {
        const coverage =
          (Math.min(right, x + 1) - Math.max(left, x)) *
          (Math.min(bottom, y + 1) - Math.max(top, y));
        if (coverage <= 0) continue;
        const index = y * image.width + x;
        const offset = index * CHANNELS;
        const alpha = image.data[offset + COLOR_CHANNELS];
        area += coverage;
        alphaSum += coverage * alpha;
        if (!alpha && !recovery) continue;
        const fx = (Math.max(left, x) + Math.min(right, x + 1)) / 2;
        const fy = (Math.max(top, y) + Math.min(bottom, y + 1)) / 2;
        const horizontal = 1 - Math.abs((2 * (fx - left)) / (right - left) - 1);
        const vertical = 1 - Math.abs((2 * (fy - top)) / (bottom - top) - 1);
        const weight = triangular
          ? coverage * horizontal * vertical
          : coverage * (CENTER_FLOOR + (1 - CENTER_FLOOR) * horizontal * vertical);
        const visibleWeight = (weight * alpha) / UINT8_MAX;
        // Label zero also contains opaque black, matching the original RGB grouping.
        const group = labels.data[index];
        if (!touched[group]) {
          touched[group] = 1;
          active[activeCount++] = group;
        }
        weights[group] += weight;
        alphaSums[group] += weight * alpha;
        visibleWeights[group] += visibleWeight;
        redSums[group] += image.data[offset] * visibleWeight;
        greenSums[group] += image.data[offset + 1] * visibleWeight;
        blueSums[group] += image.data[offset + 2] * visibleWeight;
      }
    const alpha = area ? clampByte(alphaSum / area) : 0;
    output[outputOffset + COLOR_CHANNELS] = alpha;
    if (!alpha) return;
    let winner = -1,
      vote = -1;
    for (let index = 0; index < activeCount; index++) {
      const group = active[index];
      if (
        visibleWeights[group] > vote ||
        (visibleWeights[group] === vote && labels.keys[group] < labels.keys[winner])
      ) {
        winner = group;
        vote = visibleWeights[group];
      }
    }
    if (winner < 0) return;
    if (recovery)
      output[outputOffset + COLOR_CHANNELS] = clampByte(
        weights[winner] ? alphaSums[winner] / weights[winner] : 0,
      );
    const visible = visibleWeights[winner];
    output[outputOffset] = clampByte(visible ? redSums[winner] / visible : 0);
    output[outputOffset + 1] = clampByte(visible ? greenSums[winner] / visible : 0);
    output[outputOffset + 2] = clampByte(visible ? blueSums[winner] / visible : 0);
  };
}

/** RGB is taken from the winning region. Conversion keeps area alpha; recovery keeps the chosen region’s original alpha. */
export function samplePixelation(
  image: PixelBuffer,
  width: number,
  height: number,
  method: PixelationMethod,
  cuts?: { x: readonly number[]; y: readonly number[] },
): PixelBuffer {
  assertDimension(width, "width");
  assertDimension(height, "height");
  assertPixelCount(width, height);
  const recovery = cuts !== undefined;
  const axes = recovery ? CHANNELS : COLOR_CHANNELS;
  const points = method === PixelationMethod.Dominant ? coordinateLookup(image, axes) : undefined;
  const useStructure = method === PixelationMethod.Structure;
  const useTwoStage = method === PixelationMethod.TwoStage;
  const palette = useStructure
    ? extractPixelationPalette(image, {
        maxColors: STRUCTURE_COLORS,
      }).map((entry) => entry.color)
    : useTwoStage
      ? extractPixelationPalette(image, {
          maxColors: adaptiveTwoStageK(image),
        }).map((entry) => entry.color)
      : undefined;
  const labels = palette ? reduceToPixelationLabels(image, palette) : undefined;
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  const sampleLabel = labels ? labelSampler(image, labels, recovery, useTwoStage) : undefined;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const left = cuts?.x[x] ?? (x * image.width) / width;
      const top = cuts?.y[y] ?? (y * image.height) / height;
      const right = cuts?.x[x + 1] ?? ((x + 1) * image.width) / width;
      const bottom = cuts?.y[y + 1] ?? ((y + 1) * image.height) / height;
      const offset = (y * width + x) * CHANNELS;
      if (sampleLabel) {
        sampleLabel(left, top, right, bottom, data, offset);
        continue;
      }
      const current = cell(image, left, top, right, bottom, recovery);
      data[offset + COLOR_CHANNELS] = current.alpha;
      if (!current.alpha || !current.samples.length) continue;
      if (points) {
        const local = new Map<number, Rgba>();
        for (const sample of current.samples) sample.point = points(sample, local);
      }
      const selected = points ? dominant(current.samples, axes) : current.samples;
      if (recovery) {
        const area = selected.reduce((sum, sample) => sum + sample.weight, 0);
        const alpha = selected.reduce(
          (sum, sample) =>
            sum + sample.weight * image.data[sample.index * CHANNELS + COLOR_CHANNELS],
          0,
        );
        data[offset + COLOR_CHANNELS] = clampByte(area ? alpha / area : 0);
      }
      const sums = [0, 0, 0];
      let weight = 0;
      for (const sample of selected) {
        weight += sample.visibleWeight;
        for (let c = 0; c < COLOR_CHANNELS; c++)
          sums[c] += image.data[sample.index * CHANNELS + c] * sample.visibleWeight;
      }
      for (let c = 0; c < COLOR_CHANNELS; c++)
        data[offset + c] = clampByte(weight ? sums[c] / weight : 0);
    }
  return { width, height, data };
}
