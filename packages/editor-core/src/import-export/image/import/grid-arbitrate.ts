import type { PixelBuffer } from "$/base/primitives";
import { MAX_RECOVERED_GRID_SIZE, pixelGridCuts } from "$/import-export/image/import/grid";
import { snapLatticeCuts } from "$/import-export/image/import/grid-cut-snap";
import { CutModel, descriptionLength } from "$/import-export/image/import/grid-description-length";
import { mergeSlivers } from "$/import-export/image/import/grid-detect";
import { searchGridPitches } from "$/import-export/image/import/grid-pitch-search";
import { recoverGrid } from "$/import-export/image/import/grid-sample";
import {
  CellColorPicker,
  PixelationAlgorithm,
  type PixelGridAnalysis,
} from "$/import-export/image/import/types";

/**
 * Multi-hypothesis grid arbitration. The grids of every detector, plus on soft upscales the
 * pitch-search lattices and extra grids the caller proposes (e.g. edge detection on a sharpened
 * copy), compete on their description length of the input (see grid-description-length): no
 * signal reads a native size, a reference image or a label. Each lattice also competes with its
 * cuts snapped to the nearest edges, so a regular count can follow the cuts of the raster that
 * rounded it.
 *
 * The winner is the hypothesis with the shortest description length. Structurally valid soft
 * candidates (pitch-search lattices and proposals) are admitted to the ring after basic size
 * checks only, without quality gates. The arbiter measures phase contrast, purity, cycle
 * consistency, and boundary energy for diagnostics, but these do not exclude candidates from
 * description-length competition.
 */
const CHANNELS = 4;
const ALPHA_SCALE = 255;
const MAX_SAMPLED_LINES = 128;
const COARSE_SAMPLED_LINES = 32;
/** Relative pitch ranges (each side) of the coarse and fine sweeps, and their step count. */
const COARSE_PITCH_SPAN = 0.04;
const FINE_PITCH_SPAN = 0.006;
const PITCH_REFINE_STEPS = 6;
const COARSE_PHASES = 8;
/** Fine phase steps on each side of the coarse phase, within one coarse step. */
const FINE_PHASE_STEPS = 4;
/** Coarse-sweep phase contrast below which a pitch is dropped before the fine sweep. */
const SCREEN_CONTRAST = 0.1;
const HALF = 0.5;
const PURITY_BUDGET = 4096;
const CYCLE_ROWS = 160;
const BOUNDARY_LINES = 256;
/** Inverse golden ratio: a low-discrepancy row sequence that cannot alias with a pitch. */
const SEQUENCE_STEP = 0.6180339887498949;
const PURE_STDDEV = 22;
const CYCLE_ERROR_SCALE = 60;
const FLAT_ENERGY = 0.5;
const PURITY_WEIGHT = 0.35;
const CYCLE_WEIGHT = 0.5;
const BOUNDARY_WEIGHT = 0.15;
/**
 * Cells per axis a soft grid needs. With fewer, the phase contrast of large smooth features
 * (or waves) can line up with a lattice by chance. Raised to exclude spurious coarse grids
 * on gradients while admitting valid distorted pixel art (typically 50+ cells per axis).
 */
const MIN_CELLS = 30;
const MIN_PURITY = 0.5;
const MIN_CYCLE = 0.75;
export const MIN_PHASE_CONTRAST = 0.2;
/**
 * Diagnostic floor for scoreHypothesis. No longer used as an admission gate for soft candidates
 * entering the description-length ring.
 */
export const ARBITER_FLOOR = 0.3;

/** Prefix sums (premultiplied R, G, B and their summed squares) along sampled lines of one axis. */
interface AxisSamples {
  length: number;
  lines: number;
  prefix: Float64Array;
}

function axisSamples(image: PixelBuffer, horizontal: boolean, maxLines: number): AxisSamples {
  const { width, height, data } = image;
  const length = horizontal ? width : height;
  const cross = horizontal ? height : width;
  const stride = Math.max(1, Math.floor(cross / maxLines));
  const lines = Math.ceil(cross / stride);
  const row = (length + 1) * CHANNELS;
  const prefix = new Float64Array(lines * row);
  for (let line = 0; line < lines; line++) {
    const at = line * stride;
    let r = 0,
      g = 0,
      b = 0,
      squares = 0;
    for (let i = 0; i < length; i++) {
      const o = (horizontal ? at * width + i : i * width + at) * CHANNELS;
      const alpha = data[o + 3] / ALPHA_SCALE;
      const pr = data[o] * alpha,
        pg = data[o + 1] * alpha,
        pb = data[o + 2] * alpha;
      r += pr;
      g += pg;
      b += pb;
      squares += pr * pr + pg * pg + pb * pb;
      const p = line * row + (i + 1) * CHANNELS;
      prefix[p] = r;
      prefix[p + 1] = g;
      prefix[p + 2] = b;
      prefix[p + 3] = squares;
    }
  }
  return { length, lines, prefix };
}

/** Mean squared within-segment residual along the sampled lines when the axis is cut at `cuts`. */
function lineResidual(samples: AxisSamples, cuts: readonly number[]): number {
  const { length, lines, prefix } = samples;
  const row = (length + 1) * CHANNELS;
  let total = 0;
  for (let line = 0; line < lines; line++) {
    const base = line * row;
    for (let s = 0; s + 1 < cuts.length; s++) {
      const a = base + cuts[s] * CHANNELS,
        b = base + cuts[s + 1] * CHANNELS;
      const n = cuts[s + 1] - cuts[s];
      if (n <= 0) continue;
      const r = prefix[b] - prefix[a],
        g = prefix[b + 1] - prefix[a + 1],
        bl = prefix[b + 2] - prefix[a + 2];
      total += prefix[b + 3] - prefix[a + 3] - (r * r + g * g + bl * bl) / n;
    }
  }
  return Math.max(0, total / (lines * length));
}

function latticeCuts(length: number, pitch: number, phase: number): number[] {
  const wrapped = ((phase % pitch) + pitch) % pitch;
  return mergeSlivers(pixelGridCuts(length, pitch, wrapped), pitch);
}

/** Interior cuts moved by `delta`, kept strictly increasing inside (0, length). */
function shiftCuts(cuts: readonly number[], length: number, delta: number): number[] {
  const shifted = [0];
  for (let i = 1; i < cuts.length - 1; i++) {
    const cut = Math.round(cuts[i] + delta);
    if (cut > shifted[shifted.length - 1] && cut < length) shifted.push(cut);
  }
  shifted.push(length);
  return shifted;
}

/** 1 - residual / residual-half-a-cell-off: near 0 when the content ignores the cuts. */
function phaseContrast(samples: AxisSamples, cuts: readonly number[]): number {
  const cells = cuts.length - 1;
  if (cells < 2) return 0;
  const pitch = samples.length / cells;
  const aligned = lineResidual(samples, cuts);
  const off = lineResidual(samples, shiftCuts(cuts, samples.length, pitch * HALF));
  return off > 0 ? Math.max(0, 1 - aligned / off) : 0;
}

interface AxisFit {
  pitch: number;
  phase: number;
  cuts: number[];
}

/** Both sample densities of one axis: sparse lines for the coarse sweep, dense for the rest. */
interface Axis {
  coarse: AxisSamples;
  fine: AxisSamples;
}

function sweep(
  samples: AxisSamples,
  pitches: readonly number[],
  phasesOf: (pitch: number) => readonly number[],
): AxisFit {
  let best = { pitch: pitches[0], phase: 0, cuts: [0, samples.length], residual: Infinity };
  for (const pitch of pitches)
    for (const phase of phasesOf(pitch)) {
      const cuts = latticeCuts(samples.length, pitch, phase);
      const residual = lineResidual(samples, cuts);
      if (residual < best.residual) best = { pitch, phase, cuts, residual };
    }
  return best;
}

const around = (centre: number, span: number) =>
  Array.from(
    { length: 2 * PITCH_REFINE_STEPS + 1 },
    (_, i) => centre * (1 + ((i - PITCH_REFINE_STEPS) * span) / PITCH_REFINE_STEPS),
  );

/**
 * The pitch (near the proposal) and phase whose cuts leave the least within-cell residual: a
 * coarse sweep on sparse lines, then a fine one around its best on dense lines, so a pitch
 * derived from a multiple still locks. The fine sweep is skipped when the coarse lattice shows
 * low phase contrast (an efficiency optimization for photos), but the coarse fit is still
 * returned so it can compete on description length.
 */
function fitAxis(axis: Axis, proposed: number): AxisFit | null {
  const coarseStep = (pitch: number) =>
    pitch / Math.min(COARSE_PHASES, Math.max(2, Math.ceil(pitch)));
  const coarse = sweep(axis.coarse, around(proposed, COARSE_PITCH_SPAN), (pitch) =>
    Array.from({ length: Math.round(pitch / coarseStep(pitch)) }, (_, k) => k * coarseStep(pitch)),
  );
  if (phaseContrast(axis.coarse, coarse.cuts) < SCREEN_CONTRAST) return coarse;
  const step = coarseStep(coarse.pitch) / FINE_PHASE_STEPS;
  return sweep(axis.fine, around(coarse.pitch, FINE_PITCH_SPAN), () =>
    Array.from(
      { length: 2 * FINE_PHASE_STEPS + 1 },
      (_, k) => coarse.phase + (k - FINE_PHASE_STEPS) * step,
    ),
  );
}

const sequence = (count: number, length: number): number[] =>
  Array.from({ length: Math.min(count, length) }, (_, k) =>
    Math.floor(((k * SEQUENCE_STEP) % 1) * length),
  );

/** Share of (sampled) cells whose RGB standard deviation stays under PURE_STDDEV. */
function cellPurity(
  image: PixelBuffer,
  cutsX: readonly number[],
  cutsY: readonly number[],
): number {
  const columns = cutsX.length - 1,
    rows = cutsY.length - 1;
  const stride = Math.max(1, Math.ceil((columns * rows) / PURITY_BUDGET));
  let pure = 0,
    measured = 0;
  for (let cell = 0; cell < columns * rows; cell += stride) {
    const cx = cell % columns,
      cy = Math.floor(cell / columns);
    let r = 0,
      g = 0,
      b = 0,
      squares = 0,
      n = 0;
    for (let y = cutsY[cy]; y < cutsY[cy + 1]; y++)
      for (let x = cutsX[cx]; x < cutsX[cx + 1]; x++) {
        const o = (y * image.width + x) * CHANNELS;
        const alpha = image.data[o + 3] / ALPHA_SCALE;
        const pr = image.data[o] * alpha,
          pg = image.data[o + 1] * alpha,
          pb = image.data[o + 2] * alpha;
        r += pr;
        g += pg;
        b += pb;
        squares += pr * pr + pg * pg + pb * pb;
        n++;
      }
    if (!n) continue;
    const variance = (squares - (r * r + g * g + b * b) / n) / (n * 3);
    measured++;
    if (Math.sqrt(Math.max(0, variance)) < PURE_STDDEV) pure++;
  }
  return measured ? pure / measured : 0;
}

function cellIndex(cuts: readonly number[], length: number): Int32Array {
  const index = new Int32Array(length);
  for (let cell = 0; cell + 1 < cuts.length; cell++) index.fill(cell, cuts[cell], cuts[cell + 1]);
  return index;
}

/** 1 - mean RGB error / CYCLE_ERROR_SCALE between the input and the recovery repainted by cuts. */
function cycleConsistency(
  input: PixelBuffer,
  recovered: PixelBuffer,
  cutsX: readonly number[],
  cutsY: readonly number[],
): number {
  const column = cellIndex(cutsX, input.width),
    row = cellIndex(cutsY, input.height);
  let error = 0,
    count = 0;
  for (const y of sequence(CYCLE_ROWS, input.height))
    for (let x = 0; x < input.width; x++) {
      const o = (y * input.width + x) * CHANNELS;
      const r = (row[y] * recovered.width + column[x]) * CHANNELS;
      const a = input.data[o + 3] / ALPHA_SCALE,
        ra = recovered.data[r + 3] / ALPHA_SCALE;
      let squares = 0;
      for (let c = 0; c < 3; c++)
        squares += (input.data[o + c] * a - recovered.data[r + c] * ra) ** 2;
      error += Math.sqrt(squares / 3);
      count++;
    }
  return count ? Math.max(0, 1 - error / count / CYCLE_ERROR_SCALE) : 0;
}

/** Mean colour step on the cuts against the mean step at cell middles, as a 0..1 share. */
function boundaryEnergy(
  image: PixelBuffer,
  cutsX: readonly number[],
  cutsY: readonly number[],
): number {
  const { width, height, data } = image;
  const step = (a: number, b: number) =>
    Math.abs(data[a] - data[b]) +
    Math.abs(data[a + 1] - data[b + 1]) +
    Math.abs(data[a + 2] - data[b + 2]);
  const along = (cuts: readonly number[], horizontal: boolean) => {
    const cross = horizontal ? height : width;
    const length = horizontal ? width : height;
    const lines = sequence(BOUNDARY_LINES, cross);
    const at = (i: number, line: number) =>
      (horizontal ? line * width + i : i * width + line) * CHANNELS;
    let cut = 0,
      mid = 0,
      cutCount = 0,
      midCount = 0;
    for (let c = 0; c + 1 < cuts.length; c++) {
      const middle = Math.floor((cuts[c] + cuts[c + 1]) / 2);
      for (const line of lines) {
        if (c > 0 && cuts[c] >= 1 && cuts[c] < length) {
          cut += step(at(cuts[c], line), at(cuts[c] - 1, line));
          cutCount++;
        }
        if (middle >= 1 && middle < length) {
          mid += step(at(middle, line), at(middle - 1, line));
          midCount++;
        }
      }
    }
    return {
      cut: cutCount ? cut / cutCount : 0,
      mid: midCount ? mid / midCount : 0,
    };
  };
  const x = along(cutsX, true),
    y = along(cutsY, false);
  const cut = (x.cut + y.cut) / 2,
    mid = (x.mid + y.mid) / 2;
  if (cut + mid < FLAT_ENERGY) return HALF;
  return Math.min(1, cut / (cut + mid));
}

export interface ScoredHypothesis {
  /** The hypothesis with its cuts and cell counts filled in. */
  grid: PixelGridAnalysis;
  recovered: PixelBuffer;
  /**
   * Weighted score, 0 when a gate (purity, cycle, phase contrast) rejects the hypothesis.
   * Used for diagnostics and the `scoreHypothesis` export; not as an admission filter.
   */
  score: number;
  purity: number;
  cycle: number;
  boundary: number;
  contrast: number;
}

interface ArbiterContext {
  image: PixelBuffer;
  x: Axis;
  y: Axis;
}

const axisOf = (image: PixelBuffer, horizontal: boolean): Axis => ({
  coarse: axisSamples(image, horizontal, COARSE_SAMPLED_LINES),
  fine: axisSamples(image, horizontal, MAX_SAMPLED_LINES),
});

function contextOf(image: PixelBuffer): ArbiterContext {
  return { image, x: axisOf(image, true), y: axisOf(image, false) };
}

function cutsOf(image: PixelBuffer, grid: PixelGridAnalysis) {
  return {
    cutsX: [...(grid.cutsX ?? pixelGridCuts(image.width, grid.cellWidth, grid.offsetX))],
    cutsY: [...(grid.cutsY ?? pixelGridCuts(image.height, grid.cellHeight, grid.offsetY))],
  };
}

const rejected = (grid: PixelGridAnalysis): ScoredHypothesis => ({
  grid,
  recovered: { width: 1, height: 1, data: new Uint8ClampedArray(CHANNELS) },
  score: 0,
  purity: 0,
  cycle: 0,
  boundary: 0,
  contrast: 0,
});

/** `full` measures every signal even when the cell count or the null test already rejects the grid. */
function score(context: ArbiterContext, grid: PixelGridAnalysis, full = false): ScoredHypothesis {
  const { image } = context;
  const { cutsX, cutsY } = cutsOf(image, grid);
  const columns = cutsX.length - 1,
    rows = cutsY.length - 1;
  const located = { ...grid, width: columns, height: rows, cutsX, cutsY };
  const enough = columns >= MIN_CELLS && rows >= MIN_CELLS;
  if (
    columns < 2 ||
    rows < 2 ||
    columns > MAX_RECOVERED_GRID_SIZE ||
    rows > MAX_RECOVERED_GRID_SIZE ||
    (!full && !enough)
  )
    return rejected(located);
  const contrast = Math.min(
    phaseContrast(context.x.fine, cutsX),
    phaseContrast(context.y.fine, cutsY),
  );
  // The null test is cheap; a grid the content ignores is not worth recovering.
  if (!full && contrast < MIN_PHASE_CONTRAST) return { ...rejected(located), contrast };
  const recovered = recoverGrid(image, located, CellColorPicker.Median);
  const purity = cellPurity(image, cutsX, cutsY);
  const cycle = cycleConsistency(image, recovered, cutsX, cutsY);
  const boundary = boundaryEnergy(image, cutsX, cutsY);
  const accepted =
    enough && purity >= MIN_PURITY && cycle >= MIN_CYCLE && contrast >= MIN_PHASE_CONTRAST;
  const weighted = PURITY_WEIGHT * purity + CYCLE_WEIGHT * cycle + BOUNDARY_WEIGHT * boundary;
  const score = accepted ? weighted : 0;
  return {
    grid: located,
    recovered,
    score,
    purity,
    cycle,
    boundary,
    contrast,
  };
}

/** Score one grid on the input image; exported for tests and diagnostics. */
export function scoreHypothesis(image: PixelBuffer, grid: PixelGridAnalysis): ScoredHypothesis {
  return score(contextOf(image), grid, true);
}

/** Uniform lattices for every proposed pitch, each with its own refined pitch and phase per axis. */
function pitchHypotheses(context: ArbiterContext): PixelGridAnalysis[] {
  const lattices: PixelGridAnalysis[] = [];
  for (const { pitch, strength } of searchGridPitches(context.image)) {
    const x = fitAxis(context.x, pitch);
    const y = x && fitAxis(context.y, pitch);
    if (!x || !y) continue;
    lattices.push({
      width: x.cuts.length - 1,
      height: y.cuts.length - 1,
      cellWidth: x.pitch,
      cellHeight: y.pitch,
      offsetX: ((x.phase % x.pitch) + x.pitch) % x.pitch,
      offsetY: ((y.phase % y.pitch) + y.pitch) % y.pitch,
      cutsX: x.cuts,
      cutsY: y.cuts,
      confidence: strength,
      reliable: true,
      algorithm: PixelationAlgorithm.UniformGrid,
    });
  }
  return lattices;
}

/** Extra hypotheses, computed only when the image shows a periodic structure at all. */
export type GridProposals = () => readonly PixelGridAnalysis[];

export interface ArbitratedGrid {
  grid: PixelGridAnalysis;
  /** Description length per sample, in nats; lower is better. */
  length: number;
}

/** The hypothesis as cut, and for a lattice also with its cuts snapped to the nearest edges. */
function readings(image: PixelBuffer, grid: PixelGridAnalysis): ArbitratedGrid[] {
  const { cutsX, cutsY } = cutsOf(image, grid);
  const columns = cutsX.length - 1,
    rows = cutsY.length - 1;
  if (Math.min(columns, rows) < 2 || Math.max(columns, rows) > MAX_RECOVERED_GRID_SIZE) return [];
  const located = { ...grid, width: columns, height: rows, cutsX, cutsY };
  if (grid.algorithm === PixelationAlgorithm.EdgeGrid)
    return [{ grid, length: descriptionLength(image, { cutsX, cutsY, model: CutModel.Free }) }];
  const snapped = snapLatticeCuts(image, cutsX, cutsY);
  return [
    { grid, length: descriptionLength(image, { cutsX, cutsY, model: CutModel.Lattice }) },
    {
      grid: { ...located, cutsX: snapped.x.cuts, cutsY: snapped.y.cuts },
      length: descriptionLength(image, {
        cutsX: snapped.x.cuts,
        cutsY: snapped.y.cuts,
        model: CutModel.Snapped,
        radiusX: snapped.x.radius,
        radiusY: snapped.y.radius,
      }),
    },
  ];
}

/**
 * The ring: every hypothesis in `grids` competes on its description length of the input,
 * whatever detector proposed it, and the shortest wins. When `grids` is empty and `soft` is
 * given, the ring holds the pitch-search lattices and the `soft` proposals. Structurally valid
 * soft candidates (basic size checks only) are admitted without quality gates, and a passthrough
 * baseline (1×1 grid at original size) is added so garbage lattices compete against keeping the
 * image unchanged. The winner is decided purely by description length. Null when the passthrough
 * wins or the ring stays empty. A winner from `grids` keeps its detector's confidence; any other
 * carries a score computed for diagnostics.
 */
export function arbitrateGrids(
  image: PixelBuffer,
  grids: readonly PixelGridAnalysis[],
  soft?: GridProposals,
): ArbitratedGrid | null {
  const hypotheses = [...grids];
  let passthroughLength: number | null = null;
  if (soft && !grids.length) {
    const context = contextOf(image);
    const lattices = pitchHypotheses(context);
    if (lattices.length) {
      const passthrough: PixelGridAnalysis = {
        width: 1,
        height: 1,
        cellWidth: image.width,
        cellHeight: image.height,
        offsetX: 0,
        offsetY: 0,
        confidence: 0,
        reliable: false,
        algorithm: PixelationAlgorithm.UniformGrid,
      };
      passthroughLength = readings(image, passthrough)[0]?.length ?? Infinity;
      for (const grid of [...lattices, ...soft()]) {
        const { cutsX, cutsY } = cutsOf(image, grid);
        const columns = cutsX.length - 1,
          rows = cutsY.length - 1;
        if (
          columns >= MIN_CELLS &&
          rows >= MIN_CELLS &&
          columns <= MAX_RECOVERED_GRID_SIZE &&
          rows <= MAX_RECOVERED_GRID_SIZE
        ) {
          const scored = score(context, grid);
          hypotheses.push({ ...scored.grid, confidence: scored.score, reliable: true });
        }
      }
    }
  }
  let best: ArbitratedGrid | null = null;
  for (const grid of hypotheses)
    for (const reading of readings(image, grid))
      if (!best || reading.length < best.length) best = reading;
  if (passthroughLength !== null && (!best || best.length >= passthroughLength)) return null;
  return best;
}

/** The pitch-search lattices alone, before scoring; exported for diagnostics. */
export function pitchSearchGrids(image: PixelBuffer): PixelGridAnalysis[] {
  return pitchHypotheses(contextOf(image));
}
