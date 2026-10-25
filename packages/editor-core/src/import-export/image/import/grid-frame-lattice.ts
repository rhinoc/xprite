import type { PixelBuffer } from "$/base/primitives";
import {
  MAX_GRID_CELL_SIZE,
  MAX_RECOVERED_GRID_SIZE,
  pixelGridCuts,
} from "$/import-export/image/import/grid";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

/**
 * Whole-frame lattices. An upscale of a whole image maps native cell i of n onto
 * [i, i + 1) * length / n. A soft resample (bilinear, blurred, AI) kinks at each cell's sample
 * point (i + 0.5) * length / n - 0.5; a nearest one steps on each boundary i * length / n. The
 * curvature energy (soft) or the step energy (hard) along each axis is projected onto that comb
 * for every integer count n. The projection is phase-locked to the frame, so it needs no pitch or
 * phase search, integrates every line of the image, and stays exact for cells below two pixels,
 * where the comb lies above the Nyquist rate and an autocorrelation only sees its alias.
 *
 * Sampled at whole pixels, soft kinks at count n and hard steps at count length - n are the
 * same signal. Below a two-pixel pitch a lattice therefore also has to explain the image better
 * under its model than the alias does under the other. Hard steps at counts n and length - n
 * project alike too; the boundary edges the two counts do not share decide between them.
 *
 * A count is accepted when the projection stands out from the profile's own fluctuation on both
 * axes, a reconstruction from the lattice's sample points beats the same reconstruction half a
 * cell out of step across the frame, and the lattice is no harmonic or subdivision of a coarser
 * grid. A hard lattice's boundaries must also gather the steps.
 */
const CHANNELS = 4;
const ALPHA_CHANNEL = 3;
const ALPHA_SCALE = 255;
/** Below this pitch a lattice is no longer told from a blurred native image. */
const MIN_PITCH = 1.5;
/** As the soft arbiter: fewer cells per axis can line up with large smooth features. */
const MIN_CELLS = 8;
const MAX_SAMPLED_LINES = 1024;
/** Relative pitch difference (plus one cell) the two axes of one square-celled lattice may show. */
const SQUARE_TOLERANCE = 0.02;
/** Joint projection, in standard deviations of a structureless profile, a lattice must reach. */
const MIN_SIGNIFICANCE = 5;
const MAX_HARMONICS = 8;
/** Share of the out-of-step reconstruction error the lattice must remove. */
const MIN_GAIN = 0.1;
/** Cells the out-of-step lattices gain or lose across the frame. */
const OUT_OF_STEP = 0.5;
const RECONSTRUCTION_ROWS = 256;
/** Pitch below which the comb lies above the Nyquist rate and has an alias. */
const ALIAS_PITCH = 2;
/** Mean step inside the groups of a k-fold split, against the step between groups. */
const SPLIT_STEP_RATIO = 0.25;
/** Step energy on the finer alias's own boundaries, against the shared ones, that keeps it. */
const ALIAS_CONTRAST = 0.4;
/**
 * Share of the step energy a hard lattice's boundaries must gather beyond an even spread: a soft
 * image's broad features also step periodically at a few coarse counts.
 */
const MIN_STEP_EXCESS = 0.15;

/** How the native cells were resampled onto the frame. */
export enum FrameModel {
  /** Bilinear-like: the profile kinks at each cell's sample point. */
  Soft = "soft",
  /** Nearest-like: colour steps on each cell boundary. */
  Hard = "hard",
}

enum EdgeKind {
  Shared,
  Exclusive,
  Neither,
}
const EDGE_KINDS = 3;

enum Resample {
  Bilinear,
  Nearest,
}

const resampleOf = (model: FrameModel) =>
  model === FrameModel.Soft ? Resample.Bilinear : Resample.Nearest;

const premultiplied = (data: Uint8ClampedArray, o: number, c: number) =>
  c === ALPHA_CHANNEL ? data[o + c] : (data[o + c] * data[o + ALPHA_CHANNEL]) / ALPHA_SCALE;

/**
 * Mean energy along sampled lines of the squared difference of every channel: the second
 * difference centred on pixel i (soft), or the step from pixel i - 1 to pixel i (hard).
 */
function energyProfile(image: PixelBuffer, horizontal: boolean, model: FrameModel): Float64Array {
  const { width, height, data } = image;
  const length = horizontal ? width : height;
  const cross = horizontal ? height : width;
  const stride = Math.max(1, Math.ceil(cross / MAX_SAMPLED_LINES));
  const unit = (horizontal ? 1 : width) * CHANNELS;
  const soft = model === FrameModel.Soft;
  const profile = new Float64Array(length);
  let lines = 0;
  for (let line = 0; line < cross; line += stride, lines++) {
    const start = (horizontal ? line * width : line) * CHANNELS;
    for (let i = 1; i < length - (soft ? 1 : 0); i++) {
      const o = start + i * unit;
      let energy = 0;
      for (let c = 0; c < CHANNELS; c++) {
        const d = soft
          ? premultiplied(data, o - unit, c) -
            2 * premultiplied(data, o, c) +
            premultiplied(data, o + unit, c)
          : premultiplied(data, o, c) - premultiplied(data, o - unit, c);
        energy += d * d;
      }
      profile[i] += energy;
    }
  }
  for (let i = 0; i < length; i++) profile[i] /= lines;
  return profile;
}

interface AxisComb {
  first: number;
  significance: Float64Array;
}

/**
 * Projection of the profile onto the comb of every count from `first` to `last`, in units of its
 * standard deviation were the profile structureless: positive when the energy gathers on the
 * sample points (soft) or on the cell boundaries (hard).
 */
function combSignificance(
  profile: Float64Array,
  first: number,
  last: number,
  model: FrameModel,
): AxisComb {
  const length = profile.length;
  const soft = model === FrameModel.Soft;
  // The soft profile lives on pixels 1..length-2, the hard one on the edges 1..length-1.
  const end = soft ? length - 1 : length;
  const centred = new Float64Array(length);
  let mean = 0;
  for (let i = 1; i < end; i++) mean += profile[i];
  mean /= end - 1;
  let energy = 0;
  for (let i = 1; i < end; i++) {
    centred[i] = profile[i] - mean;
    energy += centred[i] ** 2;
  }
  const noise = Math.sqrt(energy / 2);
  const significance = new Float64Array(Math.max(0, last - first + 1));
  if (noise <= 0) return { first, significance };
  for (let count = first; count <= last; count++) {
    // cos(2 pi count u / length) by rotation, u the pixel centre i + 0.5 (soft) or the edge i
    // (hard): -1 on the sample points, 1 on the boundaries.
    const step = (2 * Math.PI * count) / length;
    const stepCos = Math.cos(step),
      stepSin = Math.sin(step);
    let cos = soft ? Math.cos(step / 2) : 1,
      sin = soft ? Math.sin(step / 2) : 0,
      sum = 0;
    for (let i = 0; i < length; i++) {
      sum += centred[i] * cos;
      const next = cos * stepCos - sin * stepSin;
      sin = sin * stepCos + cos * stepSin;
      cos = next;
    }
    significance[count - first] = ((soft ? -1 : 1) * sum) / noise;
  }
  return { first, significance };
}

/**
 * Harmonic sum of the comb at `count`: the pulses also project onto every multiple k * count,
 * with sign (-1)^(k + 1) for kinks on the sample points and +1 for steps on the boundaries. The
 * best normalised partial sum over the first harmonics prefers the fundamental over its
 * multiples (which miss harmonics) and rejects its fractions (whose harmonics fall between the
 * pulses).
 */
function harmonicSum(comb: AxisComb, count: number, model: FrameModel): number {
  const { first, significance } = comb;
  const last = first + significance.length - 1;
  let partial = 0,
    best = -Infinity;
  for (let k = 1; k <= MAX_HARMONICS && k * count <= last; k++) {
    const sign = model === FrameModel.Hard || k % 2 ? 1 : -1;
    partial += sign * significance[k * count - first];
    best = Math.max(best, partial / Math.sqrt(k));
  }
  return best;
}

/**
 * Whether the counts are a whole multiple of counts whose own comb is significant, of either
 * sign: the lattice then repeats a coarser grid's harmonic, which the edge detectors and the
 * arbiter judge instead.
 */
function isHarmonic(x: AxisComb, y: AxisComb, columns: number, rows: number): boolean {
  for (let k = 2; k <= MAX_HARMONICS; k++) {
    if (columns % k || rows % k || columns / k < x.first || rows / k < y.first) continue;
    const fundamental =
      (Math.abs(x.significance[columns / k - x.first]) +
        Math.abs(y.significance[rows / k - y.first])) /
      Math.SQRT2;
    if (fundamental >= MIN_SIGNIFICANCE) return true;
  }
  return false;
}

/** Sample positions of `cells` (possibly fractional) frame-aligned cells, clamped to the axis. */
function samplePoints(length: number, cells: number): Float64Array {
  const points = new Float64Array(Math.ceil(cells));
  for (let i = 0; i < points.length; i++)
    points[i] = Math.min(length - 1, Math.max(0, ((i + 0.5) * length) / cells - 0.5));
  return points;
}

interface LatticeSamples {
  /** Cell counts, possibly fractional. */
  columns: number;
  rows: number;
  /** Sample points per axis. */
  across: number;
  down: number;
  /** Premultiplied channels of each sample point, row by row. */
  values: Float64Array;
}

/** The image read bilinearly at the sample points of `columns` x `rows` frame-aligned cells. */
function latticeSamples(image: PixelBuffer, columns: number, rows: number): LatticeSamples {
  const { width, height, data } = image;
  const xs = samplePoints(width, columns),
    ys = samplePoints(height, rows);
  const values = new Float64Array(xs.length * ys.length * CHANNELS);
  const at = (x: number, y: number) => (y * width + x) * CHANNELS;
  for (let j = 0; j < ys.length; j++) {
    const y0 = Math.floor(ys[j]),
      y1 = Math.min(height - 1, y0 + 1),
      ty = ys[j] - y0;
    for (let i = 0; i < xs.length; i++) {
      const x0 = Math.floor(xs[i]),
        x1 = Math.min(width - 1, x0 + 1),
        tx = xs[i] - x0;
      for (let c = 0; c < CHANNELS; c++)
        values[(j * xs.length + i) * CHANNELS + c] =
          (premultiplied(data, at(x0, y0), c) * (1 - tx) +
            premultiplied(data, at(x1, y0), c) * tx) *
            (1 - ty) +
          (premultiplied(data, at(x0, y1), c) * (1 - tx) +
            premultiplied(data, at(x1, y1), c) * tx) *
            ty;
    }
  }
  return { columns, rows, across: xs.length, down: ys.length, values };
}

/** Lower sample index, and weight of the next one, that each pixel of an axis reads. */
function spread(length: number, cells: number, points: number, resample: Resample) {
  const index = new Int32Array(length),
    weight = new Float64Array(length);
  for (let p = 0; p < length; p++) {
    const u = Math.min(points - 1, Math.max(0, ((p + 0.5) * cells) / length - 0.5));
    if (resample === Resample.Nearest) {
      index[p] = Math.round(u);
      continue;
    }
    index[p] = Math.min(points - 2, Math.floor(u));
    weight[p] = u - index[p];
  }
  return { index, weight };
}

/** Mean squared error, on sampled rows, of the image against its rebuild from the samples. */
function reconstructionError(
  image: PixelBuffer,
  lattice: LatticeSamples,
  resample: Resample,
): number {
  const { width, height, data } = image;
  const { across, down, values } = lattice;
  const sx = spread(width, lattice.columns, across, resample),
    sy = spread(height, lattice.rows, down, resample);
  const stride = Math.max(1, Math.floor(height / RECONSTRUCTION_ROWS));
  let error = 0,
    count = 0;
  for (let y = 0; y < height; y += stride) {
    const top = sy.index[y] * across,
      bottom = Math.min(down - 1, sy.index[y] + 1) * across,
      ty = sy.weight[y];
    for (let x = 0; x < width; x++) {
      const left = sx.index[x],
        right = Math.min(across - 1, left + 1),
        tx = sx.weight[x];
      const o = (y * width + x) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) {
        const s = (cell: number) => values[cell * CHANNELS + c];
        const value =
          (s(top + left) * (1 - tx) + s(top + right) * tx) * (1 - ty) +
          (s(bottom + left) * (1 - tx) + s(bottom + right) * tx) * ty;
        error += (value - premultiplied(data, o, c)) ** 2;
      }
      count++;
    }
  }
  return count ? error / count : 0;
}

/** The out-of-step reconstruction error share that the lattice itself avoids. */
function reconstructionGain(image: PixelBuffer, lattice: LatticeSamples, model: FrameModel) {
  const { columns, rows } = lattice;
  const resample = resampleOf(model);
  const aligned = reconstructionError(image, lattice, resample);
  const outOfStep = (cells: number) =>
    reconstructionError(image, latticeSamples(image, cells, (rows * cells) / columns), resample);
  const off = (outOfStep(columns + OUT_OF_STEP) + outOfStep(columns - OUT_OF_STEP)) / 2;
  return off > 0 ? 1 - aligned / off : 0;
}

/** Whether the other model at the alias counts explains the image at least as well. */
function aliasExplains(image: PixelBuffer, lattice: LatticeSamples, model: FrameModel): boolean {
  const { width, height } = image;
  const { columns, rows } = lattice;
  const aliasColumns = width / columns < ALIAS_PITCH ? width - columns : columns,
    aliasRows = height / rows < ALIAS_PITCH ? height - rows : rows;
  if (aliasColumns === columns && aliasRows === rows) return false;
  const other = model === FrameModel.Soft ? FrameModel.Hard : FrameModel.Soft;
  return (
    reconstructionError(image, latticeSamples(image, aliasColumns, aliasRows), resampleOf(other)) <=
    reconstructionError(image, lattice, resampleOf(model))
  );
}

/**
 * Whether the samples group into k x k blocks (2 <= k <= MAX_HARMONICS) on both axes: a blurred
 * edge kinks on both sides of a coarse boundary, so the comb can also lock to a subdivision of a
 * coarse grid. Steps between neighbouring samples then stay small inside each group and gather
 * on one residue; on a true lattice every residue steps alike.
 */
function splitsCoarserCells(lattice: LatticeSamples): boolean {
  const { across, down, values } = lattice;
  const step = (a: number, b: number) => {
    let sum = 0;
    for (let c = 0; c < CHANNELS; c++) sum += Math.abs(values[a + c] - values[b + c]);
    return sum;
  };
  const splits = (residues: Float64Array) => {
    const sorted = Array.from(residues).sort((a, b) => a - b);
    const inside = sorted.slice(0, -1).reduce((a, b) => a + b, 0) / (sorted.length - 1);
    return inside < SPLIT_STEP_RATIO * sorted[sorted.length - 1];
  };
  for (let k = 2; k <= MAX_HARMONICS; k++) {
    if (across % k || down % k) continue;
    const horizontal = new Float64Array(k),
      vertical = new Float64Array(k);
    for (let j = 0; j < down; j++)
      for (let i = 0; i < across; i++) {
        const o = (j * across + i) * CHANNELS;
        if (i + 1 < across) horizontal[i % k] += step(o, o + CHANNELS);
        if (j + 1 < down) vertical[j % k] += step(o, o + across * CHANNELS);
      }
    if (splits(horizontal) && splits(vertical)) return true;
  }
  return false;
}

const isSquare = (width: number, height: number, columns: number, rows: number) =>
  Math.abs(rows - (columns * height) / width) <=
  ((columns * height) / width) * SQUARE_TOLERANCE + 1;

const countRange = (length: number) => ({
  first: Math.max(MIN_CELLS, Math.ceil(length / MAX_GRID_CELL_SIZE)),
  last: Math.min(MAX_RECOVERED_GRID_SIZE, Math.floor(length / MIN_PITCH)),
});

const inRange = (count: number, range: { first: number; last: number }) =>
  count >= range.first && count <= range.last;

/** Pixel edges where a nearest resample of `count` frame-aligned cells starts each next cell. */
function boundaryEdges(length: number, count: number): Uint8Array {
  const edges = new Uint8Array(length);
  for (let i = 1; i < count; i++) edges[Math.ceil((i * length) / count - 0.5)] = 1;
  return edges;
}

/**
 * Step energy on the boundary edges of `fine` cells that are no boundary of `coarse` cells, as a
 * share of the energy on the boundaries both share, each above the energy on edges neither has:
 * blur or jitter spreads steps onto the edges beside them alike, whichever lattice is true.
 */
function exclusiveContrast(profile: Float64Array, fine: number, coarse: number): number {
  const length = profile.length;
  const own = boundaryEdges(length, fine),
    rival = boundaryEdges(length, coarse);
  const sum = new Float64Array(EDGE_KINDS),
    edges = new Float64Array(EDGE_KINDS);
  for (let e = 1; e < length; e++) {
    const kind = own[e] ? (rival[e] ? EdgeKind.Shared : EdgeKind.Exclusive) : EdgeKind.Neither;
    sum[kind] += profile[e];
    edges[kind]++;
  }
  if (!edges[EdgeKind.Exclusive] || !edges[EdgeKind.Shared] || !edges[EdgeKind.Neither]) return 0;
  const mean = (kind: EdgeKind) => sum[kind] / edges[kind];
  const floor = mean(EdgeKind.Neither);
  const shared = mean(EdgeKind.Shared) - floor;
  return shared > 0 ? (mean(EdgeKind.Exclusive) - floor) / shared : 0;
}

interface Profiles {
  x: Float64Array;
  y: Float64Array;
}

interface Counts {
  columns: number;
  rows: number;
}

/**
 * Steps on the boundaries of count n and of count length - n fall on whole pixels alike, so their
 * combs are identical. The boundaries of the coarser count are nearly all boundaries of the finer
 * one, so the finer count stands only when the steps also fill its own boundaries.
 */
function stepAlias(image: PixelBuffer, profiles: Profiles, counts: Counts): Counts {
  const { width, height } = image;
  const alias = { columns: width - counts.columns, rows: height - counts.rows };
  if (
    !inRange(alias.columns, countRange(width)) ||
    !inRange(alias.rows, countRange(height)) ||
    !isSquare(width, height, alias.columns, alias.rows)
  )
    return counts;
  const [coarse, fine] = alias.columns < counts.columns ? [alias, counts] : [counts, alias];
  const contrast =
    (exclusiveContrast(profiles.x, fine.columns, coarse.columns) +
      exclusiveContrast(profiles.y, fine.rows, coarse.rows)) /
    2;
  return contrast >= ALIAS_CONTRAST ? fine : coarse;
}

/**
 * Mean step energy on the boundary edges of `count` cells above the mean of all edges, as a share
 * of the excess a nearest resample reaches when every step lies on a boundary.
 */
function stepExcess(profile: Float64Array, count: number): number {
  const length = profile.length;
  const boundaries = boundaryEdges(length, count);
  let on = 0,
    all = 0;
  for (let e = 1; e < length; e++) {
    all += profile[e];
    if (boundaries[e]) on += profile[e];
  }
  const pitch = length / count;
  return all > 0 ? (((on / (count - 1)) * (length - 1)) / all - 1) / (pitch - 1) : 0;
}

function fitFrame(image: PixelBuffer, model: FrameModel): PixelGridAnalysis | null {
  const { width, height } = image;
  const rangeX = countRange(width),
    rangeY = countRange(height);
  if (rangeX.last < rangeX.first || rangeY.last < rangeY.first) return null;
  const profiles = { x: energyProfile(image, true, model), y: energyProfile(image, false, model) };
  const x = combSignificance(profiles.x, rangeX.first, rangeX.last, model),
    y = combSignificance(profiles.y, rangeY.first, rangeY.last, model);
  const harmonicsY = Array.from({ length: rangeY.last - rangeY.first + 1 }, (_, i) =>
    harmonicSum(y, rangeY.first + i, model),
  );
  let best = { joint: -Infinity, columns: 0, rows: 0 };
  for (let columns = rangeX.first; columns <= rangeX.last; columns++) {
    const ideal = (columns * height) / width;
    const low = Math.max(rangeY.first, Math.floor(ideal * (1 - SQUARE_TOLERANCE)) - 1),
      high = Math.min(rangeY.last, Math.ceil(ideal * (1 + SQUARE_TOLERANCE)) + 1);
    const along = harmonicSum(x, columns, model);
    for (let rows = low; rows <= high; rows++) {
      const joint = (along + harmonicsY[rows - rangeY.first]) / Math.SQRT2;
      if (joint > best.joint) best = { joint, columns, rows };
    }
  }
  if (best.joint < MIN_SIGNIFICANCE) return null;
  const hard = model === FrameModel.Hard;
  const { columns, rows } = hard ? stepAlias(image, profiles, best) : best;
  if (isHarmonic(x, y, columns, rows)) return null;
  if (
    hard &&
    (stepExcess(profiles.x, columns) + stepExcess(profiles.y, rows)) / 2 < MIN_STEP_EXCESS
  )
    return null;
  const lattice = latticeSamples(image, columns, rows);
  const gain = reconstructionGain(image, lattice, model);
  if (gain < MIN_GAIN || aliasExplains(image, lattice, model) || splitsCoarserCells(lattice))
    return null;
  const cellWidth = width / columns,
    cellHeight = height / rows;
  return {
    width: columns,
    height: rows,
    cellWidth,
    cellHeight,
    offsetX: 0,
    offsetY: 0,
    cutsX: pixelGridCuts(width, cellWidth),
    cutsY: pixelGridCuts(height, cellHeight),
    confidence: Math.min(1, gain),
    reliable: true,
    algorithm: PixelationAlgorithm.UniformGrid,
  };
}

/**
 * The frame-aligned lattice of each of `models` that passes the significance, reconstruction,
 * alias and subdivision tests. Cells are square up to SQUARE_TOLERANCE.
 */
export function detectFrameLattices(
  image: PixelBuffer,
  models: readonly FrameModel[] = [FrameModel.Soft, FrameModel.Hard],
): PixelGridAnalysis[] {
  return models.flatMap((model) => fitFrame(image, model) ?? []);
}
