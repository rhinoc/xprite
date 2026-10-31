import { UINT8_MAX } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import { clampByte } from "$/document/pixel-validation";
import type { PaletteEntry } from "$/import-export/image/import/types";

const CHANNELS = 4;
const COLOR_CHANNELS = 3;
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_SCALE = 1.055;
const GAMMA_EXPONENT = 2.4;
const linear = (byte: number) => {
  const value = byte / UINT8_MAX;
  return value <= LINEAR_THRESHOLD
    ? value / LINEAR_DIVISOR
    : ((value + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA_EXPONENT;
};
const LINEAR = Float64Array.from({ length: UINT8_MAX + 1 }, (_, byte) => linear(byte));
const linearChannel = (byte: number) => (byte === 0 ? byte : (LINEAR[byte] ?? linear(byte)));

// Oklab matrices published by Björn Ottosson (public domain):
// https://bottosson.github.io/posts/oklab/
const LINEAR_SRGB_TO_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
] as const;
const LMS_TO_OKLAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
] as const;
function dot(row: readonly number[], a: number, b: number, c: number): number {
  return row[0] * a + row[1] * b + row[2] * c;
}
/** Oklab plus opacity; invisible RGB never participates in matching. */
export function paletteCoordinates(color: Rgba): Rgba {
  const opacity = color[3] / UINT8_MAX;
  const r = linearChannel(color[0]);
  const g = linearChannel(color[1]);
  const b = linearChannel(color[2]);
  const l = Math.cbrt(dot(LINEAR_SRGB_TO_LMS[0], r, g, b));
  const m = Math.cbrt(dot(LINEAR_SRGB_TO_LMS[1], r, g, b));
  const s = Math.cbrt(dot(LINEAR_SRGB_TO_LMS[2], r, g, b));
  return [
    dot(LMS_TO_OKLAB[0], l, m, s) * opacity,
    dot(LMS_TO_OKLAB[1], l, m, s) * opacity,
    dot(LMS_TO_OKLAB[2], l, m, s) * opacity,
    opacity,
  ];
}

interface Sample {
  entry: PaletteEntry;
  coordinates: Rgba;
}
interface Box {
  samples: Sample[];
  axis: number;
  error: number;
}
function box(samples: Sample[]): Box {
  const sum = [0, 0, 0, 0],
    squares = [0, 0, 0, 0];
  let count = 0;
  for (const sample of samples) {
    count += sample.entry.count;
    for (let axis = 0; axis < CHANNELS; axis++) {
      sum[axis] += sample.coordinates[axis] * sample.entry.count;
      squares[axis] += sample.coordinates[axis] ** 2 * sample.entry.count;
    }
  }
  let axis = 0,
    error = 0;
  for (let channel = 0; channel < CHANNELS; channel++) {
    const variance = squares[channel] - sum[channel] ** 2 / count;
    if (variance > error) {
      error = variance;
      axis = channel;
    }
  }
  return { samples, axis, error: samples.length > 1 ? error : 0 };
}
function split(current: Box): [Box, Box] {
  const samples = [...current.samples].sort(
    (a, b) => a.coordinates[current.axis] - b.coordinates[current.axis],
  );
  const totals = [0, 0, 0, 0],
    partial = [0, 0, 0, 0];
  let totalCount = 0,
    leftCount = 0;
  for (const sample of samples) {
    totalCount += sample.entry.count;
    for (let channel = 0; channel < CHANNELS; channel++)
      totals[channel] += sample.coordinates[channel] * sample.entry.count;
  }
  let bestGain = -1,
    boundary = 1;
  for (let index = 1; index < samples.length; index++) {
    const sample = samples[index - 1];
    leftCount += sample.entry.count;
    let gain = 0;
    for (let channel = 0; channel < CHANNELS; channel++) {
      partial[channel] += sample.coordinates[channel] * sample.entry.count;
      const difference =
        partial[channel] / leftCount -
        (totals[channel] - partial[channel]) / (totalCount - leftCount);
      gain += (difference ** 2 * leftCount * (totalCount - leftCount)) / totalCount;
    }
    if (gain > bestGain) {
      bestGain = gain;
      boundary = index;
    }
  }
  return [box(samples.slice(0, boundary)), box(samples.slice(boundary))];
}

/** Variance-driven color partitioning keeps accents instead of selecting only frequent shades. */
export function optimizePalette(entries: PaletteEntry[], limit: number): PaletteEntry[] {
  if (entries.length <= limit) return entries;
  const transparent = entries.find((entry) => entry.color[3] === 0);
  const visible = entries.filter((entry) => entry.color[3] !== 0);
  const reserveTransparency = !!transparent && limit > 1;
  const boxes = [
    box(
      (reserveTransparency ? visible : entries).map((entry) => ({
        entry,
        coordinates: paletteCoordinates(entry.color),
      })),
    ),
  ];
  while (boxes.length < limit - Number(reserveTransparency)) {
    let index = -1,
      error = 0;
    for (let i = 0; i < boxes.length; i++)
      if (boxes[i].error > error) {
        index = i;
        error = boxes[i].error;
      }
    if (index < 0) break;
    boxes.splice(index, 1, ...split(boxes[index]));
  }
  const result = boxes.map((current) => {
    let count = 0,
      alpha = 0,
      coverage = 0;
    const sums = [0, 0, 0];
    for (const { entry } of current.samples) {
      count += entry.count;
      coverage += entry.coverage;
      const weight = entry.count * entry.color[3];
      alpha += weight;
      for (let channel = 0; channel < COLOR_CHANNELS; channel++)
        sums[channel] += entry.color[channel] * weight;
    }
    return {
      color: [
        clampByte(alpha ? sums[0] / alpha : 0),
        clampByte(alpha ? sums[1] / alpha : 0),
        clampByte(alpha ? sums[2] / alpha : 0),
        clampByte(alpha / count),
      ] as Rgba,
      count,
      coverage,
    };
  });
  if (reserveTransparency) result.push(transparent!);
  return result.sort((a, b) => b.count - a.count);
}
