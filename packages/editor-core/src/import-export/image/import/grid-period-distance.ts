import type { PixelBuffer } from "$/base/primitives";
import { blockPartition, MAX_RECOVERED_GRID_SIZE } from "$/import-export/image/import/grid";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

/**
 * Cell counts read from the distances between colour boundaries along each line. A boundary moves
 * with the phase of its line, but the distance between two boundaries of one line does not, so
 * the distances keep the pitch of a warped or row-shifted upscale whatever its phase does along
 * the image.
 *
 * Boundaries are the sub-pixel peaks of the colour step along a line, after the step is summed
 * over a few neighbouring lines, so that a cell edge, which runs across many lines, outlasts
 * noise. The distances from every boundary to the next few of its line count, so a spurious
 * boundary inside a cell, which puts one distance off the lattice, still leaves the distance
 * across it on the lattice. A step scores the mean cosine of 2π times distance over step: the
 * multiples of the step add up and the other distances cancel. Every fraction of the true step
 * divides its multiples too and scores about as high, so among the steps near the best score the
 * longest one that is itself a common distance stands for its axis, at the cell count it rounds to.
 */
const CHANNELS = 3;
const STRIDE = 4;
const ALPHA_SCALE = 255;
const ALPHA_CHANNEL = 3;
/** Lines the colour step is summed over, centred on the line read. */
const COHERENCE_LINES = 7;
/** Lines read per axis; longer axes read evenly spread lines. */
const MAX_LINES = 384;
/** A boundary's step is at least EDGE_FLOOR and EDGE_SHARE of the EDGE_QUANTILE of the steps. */
const EDGE_FLOOR = 20;
const EDGE_SHARE = 0.1;
const EDGE_QUANTILE = 0.95;
/** Boundaries ahead of each boundary whose distances count. */
const MAX_LAG = 4;
const MIN_DISTANCE = 2;
const MAX_DISTANCE = 64;
const BIN = 0.25;
const MIN_DISTANCES = 50;
const MIN_STEP = 2.05;
const MAX_STEP = 48;
/** The longest step is this fraction of the axis, so that several cells hold it. */
const MIN_PERIODS = 4;
/** Relative spacing of the steps scored. */
const STEP_RATIO = 1.0025;
/** Peaks within this share of the best score tie with it. */
const TIE_SHARE = 0.7;
/** Share of the distances a standing step needs within FUNDAMENTAL_WINDOW of its own length. */
const FUNDAMENTAL_SHARE = 0.04;
const FUNDAMENTAL_WINDOW = 0.18;
const MIN_FUNDAMENTAL_WINDOW = 0.6;
/** Refinement: a fine search within REFINE_SPAN of the step, then least squares on the multiples. */
const REFINE_SPAN = 0.06;
const REFINE_RATIO = 1.0005;
const REFINE_BIN = 0.05;
const REFINE_PASSES = 2;
/** A distance counts for a multiple while within this share of a step of it. */
const REFINE_TOLERANCE = 0.3;
const MIN_GRID_CELLS = 2;

/** Colour step summed over COHERENCE_LINES lines, at each position of each line read. */
function lineSteps(image: PixelBuffer, horizontal: boolean) {
  const { width, height, data } = image;
  const length = horizontal ? width : height,
    count = horizontal ? height : width;
  const lines = Math.min(count, MAX_LINES);
  const steps = new Float64Array(lines * (length - 1));
  const half = (COHERENCE_LINES - 1) >> 1;
  const offset = (along: number, line: number) =>
    (horizontal ? line * width + along : along * width + line) * STRIDE;
  for (let k = 0; k < lines; k++) {
    const centre = Math.floor(((k + 0.5) * count) / lines);
    for (let line = Math.max(0, centre - half); line <= Math.min(count - 1, centre + half); line++)
      for (let i = 0; i + 1 < length; i++) {
        const a = offset(i, line),
          b = offset(i + 1, line);
        const alphaA = data[a + ALPHA_CHANNEL] / ALPHA_SCALE,
          alphaB = data[b + ALPHA_CHANNEL] / ALPHA_SCALE;
        let step = Math.abs(data[a + ALPHA_CHANNEL] - data[b + ALPHA_CHANNEL]);
        for (let c = 0; c < CHANNELS; c++)
          step += Math.abs(data[a + c] * alphaA - data[b + c] * alphaB);
        steps[k * (length - 1) + i] += step;
      }
  }
  return { lines, length: length - 1, steps };
}

/** Histogram, in BIN-wide bins, of the distances between boundaries of the same line. */
function boundaryDistances(image: PixelBuffer, horizontal: boolean): Float64Array {
  const { lines, length, steps } = lineSteps(image, horizontal);
  const histogram = new Float64Array(Math.ceil(MAX_DISTANCE / BIN) + 1);
  const positive = steps.filter((step) => step > 0).sort();
  if (!positive.length) return histogram;
  const threshold = Math.max(
    EDGE_FLOOR,
    EDGE_SHARE *
      positive[Math.min(positive.length - 1, Math.floor(EDGE_QUANTILE * positive.length))],
  );
  const boundaries: number[] = [];
  for (let k = 0; k < lines; k++) {
    const row = k * length;
    boundaries.length = 0;
    for (let i = 0; i < length; i++) {
      const here = steps[row + i],
        left = i > 0 ? steps[row + i - 1] : 0,
        right = i + 1 < length ? steps[row + i + 1] : 0;
      if (here <= threshold || here <= left || here < right) continue;
      const curvature = left - 2 * here + right;
      const shift = curvature ? (0.5 * (left - right)) / curvature : 0;
      boundaries.push(i + Math.max(-0.5, Math.min(0.5, shift)));
    }
    for (let a = 0; a < boundaries.length; a++)
      for (let b = a + 1; b <= Math.min(boundaries.length - 1, a + MAX_LAG); b++) {
        const distance = boundaries[b] - boundaries[a];
        if (distance >= MIN_DISTANCE && distance <= MAX_DISTANCE)
          histogram[Math.round(distance / BIN)]++;
      }
  }
  return histogram;
}

/** Mean of cos(2π distance / step) over the distances of a histogram with bins `bin` wide. */
function combScore(histogram: Float64Array, bin: number, step: number, weighted = false): number {
  let sum = 0,
    total = 0;
  for (let i = 0; i < histogram.length; i++) {
    if (!histogram[i]) continue;
    const distance = i * bin;
    const weight = histogram[i] * (weighted ? distance / step : 1);
    sum += weight * Math.cos((2 * Math.PI * distance) / step);
    total += weight;
  }
  return total ? sum / total : 0;
}

/** The step refined by a fine search, then by least squares over the multiples it explains. */
function refine(histogram: Float64Array, step: number): number {
  const fine = new Float64Array(Math.ceil(MAX_DISTANCE / REFINE_BIN) + 1);
  for (let i = 0; i < histogram.length; i++)
    if (histogram[i]) fine[Math.round((i * BIN) / REFINE_BIN)] += histogram[i];
  let best = step,
    bestScore = -Infinity;
  for (let s = step * (1 - REFINE_SPAN); s <= step * (1 + REFINE_SPAN); s *= REFINE_RATIO) {
    const score = combScore(fine, REFINE_BIN, s, true);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    let numerator = 0,
      denominator = 0;
    for (let i = 0; i < fine.length; i++) {
      if (!fine[i]) continue;
      const distance = i * REFINE_BIN;
      const order = Math.round(distance / best);
      if (order < 1) continue;
      const weight =
        fine[i] *
        order *
        Math.max(0, 1 - Math.abs(distance - order * best) / (REFINE_TOLERANCE * best));
      numerator += weight * order * distance;
      denominator += weight * order * order;
    }
    if (denominator <= 0) break;
    best = numerator / denominator;
  }
  return best;
}

/** The standing step of an axis, or null when its boundaries are too few or keep no step. */
function axisStep(image: PixelBuffer, horizontal: boolean): number | null {
  const length = horizontal ? image.width : image.height;
  const longest = Math.min(MAX_STEP, length / MIN_PERIODS);
  if (longest <= MIN_STEP) return null;
  const histogram = boundaryDistances(image, horizontal);
  let total = 0;
  for (const count of histogram) total += count;
  if (total < MIN_DISTANCES) return null;
  const steps: number[] = [];
  for (let step = MIN_STEP; step <= longest; step *= STEP_RATIO) steps.push(step);
  const scores = steps.map((step) => combScore(histogram, BIN, step));
  const peaks: number[] = [];
  for (let i = 1; i + 1 < steps.length; i++)
    if (scores[i] > scores[i - 1] && scores[i] >= scores[i + 1] && scores[i] > 0) peaks.push(i);
  if (!peaks.length) return null;
  peaks.sort((a, b) => scores[b] - scores[a]);
  const top = scores[peaks[0]];
  const support = (step: number) => {
    const window = Math.max(MIN_FUNDAMENTAL_WINDOW, FUNDAMENTAL_WINDOW * step);
    let near = 0;
    for (let i = 0; i < histogram.length; i++)
      if (Math.abs(i * BIN - step) < window) near += histogram[i];
    return near / total;
  };
  const tied = peaks
    .filter((i) => scores[i] >= TIE_SHARE * top)
    .sort((a, b) => steps[b] - steps[a])
    .find((i) => support(steps[i]) >= FUNDAMENTAL_SHARE);
  return refine(histogram, steps[tied ?? peaks[0]]);
}

/**
 * The lattice covering the image at the cell counts of the axes' standing steps; an axis without
 * one takes the other's. Also proposes adjacent counts (±1) to handle rounding ambiguities in
 * block-reset and phase-varied upscales.
 */
export function distanceCountGrids(image: PixelBuffer): PixelGridAnalysis[] {
  const across = axisStep(image, true),
    down = axisStep(image, false);
  const x = across ?? down,
    y = down ?? across;
  if (x === null || y === null) return [];
  const columns = Math.round(image.width / x),
    rows = Math.round(image.height / y);
  const fits = (count: number, length: number) =>
    count >= MIN_GRID_CELLS && count <= Math.min(length, MAX_RECOVERED_GRID_SIZE);
  if (!fits(columns, image.width) || !fits(rows, image.height)) return [];
  const grids: PixelGridAnalysis[] = [
    {
      ...blockPartition(image, columns, rows),
      confidence: 0,
      reliable: true,
      algorithm: PixelationAlgorithm.UniformGrid,
    },
  ];
  // Adjacent counts for block-reset ambiguities
  for (const dc of [-1, 1])
    for (const dr of [-1, 1]) {
      const c = columns + dc,
        r = rows + dr;
      if (fits(c, image.width) && fits(r, image.height))
        grids.push({
          ...blockPartition(image, c, r),
          confidence: 0,
          reliable: true,
          algorithm: PixelationAlgorithm.UniformGrid,
        });
    }
  return grids;
}
