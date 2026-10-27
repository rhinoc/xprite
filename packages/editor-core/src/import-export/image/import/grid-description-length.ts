import type { PixelBuffer } from "$/base/primitives";

/**
 * Description length of an image under a grid hypothesis: the cost of the cuts and the cell
 * colours plus the residual left by rebuilding the image from them. Grids from every detector and
 * resampling model compete on this one scale, so a finer grid has to buy its extra cells with a
 * smaller residual, and a free mesh its cut positions.
 *
 * - The residual is Gaussian at the rebuild's own mean squared error. The variance floor stands
 *   for the few pixels a correct grid still misplaces (rounded cuts, compression), so that a
 *   residual near zero is not worth any number of extra cells.
 * - A cell colour is coded against its left or upper neighbour at the residual's precision: a cell
 *   that repeats its neighbour costs almost nothing, so cutting a flat run finer, or merging
 *   repeated columns of pixel art, changes little, while a cell of new colour costs about the
 *   precision it is given to.
 * - Each cell costs one parameter (half the log of the samples, as in BIC), so equal fits keep the
 *   coarser grid. A lattice costs four cut parameters; a lattice snapped to edges adds each cut's
 *   offset within its radius (weighted so mild snaps stay expensive); a free mesh pays MESH_CUT_PARAMETERS per cut.
 *
 * The rebuild is nearest (each pixel takes its cell's mean) or bilinear (between cell centres
 * read from the image); the cheaper reading stands.
 */
const CHANNELS = 3;
const ALPHA_CHANNEL = 3;
const STRIDE = 4;
const ALPHA_SCALE = 255;
const RESIDUAL_FLOOR = 16;
/** Pixels a description covers; larger images are described on evenly spread whole rows. */
const PIXEL_BUDGET = 1 << 19;
/** Pixels a cell's centre sits from its first pixel, as a share of the cell. */
const HALF = 0.5;
/** Cut parameters of a uniform lattice: a pitch and a phase per axis. */
const LATTICE_CUT_PARAMETERS = 4;
/**
 * Parameters a free mesh cut costs. Native pixel grids are regular, so a mesh must explain
 * markedly more than the lattice snapped to the same edges; a drifting or warped grid does.
 * Kept high enough that a slightly wrong free mesh loses to a snapped lattice of the true count
 * once snapped offsets themselves carry SNAP_OFFSET_WEIGHT.
 */
const MESH_CUT_PARAMETERS = 80;
/**
 * Extra weight on Snapped cut-offset terms. Radius ≈ 1 made snap nearly free, so wrong lattices
 * overfit edges and beat nearer covering lattices on description length. Large weight keeps snap
 * useful when residual drops a lot (jittered soft grids) but stops mild snap fits from winning.
 */
const SNAP_OFFSET_WEIGHT = 400;

export enum CutModel {
  /** One lattice per axis. */
  Lattice = "lattice",
  /** A lattice whose cuts each moved within a radius. */
  Snapped = "snapped",
  /** Every cut placed on its own. */
  Free = "free",
}

export interface GridCuts {
  cutsX: readonly number[];
  cutsY: readonly number[];
  model: CutModel;
  /** Pixels a snapped cut could move either way, per axis. */
  radiusX?: number;
  radiusY?: number;
}

const value = (data: Uint8ClampedArray, o: number, c: number) =>
  (data[o + c] * data[o + ALPHA_CHANNEL]) / ALPHA_SCALE;

function cellOf(cuts: readonly number[], length: number): Int32Array {
  const index = new Int32Array(length);
  for (let cell = 0; cell + 1 < cuts.length; cell++) index.fill(cell, cuts[cell], cuts[cell + 1]);
  return index;
}

/** Rows the description covers: all of them, or evenly spread rows within PIXEL_BUDGET. */
function describedRows(width: number, height: number): Int32Array {
  const count = Math.min(height, Math.max(1, Math.floor(PIXEL_BUDGET / width)));
  return Int32Array.from({ length: count }, (_, i) => Math.floor(((i + HALF) * height) / count));
}

/** Cell means of every channel over the described rows, and how many pixels each cell holds. */
function cellMeans(
  image: PixelBuffer,
  across: number,
  down: number,
  lines: Int32Array,
  columns: Int32Array,
  rows: Int32Array,
) {
  const { width, data } = image;
  const sums = new Float64Array(across * down * CHANNELS),
    counts = new Float64Array(across * down);
  for (const y of lines)
    for (let x = 0; x < width; x++) {
      const cell = rows[y] * across + columns[x],
        o = (y * width + x) * STRIDE;
      counts[cell]++;
      for (let c = 0; c < CHANNELS; c++) sums[cell * CHANNELS + c] += value(data, o, c);
    }
  for (let cell = 0; cell < across * down; cell++)
    for (let c = 0; c < CHANNELS; c++) sums[cell * CHANNELS + c] /= Math.max(1, counts[cell]);
  return { means: sums, counts };
}

/** Cell centres, and for each pixel the centre below it and the weight of the next one. */
function centres(cuts: readonly number[], length: number) {
  const points = Array.from(
    { length: cuts.length - 1 },
    (_, i) => (cuts[i] + cuts[i + 1]) * HALF - HALF,
  );
  const lower = new Int32Array(length),
    weight = new Float64Array(length);
  let a = 0;
  for (let p = 0; p < length; p++) {
    while (a + 1 < points.length && points[a + 1] <= p) a++;
    lower[p] = a;
    weight[p] =
      a + 1 < points.length
        ? Math.min(1, Math.max(0, (p - points[a]) / (points[a + 1] - points[a])))
        : 0;
  }
  return { points, lower, weight };
}

/** The image read bilinearly at every cell centre. */
function centreSamples(image: PixelBuffer, xs: readonly number[], ys: readonly number[]) {
  const { width, height, data } = image;
  const samples = new Float64Array(xs.length * ys.length * CHANNELS);
  for (let j = 0; j < ys.length; j++) {
    const fy = Math.min(height - 1, Math.max(0, ys[j]));
    const y0 = Math.floor(fy),
      y1 = Math.min(height - 1, y0 + 1),
      ty = fy - y0;
    for (let i = 0; i < xs.length; i++) {
      const fx = Math.min(width - 1, Math.max(0, xs[i]));
      const x0 = Math.floor(fx),
        x1 = Math.min(width - 1, x0 + 1),
        tx = fx - x0;
      const at = (x: number, y: number) => (y * width + x) * STRIDE;
      for (let c = 0; c < CHANNELS; c++)
        samples[(j * xs.length + i) * CHANNELS + c] =
          (value(data, at(x0, y0), c) * (1 - tx) + value(data, at(x1, y0), c) * tx) * (1 - ty) +
          (value(data, at(x0, y1), c) * (1 - tx) + value(data, at(x1, y1), c) * tx) * ty;
    }
  }
  return samples;
}

/**
 * Cost of the described cells' colours, each coded against the nearer of its left and upper
 * neighbours (or against black when it has neither).
 */
function colourCost(
  colours: Float64Array,
  described: Float64Array,
  across: number,
  down: number,
  variance: number,
) {
  let cost = 0;
  const distance = (a: number, b: number) => {
    let sum = 0;
    for (let c = 0; c < CHANNELS; c++)
      sum += (colours[a * CHANNELS + c] - colours[b * CHANNELS + c]) ** 2;
    return sum;
  };
  for (let j = 0; j < down; j++)
    for (let i = 0; i < across; i++) {
      const cell = j * across + i;
      if (!described[cell]) continue;
      let step = Infinity;
      if (i > 0 && described[cell - 1]) step = distance(cell, cell - 1);
      if (j > 0 && described[cell - across]) step = Math.min(step, distance(cell, cell - across));
      if (!Number.isFinite(step)) {
        step = 0;
        for (let c = 0; c < CHANNELS; c++) step += colours[cell * CHANNELS + c] ** 2;
      }
      cost += (CHANNELS / 2) * Math.log1p(step / (CHANNELS * variance));
    }
  return cost;
}

function cutCost(cuts: GridCuts, perParameter: number): number {
  const across = cuts.cutsX.length - 1,
    down = cuts.cutsY.length - 1;
  const lattice = LATTICE_CUT_PARAMETERS * perParameter;
  switch (cuts.model) {
    case CutModel.Lattice:
      return lattice;
    case CutModel.Snapped:
      return (
        lattice +
        SNAP_OFFSET_WEIGHT *
          ((across - 1) * Math.log(2 * (cuts.radiusX ?? 0) + 1) +
            (down - 1) * Math.log(2 * (cuts.radiusY ?? 0) + 1))
      );
    case CutModel.Free:
      return MESH_CUT_PARAMETERS * perParameter * (across + down - 2);
  }
}

/** Description length per sample (pixel channel of a described row), in nats. */
export function descriptionLength(image: PixelBuffer, cuts: GridCuts): number {
  const { width, height, data } = image;
  const across = cuts.cutsX.length - 1,
    down = cuts.cutsY.length - 1;
  const lines = describedRows(width, height);
  const samples = lines.length * width * CHANNELS;
  const columns = cellOf(cuts.cutsX, width),
    rows = cellOf(cuts.cutsY, height);
  const { means, counts } = cellMeans(image, across, down, lines, columns, rows);
  const cx = centres(cuts.cutsX, width),
    cy = centres(cuts.cutsY, height);
  const sampled = centreSamples(image, cx.points, cy.points);
  let nearestError = 0,
    bilinearError = 0;
  for (const y of lines) {
    const top = cy.lower[y] * across,
      bottom = Math.min(down - 1, cy.lower[y] + 1) * across,
      ty = cy.weight[y];
    for (let x = 0; x < width; x++) {
      const left = cx.lower[x],
        right = Math.min(across - 1, left + 1),
        tx = cx.weight[x];
      const o = (y * width + x) * STRIDE,
        cell = (rows[y] * across + columns[x]) * CHANNELS;
      const a = (top + left) * CHANNELS,
        b = (top + right) * CHANNELS,
        d = (bottom + left) * CHANNELS,
        e = (bottom + right) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) {
        const actual = value(data, o, c);
        nearestError += (actual - means[cell + c]) ** 2;
        const rebuilt =
          (sampled[a + c] * (1 - tx) + sampled[b + c] * tx) * (1 - ty) +
          (sampled[d + c] * (1 - tx) + sampled[e + c] * tx) * ty;
        bilinearError += (actual - rebuilt) ** 2;
      }
    }
  }
  let described = 0;
  for (const count of counts) if (count) described++;
  const perParameter = Math.log(samples) / 2;
  const structure = cutCost(cuts, perParameter) + described * perParameter;
  const reading = (error: number, colours: Float64Array) => {
    const variance = error / samples + RESIDUAL_FLOOR;
    return (
      (samples / 2) * Math.log(variance) +
      colourCost(colours, counts, across, down, variance) +
      structure
    );
  };
  return Math.min(reading(nearestError, means), reading(bilinearError, sampled)) / samples;
}
