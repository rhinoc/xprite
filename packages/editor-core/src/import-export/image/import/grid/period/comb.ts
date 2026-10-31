import type { PixelBuffer } from "$/base/primitives";
import { blockPartition, MAX_RECOVERED_GRID_SIZE } from "$/import-export/image/import/grid/lattice";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

/**
 * Cell counts read from the period of the colour steps, for upscales whose cells keep a steady
 * count but not a steady phase (warped, re-blocked or locally shifted grids), where no single
 * lattice lines up with the whole image.
 *
 * Each axis is read through the first and second differences of the colour, summed over short
 * bands of lines and over all lines. Every band's autocorrelation is normalised on its own, so a
 * band whose cuts are shifted against another's still peaks at the same lag; their mean is
 * phase-free. A step scores the autocorrelation on its multiples against the midpoints between
 * them (a comb), less half the best score of its own fractions, so the fundamental of a harmonic
 * train outranks its multiples. The strongest steps propose lattices that cover the whole image at
 * the counts the steps round to.
 */
const CHANNELS = 3;
const STRIDE = 4;
const ALPHA_SCALE = 255;
const ALPHA_CHANNEL = 3;
/** Lines summed into one band of the profile. */
const BAND_LINES = 16;
/** Bands read per axis; taller images read evenly spread bands. */
const MAX_BANDS = 64;
const MIN_STEP = 2.5;
const MAX_STEP = 64;
/** The longest step is this fraction of the axis, so its comb holds several teeth. */
const MIN_PERIODS = 4;
/** Relative spacing of the steps the comb scores. */
const STEP_RATIO = 1.0025;
const COMB_TEETH = 24;
/** Lags the autocorrelation covers, in multiples of the longest step. */
const LAG_PERIODS = 12;
/** Teeth weigh exp(-(k - 1) / COMB_DECAY), so the near multiples count most. */
const COMB_DECAY = 12;
const HALF = 0.5;
const SUBHARMONICS = [2, 3, 4, 5] as const;
const SUBHARMONIC_PENALTY = 0.5;
/** Steps kept per axis. */
const STEPS_PER_AXIS = 3;
/** Half-width of the window a refined tooth is looked for in, as a share of the step. */
const TOOTH_WINDOW = 0.3;
const MIN_TOOTH_WINDOW = 2;
const MIN_TOOTH_TOLERANCE = 1.5;
const REFINE_PASSES = 3;
/** A refined step stays within this ratio of the step the comb found. */
const REFINE_LIMIT = 1.25;
const MIN_GRID_CELLS = 2;

enum Difference {
  First = 1,
  Second = 2,
}

/** Absolute colour difference of the given order at every pixel along each line of an axis. */
function differences(image: PixelBuffer, horizontal: boolean, order: Difference) {
  const { width, height, data } = image;
  const length = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const out = new Float64Array(lines * length);
  const value = (along: number, line: number, c: number) => {
    const o = (horizontal ? line * width + along : along * width + line) * STRIDE;
    return (data[o + c] * data[o + ALPHA_CHANNEL]) / ALPHA_SCALE;
  };
  const end = order === Difference.Second ? length - 1 : length;
  for (let line = 0; line < lines; line++)
    for (let i = 1; i < end; i++) {
      let energy = 0;
      for (let c = 0; c < CHANNELS; c++) {
        const here = value(i, line, c),
          before = value(i - 1, line, c);
        energy += Math.abs(
          order === Difference.Second ? value(i + 1, line, c) - 2 * here + before : here - before,
        );
      }
      out[line * length + i] = energy;
    }
  return { lines, length, data: out };
}

/** Mean over bands of `band` lines of each band's unbiased autocorrelation, normalised at lag 0. */
function bandAutocorrelation(
  feature: { lines: number; length: number; data: Float64Array },
  band: number,
  maxLag: number,
): Float64Array {
  const { lines, length, data } = feature;
  const size = Math.min(band, lines);
  const bands = Math.max(1, Math.floor(lines / size));
  const read = Math.min(bands, MAX_BANDS);
  const sum = new Float64Array(maxLag + 1);
  const profile = new Float64Array(length);
  let used = 0;
  for (let k = 0; k < read; k++) {
    const first = Math.floor((k * bands) / read) * size;
    profile.fill(0);
    for (let line = first; line < first + size; line++)
      for (let i = 0; i < length; i++) profile[i] += data[line * length + i];
    let mean = 0;
    for (let i = 0; i < length; i++) mean += profile[i];
    mean /= length;
    let energy = 0;
    for (let i = 0; i < length; i++) {
      profile[i] -= mean;
      energy += profile[i] * profile[i];
    }
    if (!energy) continue;
    used++;
    for (let lag = 0; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i + lag < length; i++) s += profile[i] * profile[i + lag];
      sum[lag] += (s / energy) * (length / (length - lag));
    }
  }
  if (used) for (let lag = 0; lag <= maxLag; lag++) sum[lag] /= used;
  return sum;
}

function at(values: Float64Array, position: number): number {
  const i = Math.max(0, Math.min(values.length - 2, Math.floor(position)));
  const t = position - i;
  return values[i] * (1 - t) + values[i + 1] * t;
}

/** Weighted mean of the autocorrelation on the multiples of `step` less that between them. */
function comb(correlation: Float64Array, step: number): number {
  const teeth = Math.min(Math.floor((correlation.length - 2) / step), COMB_TEETH);
  if (teeth < 2) return -Infinity;
  let sum = 0,
    weights = 0;
  for (let k = 1; k <= teeth; k++) {
    const weight = Math.exp(-(k - 1) / COMB_DECAY);
    const between =
      HALF * (at(correlation, (k - HALF) * step) + at(correlation, (k + HALF) * step));
    sum += weight * (at(correlation, k * step) - between);
    weights += weight;
  }
  return sum / weights;
}

/** The step of the line through the peaks of the autocorrelation near each multiple of `step`. */
function refine(correlation: Float64Array, step: number): number {
  const n = correlation.length;
  const teeth = Math.min(Math.floor((n - 3) / step), COMB_TEETH);
  const peaks: { position: number; order: number; weight: number }[] = [];
  const window = Math.max(MIN_TOOTH_WINDOW, Math.floor(TOOTH_WINDOW * step));
  for (let k = 1; k <= teeth; k++) {
    const low = Math.max(1, Math.floor(k * step - window)),
      high = Math.min(n - 2, Math.ceil(k * step + window));
    let i = low;
    for (let j = low; j <= high; j++) if (correlation[j] > correlation[i]) i = j;
    if (i <= low || i >= high) continue;
    const curvature = correlation[i - 1] - 2 * correlation[i] + correlation[i + 1];
    const shift = curvature ? (correlation[i - 1] - correlation[i + 1]) / (2 * curvature) : 0;
    peaks.push({
      position: i + Math.max(-1, Math.min(1, shift)),
      order: k,
      weight: Math.max(Number.EPSILON, correlation[i]),
    });
  }
  let refined = step;
  const tolerance = Math.max(MIN_TOOTH_TOLERANCE, TOOTH_WINDOW * step);
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    let numerator = 0,
      denominator = 0,
      kept = 0;
    for (const { position, order, weight } of peaks)
      if (Math.abs(position - order * refined) <= tolerance) {
        numerator += weight * position * order;
        denominator += weight * order * order;
        kept++;
      }
    if (kept < 2) break;
    refined = numerator / denominator;
  }
  return refined >= step / REFINE_LIMIT && refined <= step * REFINE_LIMIT ? refined : step;
}

/** The strongest cell steps along one axis, strongest first. */
function combSteps(image: PixelBuffer, horizontal: boolean): number[] {
  const length = horizontal ? image.width : image.height;
  const longest = Math.min(MAX_STEP, length / MIN_PERIODS);
  if (longest <= MIN_STEP) return [];
  const maxLag = Math.min(length - 2, Math.ceil(longest * LAG_PERIODS));
  const correlation = new Float64Array(maxLag + 1);
  const readings: Float64Array[] = [];
  for (const order of [Difference.First, Difference.Second]) {
    const feature = differences(image, horizontal, order);
    for (const band of [BAND_LINES, feature.lines])
      readings.push(bandAutocorrelation(feature, band, maxLag));
  }
  for (const reading of readings)
    for (let lag = 0; lag <= maxLag; lag++) correlation[lag] += reading[lag] / readings.length;
  const steps: number[] = [];
  for (let step = MIN_STEP; step <= longest; step *= STEP_RATIO) steps.push(step);
  const raw = steps.map((step) => comb(correlation, step));
  const rawAt = (step: number) => {
    const index = Math.round(Math.log(step / MIN_STEP) / Math.log(STEP_RATIO));
    return index < 0 ? -Infinity : raw[Math.min(raw.length - 1, index)];
  };
  const selective = steps.map((step, i) => {
    let fraction = 0;
    for (const m of SUBHARMONICS)
      if (step / m >= MIN_STEP) fraction = Math.max(fraction, rawAt(step / m));
    return raw[i] - SUBHARMONIC_PENALTY * fraction;
  });
  const peaks: number[] = [];
  for (let i = 1; i + 1 < steps.length; i++)
    if (selective[i] > selective[i - 1] && selective[i] >= selective[i + 1]) peaks.push(i);
  peaks.sort((a, b) => selective[b] - selective[a]);
  return peaks.slice(0, STEPS_PER_AXIS).map((i) => refine(correlation, steps[i]));
}

/** Lattices covering the image at the cell counts of the strongest steps of either axis. */
export function combCountGrids(image: PixelBuffer): PixelGridAnalysis[] {
  const steps = [...combSteps(image, true), ...combSteps(image, false)];
  const grids: PixelGridAnalysis[] = [];
  const seen = new Set<string>();
  const limit = (count: number, length: number) =>
    count >= MIN_GRID_CELLS && count <= Math.min(length, MAX_RECOVERED_GRID_SIZE);
  for (const step of steps) {
    const columns = Math.round(image.width / step),
      rows = Math.round(image.height / step);
    const key = `${columns}x${rows}`;
    if (seen.has(key) || !limit(columns, image.width) || !limit(rows, image.height)) continue;
    seen.add(key);
    grids.push({
      ...blockPartition(image, columns, rows),
      confidence: 0,
      reliable: true,
      algorithm: PixelationAlgorithm.UniformGrid,
    });
  }
  return grids;
}
