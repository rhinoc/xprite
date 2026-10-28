import type { PixelBuffer } from "$/base/primitives";
import { RESIDUAL_FLOOR } from "$/import-export/image/import/grid-description-length";

/**
 * Strip shifts of a grid. Every strip of cells (a row of cells for the column cuts, a column of
 * cells for the row cuts) may move the cuts across it by whole pixels, within half a cell, as a
 * warped, sheared or row-jittered upscale displaces them. Each strip takes the shift that leaves
 * the least variance inside its cells, and moving every strip back by its shift straightens the
 * grid. The column cuts are settled first, the row cuts then on the straightened columns.
 *
 * The same search with every strip confined to the anti-phase of its shift (a quarter to three
 * quarters of a cell away) straightens the twin. Because every strip picks its shift from the
 * image, the search finds some phase evidence on any content; `chanceEvidence` measures how much
 * at pitches the grid does not have.
 */
const STRIDE = 4;
const CHANNELS = 3;
const ALPHA_SCALE = 255;
/** The anti-phase window of a shift, in cells. */
const ANTI_PHASE_FROM = 0.25;
const ANTI_PHASE_TO = 0.75;
const HALF = 0.5;
/**
 * Pitch factors at which the chance evidence is measured: a quarter octave either side, clear of
 * the grid's octaves and of its neighbouring cell counts.
 */
const OFF_PITCH_FACTORS = [2 ** 0.25, 2 ** -0.25] as const;
/** Cells and pixels per cell an off-pitch lattice needs to be searched. */
const MIN_OFF_PITCH_CELLS = 3;
const MIN_OFF_PITCH = 1.5;
const TIE = 1e-9;

/** Per line, prefix sums along it of the premultiplied colour and of its squared norm. */
export interface LinePrefix {
  length: number;
  lines: number;
  sums: Float64Array;
}

function linePrefix(image: PixelBuffer, vertical: boolean): LinePrefix {
  const { width, height, data } = image;
  const length = vertical ? height : width,
    lines = vertical ? width : height;
  const sums = new Float64Array(lines * (length + 1) * (CHANNELS + 1));
  for (let line = 0; line < lines; line++) {
    const base = line * (length + 1) * (CHANNELS + 1);
    for (let p = 0; p < length; p++) {
      const o = (vertical ? p * width + line : line * width + p) * STRIDE;
      const alpha = data[o + CHANNELS] / ALPHA_SCALE;
      const at = base + (p + 1) * (CHANNELS + 1),
        previous = base + p * (CHANNELS + 1);
      let square = 0;
      for (let c = 0; c < CHANNELS; c++) {
        const value = data[o + c] * alpha;
        sums[at + c] = sums[previous + c] + value;
        square += value * value;
      }
      sums[at + CHANNELS] = sums[previous + CHANNELS] + square;
    }
  }
  return { length, lines, sums };
}

/** The image's line prefixes along each axis, computed once for every grid read on it. */
export class StripImage {
  private readonly prefixes: (LinePrefix | null)[] = [null, null];

  constructor(readonly image: PixelBuffer) {}

  prefix(vertical: boolean): LinePrefix {
    const axis = Number(vertical);
    return (this.prefixes[axis] ??= linePrefix(this.image, vertical));
  }
}

/** Squared deviation from their mean of the pixels [from, to) of one line. */
function intervalEnergy(sums: Float64Array, base: number, from: number, to: number) {
  if (to <= from) return 0;
  const count = to - from;
  let energy =
    sums[base + to * (CHANNELS + 1) + CHANNELS] - sums[base + from * (CHANNELS + 1) + CHANNELS];
  for (let c = 0; c < CHANNELS; c++) {
    const sum = sums[base + to * (CHANNELS + 1) + c] - sums[base + from * (CHANNELS + 1) + c];
    energy -= (sum * sum) / count;
  }
  return energy;
}

interface StripShifts {
  shifts: number[];
  /** Variance left inside the cells, summed over every pixel and channel. */
  energy: number;
  /** Shifts a strip chooses among. */
  options: number;
}

const pitchOf = (cuts: readonly number[]) => (cuts[cuts.length - 1] - cuts[0]) / (cuts.length - 1);

/**
 * For each strip of lines between consecutive `across` cuts, the shift of the inner `cuts` that
 * leaves the least energy inside the cells. With `anchor`, each strip's shift is confined to the
 * anti-phase window of the anchor's.
 */
function stripShifts(
  prefix: LinePrefix,
  cuts: readonly number[],
  across: readonly number[],
  anchor?: readonly number[],
): StripShifts {
  const { length, sums } = prefix;
  const cells = cuts.length - 1;
  const pitch = pitchOf(cuts);
  const low = -Math.floor((pitch - 1) * HALF),
    high = Math.floor(pitch * HALF);
  const shifts: number[] = [];
  let energy = 0;
  for (let k = 0; k + 1 < across.length; k++) {
    const from = anchor ? Math.ceil(anchor[k] + ANTI_PHASE_FROM * pitch) : low,
      to = anchor ? Math.floor(anchor[k] + ANTI_PHASE_TO * pitch) : high;
    let best = from,
      least = Infinity;
    for (let shift = from; shift <= to; shift++) {
      let sum = 0;
      for (let line = across[k]; line < across[k + 1]; line++) {
        const base = line * (length + 1) * (CHANNELS + 1);
        let previous = 0;
        for (let i = 1; i <= cells; i++) {
          const at = i === cells ? length : Math.max(0, Math.min(length, cuts[i] + shift));
          sum += intervalEnergy(sums, base, previous, Math.max(previous, at));
          previous = Math.max(previous, at);
        }
      }
      const nearer = !anchor && Math.abs(shift) < Math.abs(best);
      if (sum < least - TIE || (sum <= least + TIE && nearer)) {
        best = shift;
        least = sum;
      }
    }
    shifts.push(best);
    energy += least;
  }
  return { shifts, energy, options: high - low + 1 };
}

/** The image with each strip moved back by its shift: out(p) = in(p + shift). */
function unshear(
  image: PixelBuffer,
  vertical: boolean,
  across: readonly number[],
  shifts: readonly number[],
): PixelBuffer {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  const length = vertical ? height : width;
  for (let k = 0; k + 1 < across.length; k++)
    for (let line = across[k]; line < across[k + 1]; line++)
      for (let p = 0; p < length; p++) {
        const source = Math.max(0, Math.min(length - 1, p + shifts[k]));
        const to = vertical ? p * width + line : line * width + p,
          from = vertical ? source * width + line : line * width + source;
        out.set(data.subarray(from * STRIDE, (from + 1) * STRIDE), to * STRIDE);
      }
  return { width, height, data: out };
}

const moved = (shifts: readonly number[]) => shifts.some(Boolean);

/** A grid read through strip shifts. */
export interface StripShear {
  /** The image with every strip moved back by its shift. */
  straight: PixelBuffer;
  /** Nats the shifts cost: each strip names one of its options. */
  cost: number;
  /** The image straightened by the anti-phase search, for the twin. */
  twin: () => PixelBuffer;
}

/** The grid's strip shifts, or null when no strip moves. */
export function stripShear(
  strips: StripImage,
  cutsX: readonly number[],
  cutsY: readonly number[],
): StripShear | null {
  const { image } = strips;
  const columns = stripShifts(strips.prefix(false), cutsX, cutsY);
  const once = moved(columns.shifts) ? unshear(image, false, cutsY, columns.shifts) : image;
  const rows = stripShifts(linePrefix(once, true), cutsY, cutsX);
  if (!moved(columns.shifts) && !moved(rows.shifts)) return null;
  const straight = moved(rows.shifts) ? unshear(once, true, cutsX, rows.shifts) : once;
  const cost =
    (cutsY.length - 1) * Math.log(columns.options) + (cutsX.length - 1) * Math.log(rows.options);
  const twin = () => {
    const columnTwin = stripShifts(strips.prefix(false), cutsX, cutsY, columns.shifts);
    const twinOnce = unshear(image, false, cutsY, columnTwin.shifts);
    const rowTwin = stripShifts(linePrefix(twinOnce, true), cutsY, cutsX, rows.shifts);
    return unshear(twinOnce, true, cutsX, rowTwin.shifts);
  };
  return { straight, cost, twin };
}

/** Uniform cuts over the same extent at `factor` times the pitch. */
function offPitch(cuts: readonly number[], factor: number): number[] | null {
  const first = cuts[0],
    last = cuts[cuts.length - 1];
  const cells = Math.round((cuts.length - 1) / factor);
  if (cells < MIN_OFF_PITCH_CELLS || (last - first) / cells < MIN_OFF_PITCH) return null;
  return Array.from({ length: cells + 1 }, (_, i) =>
    Math.round(first + ((last - first) * i) / cells),
  );
}

/** Phase evidence, per sample, of one axis's strip search: its shifts against their anti-phase. */
function axisEvidence(prefix: LinePrefix, cuts: readonly number[], across: readonly number[]) {
  const samples = prefix.lines * prefix.length * CHANNELS;
  const best = stripShifts(prefix, cuts, across);
  const anti = stripShifts(prefix, cuts, across, best.shifts);
  return (
    HALF *
    Math.log((anti.energy / samples + RESIDUAL_FLOOR) / (best.energy / samples + RESIDUAL_FLOOR))
  );
}

/**
 * Phase evidence the strip search finds without the grid, per sample: on each axis, the most it
 * finds at the off-pitch factors, averaged over the two axes.
 */
export function chanceEvidence(
  strips: StripImage,
  cutsX: readonly number[],
  cutsY: readonly number[],
): number {
  let total = 0;
  for (const vertical of [false, true]) {
    const cuts = vertical ? cutsY : cutsX,
      across = vertical ? cutsX : cutsY;
    let most = 0;
    for (const factor of OFF_PITCH_FACTORS) {
      const off = offPitch(cuts, factor);
      if (off) most = Math.max(most, axisEvidence(strips.prefix(vertical), off, across));
    }
    total += most;
  }
  return total * HALF;
}
