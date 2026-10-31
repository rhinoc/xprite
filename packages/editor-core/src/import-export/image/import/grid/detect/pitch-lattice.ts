import type { PixelBuffer } from "$/base/primitives";
import { mergeSlivers } from "$/import-export/image/import/grid/detect/detect";
import { searchGridPitches } from "$/import-export/image/import/grid/detect/pitch-search";
import { pixelGridCuts } from "$/import-export/image/import/grid/lattice";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

/**
 * Uniform lattices for the pitches the pitch search proposes: per axis, the pitch near the
 * proposal and the phase whose cuts leave the least within-cell residual along sampled lines.
 * A coarse sweep on sparse lines comes first, then a fine one around its best on dense lines, so
 * a pitch derived from a multiple still locks.
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
/**
 * Residual drop against the lattice shifted by half a cell below which the coarse fit is not
 * refined: content that ignores the cuts (photos) has the same residual at every phase.
 */
const SCREEN_CONTRAST = 0.1;
const HALF = 0.5;
/** Bound the interval lookup tables to eight MiB per sampled axis. */
const INTERVAL_CACHE_VALUES = 1 << 20;
const REMAINDER_ERROR_BUDGET = 1 / 8;
const REMAINDER_ROUNDING_FACTOR = 4;
const REMAINDER_ROUNDING_OPERATIONS = 8;
const REMAINDER_MIN_SCALE = 1;
const REMAINDER_MAX_SCALE = Number.MAX_VALUE / 16;

interface IntervalResiduals {
  values: Float64Array;
  /** Bounds include zero, including the unpopulated end of each lookup row. */
  minimum: number;
  maximumAbsolute: number;
}

/** Prefix sums (premultiplied R, G, B and their summed squares) along sampled lines of one axis. */
interface AxisSamples {
  length: number;
  lines: number;
  prefix: Float64Array;
  /** Rounded pitch/phase proposals often produce the same integer cuts. */
  residuals: Map<string, number>;
  intervals: Map<number, IntervalResiduals>;
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
  return { length, lines, prefix, residuals: new Map(), intervals: new Map() };
}

/** Each interval keeps the same arithmetic as the direct residual, including summation order. */
function intervalResiduals(samples: AxisSamples, size: number): IntervalResiduals | undefined {
  if (size <= 0) return undefined;
  const { length, lines, prefix, intervals } = samples;
  const cached = intervals.get(size);
  if (cached) return cached;
  const values = length * lines;
  if ((intervals.size + 1) * values > INTERVAL_CACHE_VALUES) return undefined;
  const residuals = new Float64Array(values);
  const row = (length + 1) * CHANNELS;
  let minimum = 0,
    maximumAbsolute = 0;
  for (let line = 0; line < lines; line++) {
    const base = line * row;
    for (let start = 0; start + size <= length; start++) {
      const a = base + start * CHANNELS,
        b = a + size * CHANNELS;
      const r = prefix[b] - prefix[a],
        g = prefix[b + 1] - prefix[a + 1],
        bl = prefix[b + 2] - prefix[a + 2];
      const value = prefix[b + 3] - prefix[a + 3] - (r * r + g * g + bl * bl) / size;
      residuals[line * length + start] = value;
      minimum = Math.min(minimum, value);
      maximumAbsolute = Math.max(maximumAbsolute, Math.abs(value));
    }
  }
  const table = { values: residuals, minimum, maximumAbsolute };
  intervals.set(size, table);
  return table;
}

/**
 * Bound the exact continuation of the original left-to-right floating-point accumulation.
 * With n remaining stored-double terms v, m <= v and |v| <= M, the real continuation is
 * at least partial + n*m. Its IEEE addition error is bounded by gamma_n*(|partial| + n*M),
 * gamma_n = n*u/(1-n*u), u = EPSILON/2. The guard below is deliberately larger: when
 * n*EPSILON <= 1/8, 4*(n+8)*EPSILON*scale covers gamma_n as well as rounding in the
 * products, scale, guard and subtraction. Restricting scale >= 1 also makes this margin
 * larger than all possible subnormal roundoff across these additions. Unsafe bounds decline.
 *
 * Division by a positive denominator is monotonic, including its IEEE rounding, so comparing
 * this lower bound after division preserves the original sweep's strict less-than decision.
 */
function cannotImprove(
  partial: number,
  remaining: number,
  minimum: number,
  maximumAbsolute: number,
  denominator: number,
  ceiling: number,
): boolean {
  if (!Number.isFinite(ceiling) || ceiling < 0) return false;
  if (remaining * Number.EPSILON > REMAINDER_ERROR_BUDGET) return false;
  const scale = Math.abs(partial) + remaining * maximumAbsolute;
  if (!Number.isFinite(scale) || scale < REMAINDER_MIN_SCALE || scale > REMAINDER_MAX_SCALE)
    return false;
  const guard =
    REMAINDER_ROUNDING_FACTOR *
    (remaining + REMAINDER_ROUNDING_OPERATIONS) *
    Number.EPSILON *
    scale;
  const lower = partial + remaining * minimum - guard;
  return Number.isFinite(lower) && lower / denominator > ceiling;
}

/** A sweep may stop a proven loser; only complete, exact residuals enter the shared cache. */
function lineResidual(samples: AxisSamples, cuts: readonly number[], ceiling = Infinity): number {
  const { length, lines, prefix, residuals } = samples;
  const key = cuts.join(",");
  const cached = residuals.get(key);
  if (cached !== undefined) return cached;
  const segments = cuts.length - 1;
  const intervals: (Float64Array | undefined)[] = [];
  const starts = new Int32Array(segments),
    ends = new Int32Array(segments),
    sizes = new Int32Array(segments);
  let allCached = true,
    minimum = 0,
    maximumAbsolute = 0;
  for (let segment = 0; segment < segments; segment++) {
    starts[segment] = cuts[segment] * CHANNELS;
    ends[segment] = cuts[segment + 1] * CHANNELS;
    sizes[segment] = cuts[segment + 1] - cuts[segment];
    const table = intervalResiduals(samples, sizes[segment]);
    intervals.push(table?.values);
    if (!table) allCached = false;
    else {
      minimum = Math.min(minimum, table.minimum);
      maximumAbsolute = Math.max(maximumAbsolute, table.maximumAbsolute);
    }
  }
  let total = 0;
  if (allCached) {
    // Most sweeps use only cached segment sizes. Resolve the cache branch once per proposal.
    for (let line = 0; line < lines; line++) {
      const base = line * length;
      for (let segment = 0; segment < segments; segment++)
        total += intervals[segment]![base + cuts[segment]];
      const remaining = (lines - line - 1) * segments;
      if (
        remaining > 0 &&
        cannotImprove(total, remaining, minimum, maximumAbsolute, lines * length, ceiling)
      )
        return Infinity;
    }
  } else {
    const row = (length + 1) * CHANNELS;
    for (let line = 0; line < lines; line++) {
      const base = line * row,
        cachedBase = line * length;
      for (let segment = 0; segment < segments; segment++) {
        const interval = intervals[segment];
        if (interval) {
          total += interval[cachedBase + cuts[segment]];
          continue;
        }
        const n = sizes[segment];
        if (n <= 0) continue;
        const a = base + starts[segment],
          b = base + ends[segment];
        const r = prefix[b] - prefix[a],
          g = prefix[b + 1] - prefix[a + 1],
          bl = prefix[b + 2] - prefix[a + 2];
        total += prefix[b + 3] - prefix[a + 3] - (r * r + g * g + bl * bl) / n;
      }
    }
  }
  const residual = Math.max(0, total / (lines * length));
  residuals.set(key, residual);
  return residual;
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
      const residual = lineResidual(samples, cuts, best.residual);
      if (residual < best.residual) best = { pitch, phase, cuts, residual };
    }
  return best;
}

const around = (centre: number, span: number) =>
  Array.from(
    { length: 2 * PITCH_REFINE_STEPS + 1 },
    (_, i) => centre * (1 + ((i - PITCH_REFINE_STEPS) * span) / PITCH_REFINE_STEPS),
  );

function fitAxis(axis: Axis, proposed: number): AxisFit | null {
  const coarseStep = (pitch: number) =>
    pitch / Math.min(COARSE_PHASES, Math.max(2, Math.ceil(pitch)));
  const coarse = sweep(axis.coarse, around(proposed, COARSE_PITCH_SPAN), (pitch) =>
    Array.from({ length: Math.round(pitch / coarseStep(pitch)) }, (_, k) => k * coarseStep(pitch)),
  );
  if (phaseContrast(axis.coarse, coarse.cuts) < SCREEN_CONTRAST) return null;
  const step = coarseStep(coarse.pitch) / FINE_PHASE_STEPS;
  return sweep(axis.fine, around(coarse.pitch, FINE_PITCH_SPAN), () =>
    Array.from(
      { length: 2 * FINE_PHASE_STEPS + 1 },
      (_, k) => coarse.phase + (k - FINE_PHASE_STEPS) * step,
    ),
  );
}

const axisOf = (image: PixelBuffer, horizontal: boolean): Axis => ({
  coarse: axisSamples(image, horizontal, COARSE_SAMPLED_LINES),
  fine: axisSamples(image, horizontal, MAX_SAMPLED_LINES),
});

/** One lattice per proposed pitch, each with its own refined pitch and phase per axis. */
export function pitchLattices(image: PixelBuffer): PixelGridAnalysis[] {
  const pitches = searchGridPitches(image);
  if (!pitches.length) return [];
  const across = axisOf(image, true),
    down = axisOf(image, false);
  const lattices: PixelGridAnalysis[] = [];
  for (const { pitch } of pitches) {
    const x = fitAxis(across, pitch);
    const y = x && fitAxis(down, pitch);
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
      confidence: 0,
      reliable: true,
      algorithm: PixelationAlgorithm.UniformGrid,
    });
  }
  return lattices;
}
