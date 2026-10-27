import type { PixelBuffer } from "$/base/primitives";

/**
 * Description length of an image under a grid hypothesis: the cost of the cuts and the cell
 * colours plus the residual left by rebuilding the image from them. Grids from every proposer
 * compete on this one scale, so a finer grid has to buy its extra cells with a smaller residual,
 * and a free mesh its cut positions. Every grid is measured on the content inside the image's
 * frame (outer lines of one colour, such as padding), where each grid's cuts are clipped.
 *
 * - The residual is Gaussian at the rebuild's own mean squared error. The variance floor stands
 *   for the few pixels a correct grid still misplaces (rounded cuts, compression), so that a
 *   residual near zero is not worth any number of extra cells.
 * - A cell colour is coded against its left or upper neighbour at the residual's precision: a cell
 *   that repeats its neighbour costs almost nothing, while a cell of new colour costs about the
 *   precision it is given to.
 * - Each cell costs CELL_PARAMETERS parameters of half the log of the samples (as in BIC). A
 *   lattice costs four cut parameters; a lattice snapped to edges adds each cut's offset within
 *   its radius; a free mesh pays MESH_CUT_PARAMETERS per cut.
 *
 * The cells structure the image; how a cell's colour spreads over its pixels is the rendering,
 * and the cheapest of several renderings stands:
 *
 * - Nearest: every pixel takes its cell's mean.
 * - Bilinear: pixels blend the colours of the neighbouring cell centres, which are fitted to the
 *   pixels.
 * - Planar: a cell may carry a colour slope, which pays for itself only where it removes enough
 *   residual (shaded or gradient-filled cells).
 * - Blurred: cell colours seen through a Gaussian of one of BLUR_WIDTHS, as a soft or resampled
 *   upscale renders them. The colours are the cell means sharpened by one deconvolution step.
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
 * markedly more than a lattice of the same edges; a drifting or warped grid does.
 */
const MESH_CUT_PARAMETERS = 80;
/**
 * Weight on the snapped cut offsets. Snapping chooses each offset from the image, so the offsets
 * cost more than a free choice within the radius would: mild snaps that only chase content edges
 * must not pay for themselves.
 */
const SNAP_OFFSET_WEIGHT = 400;
/**
 * Parameters per described cell. Below one, so that a better residual at the true count can win
 * over a coarser covering lattice on painterly scale noise, while invented fine grids still lose.
 */
const CELL_PARAMETERS = 0.55;
/** Parameters of a planar cell's slope: one per channel and axis. */
const SLOPE_PARAMETERS = CHANNELS * 2;
/** Gaussian widths, in pixels, of the blurred renderings. */
const BLUR_WIDTHS = [1.2, 2] as const;
/**
 * The widest blur a cell may carry, as a share of its pitch: the rendering mixes only the
 * neighbouring cells, so a wider blur would reach cells it does not model.
 */
const MAX_BLUR_SHARE = 0.5;
/** Deconvolution steps from the cell means to the blurred colours. */
const DECONVOLUTION_STEPS = 1;
/** Cell centres a bilinear pixel blends. */
const BILINEAR_CORNERS = 4;
/** Neighbours on each side a blurred pixel mixes. */
const BLUR_REACH = 1;
const BLUR_TAPS = 2 * BLUR_REACH + 1;
/** Coefficients of the Abramowitz-Stegun approximation of erf (7.1.26). */
const ERF_P = 0.3275911;
const ERF_A = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429] as const;
const MIN_PLANAR_PIXELS = 3;
const MIN_PLANAR_AREA = 4;
const SINGULAR = 1e-9;

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

/** The rows a description covers and their premultiplied colours, shared by every grid. */
export interface DescribedImage {
  /** The input inside its frame. */
  content: PixelBuffer;
  /** Where the content starts in the input. */
  left: number;
  top: number;
  lines: Int32Array;
  /** Premultiplied RGB of each described row, row after row. */
  values: Float64Array;
  samples: number;
  /** Cost of one parameter, in nats. */
  parameter: number;
}

/** Premultiplied RGBA of a pixel as one number, so every clear pixel reads the same. */
function packedColour(data: Uint8ClampedArray, o: number): number {
  const alpha = data[o + ALPHA_CHANNEL];
  if (!alpha) return 0;
  let packed = alpha;
  for (let c = 0; c < CHANNELS; c++) packed = packed * (ALPHA_SCALE + 1) + data[o + c];
  return packed;
}

/**
 * The image less its frame: the outer rows and columns of the corner's colour. A frame describes
 * the same for every grid, so it says nothing about which one fits; only what it encloses does.
 */
function contentOf(image: PixelBuffer): { content: PixelBuffer; left: number; top: number } {
  const { width, height, data } = image;
  const frame = packedColour(data, 0);
  const framed = (x: number, y: number) => packedColour(data, (y * width + x) * STRIDE) === frame;
  const column = (x: number) => {
    for (let y = 0; y < height; y++) if (!framed(x, y)) return false;
    return true;
  };
  const row = (y: number) => {
    for (let x = 0; x < width; x++) if (!framed(x, y)) return false;
    return true;
  };
  let left = 0;
  while (left < width && column(left)) left++;
  if (left === width) return { content: image, left: 0, top: 0 };
  let right = width,
    top = 0,
    bottom = height;
  while (column(right - 1)) right--;
  while (row(top)) top++;
  while (row(bottom - 1)) bottom--;
  if (right - left === width && bottom - top === height) return { content: image, left, top };
  const content = {
    width: right - left,
    height: bottom - top,
    data: new Uint8ClampedArray((right - left) * (bottom - top) * STRIDE),
  };
  for (let y = top; y < bottom; y++)
    content.data.set(
      data.subarray((y * width + left) * STRIDE, (y * width + right) * STRIDE),
      (y - top) * content.width * STRIDE,
    );
  return { content, left, top };
}

/** Cuts of the input seen inside the content: those within it, plus its two ends. */
function contentCuts(cuts: readonly number[], start: number, length: number): number[] {
  const inside = [0];
  for (const cut of cuts) if (cut - start > 0 && cut - start < length) inside.push(cut - start);
  inside.push(length);
  return inside;
}

export function describeImage(input: PixelBuffer): DescribedImage {
  const { content: image, left, top } = contentOf(input);
  const { width, height, data } = image;
  const count = Math.min(height, Math.max(1, Math.floor(PIXEL_BUDGET / width)));
  const lines = Int32Array.from({ length: count }, (_, i) =>
    Math.floor(((i + HALF) * height) / count),
  );
  const values = new Float64Array(count * width * CHANNELS);
  for (let r = 0; r < count; r++)
    for (let x = 0; x < width; x++) {
      const o = (lines[r] * width + x) * STRIDE,
        v = (r * width + x) * CHANNELS;
      const alpha = data[o + ALPHA_CHANNEL] / ALPHA_SCALE;
      for (let c = 0; c < CHANNELS; c++) values[v + c] = data[o + c] * alpha;
    }
  const samples = count * width * CHANNELS;
  return { content: image, left, top, lines, values, samples, parameter: Math.log(samples) / 2 };
}

function cellOf(cuts: readonly number[], length: number): Int32Array {
  const index = new Int32Array(length);
  for (let cell = 0; cell + 1 < cuts.length; cell++) index.fill(cell, cuts[cell], cuts[cell + 1]);
  return index;
}

/** Per pixel, the cell centre below it and the weight of the next one. */
interface Centres {
  lower: Int32Array;
  weight: Float64Array;
}

function centres(cuts: readonly number[], length: number): Centres {
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
  return { lower, weight };
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

function erf(x: number): number {
  const t = 1 / (1 + ERF_P * Math.abs(x));
  let polynomial = 0;
  for (let k = ERF_A.length - 1; k >= 0; k--) polynomial = (polynomial + ERF_A[k]) * t;
  return Math.sign(x) * (1 - polynomial * Math.exp(-x * x));
}

/** Share of a Gaussian at `centre` that falls left of `edge`. */
const below = (edge: number, centre: number, sigma: number) =>
  HALF * (1 + erf((edge - centre) / (sigma * Math.SQRT2)));

/** Per pixel, the weights of the cell before, at and after its own under a Gaussian blur. */
function blurWeights(cuts: readonly number[], cells: Int32Array, sigma: number): Float64Array {
  const length = cells.length,
    count = cuts.length - 1;
  const weights = new Float64Array(length * BLUR_TAPS);
  for (let p = 0; p < length; p++) {
    const centre = p + HALF;
    let sum = 0;
    for (let d = -BLUR_REACH; d <= BLUR_REACH; d++) {
      const k = cells[p] + d;
      if (k < 0 || k >= count) continue;
      const w = below(cuts[k + 1], centre, sigma) - below(cuts[k], centre, sigma);
      weights[p * BLUR_TAPS + d + BLUR_REACH] = w;
      sum += w;
    }
    if (sum) for (let d = 0; d < BLUR_TAPS; d++) weights[p * BLUR_TAPS + d] /= sum;
  }
  return weights;
}

/** Per-cell sums the nearest and planar renderings share. */
interface CellMoments {
  counts: Float64Array;
  means: Float64Array;
  /** Residual of the flat cells. */
  flat: number;
  /** Residual each cell's best slope removes. */
  slopes: Float64Array;
}

function cellMoments(
  described: DescribedImage,
  cutsX: readonly number[],
  cutsY: readonly number[],
  columns: Int32Array,
  rows: Int32Array,
): CellMoments {
  const { content: image, lines, values } = described;
  const { width } = image;
  const across = cutsX.length - 1,
    cells = across * (cutsY.length - 1);
  const counts = new Float64Array(cells),
    sx = new Float64Array(cells),
    sy = new Float64Array(cells),
    sxx = new Float64Array(cells),
    syy = new Float64Array(cells),
    sxy = new Float64Array(cells),
    squares = new Float64Array(cells);
  const sv = new Float64Array(cells * CHANNELS),
    svx = new Float64Array(cells * CHANNELS),
    svy = new Float64Array(cells * CHANNELS);
  for (let r = 0; r < lines.length; r++) {
    const y = lines[r],
      j = rows[y],
      ly = y - cutsY[j];
    for (let x = 0; x < width; x++) {
      const i = columns[x],
        cell = j * across + i,
        lx = x - cutsX[i],
        v = (r * width + x) * CHANNELS;
      counts[cell]++;
      sx[cell] += lx;
      sy[cell] += ly;
      sxx[cell] += lx * lx;
      syy[cell] += ly * ly;
      sxy[cell] += lx * ly;
      for (let c = 0; c < CHANNELS; c++) {
        const value = values[v + c],
          k = cell * CHANNELS + c;
        sv[k] += value;
        svx[k] += value * lx;
        svy[k] += value * ly;
        squares[cell] += value * value;
      }
    }
  }
  const means = new Float64Array(cells * CHANNELS),
    slopes = new Float64Array(cells);
  let flat = 0;
  for (let cell = 0; cell < cells; cell++) {
    const n = counts[cell];
    if (!n) continue;
    const mxx = sxx[cell] - (sx[cell] * sx[cell]) / n,
      myy = syy[cell] - (sy[cell] * sy[cell]) / n,
      mxy = sxy[cell] - (sx[cell] * sy[cell]) / n;
    const det = mxx * myy - mxy * mxy;
    let residual = squares[cell],
      removed = 0;
    for (let c = 0; c < CHANNELS; c++) {
      const k = cell * CHANNELS + c,
        s = sv[k];
      means[k] = s / n;
      residual -= (s * s) / n;
      const gx = svx[k] - (sx[cell] * s) / n,
        gy = svy[k] - (sy[cell] * s) / n;
      if (det > SINGULAR && n >= MIN_PLANAR_AREA)
        removed += (myy * gx * gx - 2 * mxy * gx * gy + mxx * gy * gy) / det;
      else if (mxx > SINGULAR && n >= MIN_PLANAR_PIXELS) removed += (gx * gx) / mxx;
      else if (myy > SINGULAR && n >= MIN_PLANAR_PIXELS) removed += (gy * gy) / myy;
    }
    residual = Math.max(0, residual);
    flat += residual;
    slopes[cell] = Math.max(0, Math.min(removed, residual));
  }
  return { counts, means, flat, slopes };
}

/** Gram matrix of one axis's blend weights over the given positions: diagonal and next entry. */
function blendGram(axis: Centres, count: number, positions: ArrayLike<number>) {
  const diagonal = new Float64Array(count).fill(SINGULAR),
    next = new Float64Array(count);
  for (let k = 0; k < positions.length; k++) {
    const i = axis.lower[positions[k]],
      t = axis.weight[positions[k]];
    diagonal[i] += (1 - t) * (1 - t);
    if (i + 1 < count) {
      diagonal[i + 1] += t * t;
      next[i] += (1 - t) * t;
    }
  }
  return { diagonal, next };
}

/** Solves a symmetric tridiagonal system in place, on every `stride`th value from `base`. */
function solveTridiagonal(
  { diagonal, next }: { diagonal: Float64Array; next: Float64Array },
  values: Float64Array,
  base: number,
  stride: number,
  scratch: Float64Array,
) {
  const count = diagonal.length;
  let pivot = diagonal[0];
  scratch[0] = next[0] / pivot;
  values[base] /= pivot;
  for (let k = 1; k < count; k++) {
    pivot = diagonal[k] - next[k - 1] * scratch[k - 1];
    scratch[k] = next[k] / pivot;
    values[base + k * stride] =
      (values[base + k * stride] - next[k - 1] * values[base + (k - 1) * stride]) / pivot;
  }
  for (let k = count - 2; k >= 0; k--)
    values[base + k * stride] -= scratch[k] * values[base + (k + 1) * stride];
}

/**
 * Residual of the bilinear blend of the cell centres, with the centre colours that rebuild the
 * described pixels best. The blend is separable, so the least-squares colours solve one
 * tridiagonal system along each axis.
 */
function bilinearError(
  described: DescribedImage,
  cutsX: readonly number[],
  cutsY: readonly number[],
) {
  const { content: image, lines, values } = described;
  const { width, height } = image;
  const across = cutsX.length - 1,
    down = cutsY.length - 1;
  const cx = centres(cutsX, width),
    cy = centres(cutsY, height);
  const colours = new Float64Array(across * down * CHANNELS);
  const corners = new Int32Array(BILINEAR_CORNERS),
    shares = new Float64Array(BILINEAR_CORNERS);
  const blend = (y: number, x: number) => {
    const top = cy.lower[y] * across,
      bottom = Math.min(down - 1, cy.lower[y] + 1) * across,
      ty = cy.weight[y];
    const left = cx.lower[x],
      right = Math.min(across - 1, left + 1),
      tx = cx.weight[x];
    corners[0] = top + left;
    corners[1] = top + right;
    corners[2] = bottom + left;
    corners[3] = bottom + right;
    shares[0] = (1 - tx) * (1 - ty);
    shares[1] = tx * (1 - ty);
    shares[2] = (1 - tx) * ty;
    shares[3] = tx * ty;
  };
  for (let r = 0; r < lines.length; r++)
    for (let x = 0; x < width; x++) {
      blend(lines[r], x);
      const v = (r * width + x) * CHANNELS;
      for (let k = 0; k < BILINEAR_CORNERS; k++)
        for (let c = 0; c < CHANNELS; c++)
          colours[corners[k] * CHANNELS + c] += shares[k] * values[v + c];
    }
  const columns = Int32Array.from({ length: width }, (_, x) => x);
  const gramX = blendGram(cx, across, columns),
    gramY = blendGram(cy, down, lines);
  const scratch = new Float64Array(Math.max(across, down));
  for (let j = 0; j < down; j++)
    for (let c = 0; c < CHANNELS; c++)
      solveTridiagonal(gramX, colours, j * across * CHANNELS + c, CHANNELS, scratch);
  for (let i = 0; i < across; i++)
    for (let c = 0; c < CHANNELS; c++)
      solveTridiagonal(gramY, colours, i * CHANNELS + c, across * CHANNELS, scratch);
  let error = 0;
  for (let r = 0; r < lines.length; r++)
    for (let x = 0; x < width; x++) {
      blend(lines[r], x);
      const v = (r * width + x) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) {
        let rebuilt = 0;
        for (let k = 0; k < BILINEAR_CORNERS; k++)
          rebuilt += shares[k] * colours[corners[k] * CHANNELS + c];
        const difference = values[v + c] - rebuilt;
        error += difference * difference;
      }
    }
  return { error, colours };
}

/** Residual of the cell colours seen through a Gaussian of `sigma`, after deconvolution. */
function blurredError(
  described: DescribedImage,
  moments: CellMoments,
  cutsX: readonly number[],
  cutsY: readonly number[],
  columns: Int32Array,
  rows: Int32Array,
  sigma: number,
) {
  const { lines, values: pixels } = described;
  const width = columns.length;
  const across = cutsX.length - 1,
    down = cutsY.length - 1;
  const wx = blurWeights(cutsX, columns, sigma),
    wy = blurWeights(cutsY, rows, sigma);
  const colours = new Float64Array(moments.means);
  const correction = new Float64Array(colours.length);
  // One cell of zeros pads each end of a row's vertical blend.
  const blend = new Float64Array((across + 2 * BLUR_REACH) * CHANNELS);
  let error = 0;
  for (let step = 0; step <= DECONVOLUTION_STEPS; step++) {
    error = 0;
    correction.fill(0);
    for (let r = 0; r < lines.length; r++) {
      const y = lines[r],
        j = rows[y];
      blend.fill(0);
      for (let d = -BLUR_REACH; d <= BLUR_REACH; d++) {
        const w = wy[y * BLUR_TAPS + d + BLUR_REACH],
          jj = j + d;
        if (!w || jj < 0 || jj >= down) continue;
        for (let k = 0; k < across * CHANNELS; k++)
          blend[BLUR_REACH * CHANNELS + k] += w * colours[jj * across * CHANNELS + k];
      }
      for (let x = 0; x < width; x++) {
        const i = columns[x],
          v = (r * width + x) * CHANNELS,
          t = x * BLUR_TAPS;
        for (let c = 0; c < CHANNELS; c++) {
          let rebuilt = 0;
          for (let d = 0; d < BLUR_TAPS; d++) rebuilt += wx[t + d] * blend[(i + d) * CHANNELS + c];
          const difference = pixels[v + c] - rebuilt;
          error += difference * difference;
          correction[(j * across + i) * CHANNELS + c] += difference;
        }
      }
    }
    if (step === DECONVOLUTION_STEPS) break;
    for (let cell = 0; cell < across * down; cell++) {
      const n = moments.counts[cell];
      if (n)
        for (let c = 0; c < CHANNELS; c++)
          colours[cell * CHANNELS + c] += correction[cell * CHANNELS + c] / n;
    }
  }
  return { error, colours };
}

/** Description length per sample of the cell colours and residual, cheapest rendering first. */
function renderingLength(
  described: DescribedImage,
  cutsX: readonly number[],
  cutsY: readonly number[],
): number {
  const { content: image, samples, parameter } = described;
  const across = cutsX.length - 1,
    down = cutsY.length - 1;
  const columns = cellOf(cutsX, image.width),
    rows = cellOf(cutsY, image.height);
  const moments = cellMoments(described, cutsX, cutsY, columns, rows);
  let cells = 0;
  for (const count of moments.counts) if (count) cells++;
  const structure = cells * parameter * CELL_PARAMETERS;
  const length = (error: number, colours: Float64Array, extra = 0) => {
    const variance = error / samples + RESIDUAL_FLOOR;
    return (
      (samples / 2) * Math.log(variance) +
      colourCost(colours, moments.counts, across, down, variance) +
      structure +
      extra
    );
  };
  let best = length(moments.flat, moments.means);
  const bilinear = bilinearError(described, cutsX, cutsY);
  best = Math.min(best, length(bilinear.error, bilinear.colours));
  // A slope pays for itself where the residual it removes, at the flat cells' precision, beats
  // its parameters; every cell also says whether it carries one.
  const precision = 2 * (moments.flat / samples + RESIDUAL_FLOOR);
  const slopeCost = SLOPE_PARAMETERS * parameter;
  let planarError = moments.flat,
    planarCost = cells * Math.LN2;
  for (const removed of moments.slopes)
    if (removed / precision > slopeCost) {
      planarError -= removed;
      planarCost += slopeCost;
    }
  best = Math.min(best, length(planarError, moments.means, planarCost));
  const pitch = Math.min(image.width / across, image.height / down);
  for (const sigma of BLUR_WIDTHS) {
    if (sigma > MAX_BLUR_SHARE * pitch) break;
    const blurred = blurredError(described, moments, cutsX, cutsY, columns, rows, sigma);
    best = Math.min(best, length(blurred.error, blurred.colours, parameter));
  }
  return best / samples;
}

/** Description length per sample of the cuts alone. */
function cutLength(described: DescribedImage, cuts: GridCuts): number {
  const across = cuts.cutsX.length - 1,
    down = cuts.cutsY.length - 1;
  const lattice = LATTICE_CUT_PARAMETERS * described.parameter;
  let cost = lattice;
  switch (cuts.model) {
    case CutModel.Lattice:
      break;
    case CutModel.Snapped:
      cost +=
        SNAP_OFFSET_WEIGHT *
        ((across - 1) * Math.log(2 * (cuts.radiusX ?? 0) + 1) +
          (down - 1) * Math.log(2 * (cuts.radiusY ?? 0) + 1));
      break;
    case CutModel.Free:
      cost = MESH_CUT_PARAMETERS * described.parameter * (across + down - 2);
      break;
  }
  return cost / described.samples;
}

/** Description length per sample (pixel channel of a described row), in nats. */
export function descriptionLength(described: DescribedImage, cuts: GridCuts): number {
  const { content, left, top } = described;
  return (
    renderingLength(
      described,
      contentCuts(cuts.cutsX, left, content.width),
      contentCuts(cuts.cutsY, top, content.height),
    ) + cutLength(described, cuts)
  );
}

/**
 * Description length per sample of the image as it is: one cell per pixel, which rebuilds it
 * exactly, each pixel coded against its left or upper neighbour.
 */
export function pixelLength(described: DescribedImage): number {
  const { content: image, lines, values, samples, parameter } = described;
  const { width } = image;
  const variance = RESIDUAL_FLOOR;
  let colours = 0;
  for (let r = 0; r < lines.length; r++) {
    const above = r > 0 && lines[r - 1] === lines[r] - 1;
    for (let x = 0; x < width; x++) {
      const v = (r * width + x) * CHANNELS;
      let step = Infinity;
      const distance = (o: number) => {
        let sum = 0;
        for (let c = 0; c < CHANNELS; c++) sum += (values[v + c] - values[o + c]) ** 2;
        return sum;
      };
      if (x > 0) step = distance(v - CHANNELS);
      if (above) step = Math.min(step, distance(v - width * CHANNELS));
      if (!Number.isFinite(step)) {
        step = 0;
        for (let c = 0; c < CHANNELS; c++) step += values[v + c] ** 2;
      }
      colours += (CHANNELS / 2) * Math.log1p(step / (CHANNELS * variance));
    }
  }
  const cells = lines.length * width;
  return (
    ((samples / 2) * Math.log(variance) +
      colours +
      cells * parameter * CELL_PARAMETERS +
      LATTICE_CUT_PARAMETERS * parameter) /
    samples
  );
}
