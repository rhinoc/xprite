import {
  colourStepCost,
  RESIDUAL_FLOOR,
} from "$/import-export/image/import/grid-description-length";
import { shiftedGridImage, type GridImageView } from "$/import-export/image/import/grid-sampling";
import {
  intervalEnergy,
  linePrefix,
  OFF_PITCH_FACTORS,
  offPitch,
  type LinePrefix,
  type StripImage,
  type StripShear,
} from "$/import-export/image/import/grid-strip-shift";
import { PixelGridSamplingAxis } from "$/import-export/image/import/types";

/**
 * Phase fields of a grid: the lattice keeps its pitch, but its phase may drift along the image and
 * differ from one part of it to another, as a warped upscale or a sheet of separately placed
 * sprites displaces it. Split the cells across an axis into bands; along every band, each
 * described line moves the cuts by a whole pixel shift, and the shift holds from line to line
 * unless a change pays for itself. Each band names its first shift, and every change names its
 * line and either a step of one pixel or a new shift, so a field that follows noise pays for it
 * while a smooth warp pays little. Moving lines apart drops the input pixels between them, and
 * moving a line past the image's end drops the pixels it leaves; the straightened image does not
 * hold them, so the field pays for coding each on its own. The shifts are chosen by dynamic
 * programming on the variance left inside the cells, coded at the residual variance, and on the
 * pixels they drop; the split into bands is the one whose field codes the axis shortest. The
 * column cuts are settled first, the row cuts then on the straightened columns.
 *
 * The twin confines every line's shift to the anti-phase of its own (a quarter to three quarters
 * of a cell away), and `fieldChanceEvidence` measures the phase evidence the same search finds at
 * pitches the grid does not have.
 */
const CHANNELS = 3;
const HALF = 0.5;
const ANTI_PHASE_FROM = 0.25;
const ANTI_PHASE_TO = 0.75;
/** Bands of cells an axis may be split into; each band follows its own shifts. */
const BAND_COUNTS = [1, 2, 3, 4] as const;
/** Cells a band needs, so that its shifts are read on more than a few features. */
const MIN_BAND_CELLS = 8;
/** Dynamic programming passes; each codes the field at the residual variance of the last. */
const REFITS = 2;
/**
 * Cells a shift may reach either way. Beyond half a cell the cuts repeat, but a warp that moves the
 * content further must be followed there, or the straightened lines would slip a cell apart.
 */
const REACH = 1;
const TIE = 1e-9;

/** Per described line, shift and cell: the variance left inside the cell, summed over cells. */
interface EnergyTable {
  prefix: LinePrefix;
  cuts: readonly number[];
  cells: number;
  /** The first shift of the table and the number of shifts. */
  first: number;
  span: number;
  /** [line][shift][bandStride], cumulative at every supported band boundary. */
  sums: Float64Array;
  /** Logical cell boundary -> stored prefix slot; unqueried boundaries are -1. */
  bandSlots: Int32Array;
  bandStride: number;
  /** [line][pixel + 1]: nats of coding the line's pixels on their own, cumulative along it. */
  drops: Float64Array;
}

const dropTables = new WeakMap<LinePrefix, Float64Array>();

/**
 * Per described line, the cumulative nats of coding each pixel's colour against its neighbour
 * (see colourStepCost). Where a dropped pixel lies follows from the shifts, and the straightened
 * image holds a repeated pixel in its place, which already pays the residual floor.
 */
function dropTable(prefix: LinePrefix): Float64Array {
  const cached = dropTables.get(prefix);
  if (cached) return cached;
  const { length, lines, sums } = prefix;
  const drops = new Float64Array(lines.length * (length + 1));
  const value = (base: number, p: number, c: number) =>
    sums[base + (p + 1) * (CHANNELS + 1) + c] - sums[base + p * (CHANNELS + 1) + c];
  for (let k = 0; k < lines.length; k++) {
    const base = k * (length + 1) * (CHANNELS + 1),
      row = k * (length + 1);
    for (let p = 0; p < length; p++) {
      const neighbour = p > 0 ? p - 1 : Math.min(length - 1, p + 1);
      let step = 0;
      for (let c = 0; c < CHANNELS; c++)
        step += (value(base, p, c) - value(base, neighbour, c)) ** 2;
      drops[row + p + 1] = drops[row + p] + colourStepCost(step);
    }
  }
  dropTables.set(prefix, drops);
  return drops;
}

function energyTable(
  prefix: LinePrefix,
  cuts: readonly number[],
  first: number,
  last: number,
): EnergyTable {
  const { length, lines, sums: line } = prefix;
  const cells = cuts.length - 1,
    span = last - first + 1;
  // Every bandEnergy caller uses bandsOf for a supported split, including the anti-field.
  // Keep all cell additions, storing only the prefixes those splits can query.
  const needed = new Set<number>([0, cells]);
  for (const count of BAND_COUNTS) {
    if (count > 1 && cells < count * MIN_BAND_CELLS) break;
    for (const boundary of bandsOf(cells, count)) needed.add(boundary);
  }
  const boundaries = [...needed].sort((a, b) => a - b);
  const bandStride = boundaries.length;
  const bandSlots = new Int32Array(cells + 1).fill(-1);
  for (let slot = 0; slot < bandStride; slot++) bandSlots[boundaries[slot]] = slot;
  const sums = new Float64Array(lines.length * span * bandStride);
  // Shifted cut bounds are identical on every described line.
  const froms = new Float64Array(span * cells),
    tos = new Float64Array(span * cells);
  for (let j = 0; j < span; j++) {
    const shift = first + j;
    for (let i = 0; i < cells; i++) {
      const from = i === 0 ? 0 : Math.max(0, Math.min(length, cuts[i] + shift));
      const to = i + 1 === cells ? length : Math.max(0, Math.min(length, cuts[i + 1] + shift));
      froms[j * cells + i] = from;
      tos[j * cells + i] = Math.max(from, to);
    }
  }
  // Different shifts/cells often request the exact same source interval. Evaluate it once,
  // then retain the original line/shift/cell order of additions into the cumulative table.
  const ids = new Int32Array(froms.length);
  const unique = new Map<string, number>();
  const uniqueFroms: number[] = [],
    uniqueTos: number[] = [];
  for (let i = 0; i < froms.length; i++) {
    const key = `${froms[i]},${tos[i]}`;
    let id = unique.get(key);
    if (id === undefined) {
      id = uniqueFroms.length;
      unique.set(key, id);
      uniqueFroms.push(froms[i]);
      uniqueTos.push(tos[i]);
    }
    ids[i] = id;
  }
  const intervalEnergies = new Float64Array(uniqueFroms.length);
  for (let k = 0; k < lines.length; k++) {
    const base = k * (length + 1) * (CHANNELS + 1);
    for (let i = 0; i < intervalEnergies.length; i++)
      intervalEnergies[i] = intervalEnergy(line, base, uniqueFroms[i], uniqueTos[i]);
    for (let j = 0; j < span; j++) {
      const row = (k * span + j) * bandStride,
        bounds = j * cells;
      let total = 0,
        cell = 0;
      for (let slot = 1; slot < bandStride; slot++) {
        for (; cell < boundaries[slot]; cell++) total += intervalEnergies[ids[bounds + cell]];
        sums[row + slot] = total;
      }
    }
  }
  return {
    prefix,
    cuts,
    cells,
    first,
    span,
    sums,
    bandSlots,
    bandStride,
    drops: dropTable(prefix),
  };
}

const bandEnergy = (table: EnergyTable, k: number, j: number, from: number, to: number) => {
  const row = (k * table.span + j) * table.bandStride;
  return table.sums[row + table.bandSlots[to]] - table.sums[row + table.bandSlots[from]];
};

/** Nats of coding the pixels [from, to) of line k on their own. */
function dropped(table: EnergyTable, k: number, from: number, to: number): number {
  const { length } = table.prefix;
  const low = Math.max(0, Math.min(length, from)),
    high = Math.max(0, Math.min(length, to));
  if (high <= low) return 0;
  const row = k * (length + 1);
  return table.drops[row + high] - table.drops[row + low];
}

interface BandPath {
  shifts: Int32Array;
  energy: number;
  /** Nats the changes and the dropped pixels cost. */
  cost: number;
}

/** Nats a change of shift costs: a step of one pixel either way, or a jump to any other shift. */
interface ChangeCost {
  step: number;
  jump: number;
}

/**
 * The shift of every line along the cells [from, to) that codes them shortest, each pixel's
 * variance costing `scale` nats and the pixels a shift drops `drop` nats. `window` confines a
 * line's shifts. Shifts a whole cell apart cut the lines alike, so on equal cuts the path keeps to
 * the smaller shift.
 */
function bandPath(
  table: EnergyTable,
  from: number,
  to: number,
  scale: number,
  change: ChangeCost,
  window: (line: number) => [number, number],
  drop: (line: number, shift: number) => number,
): BandPath {
  const lines = table.prefix.lines.length,
    { span, first } = table;
  const back = new Int32Array(lines * span);
  let previous = new Float64Array(span),
    current = new Float64Array(span),
    best = Infinity,
    bestAt = -1;
  const tieBias = Float64Array.from({ length: span }, (_, j) => Math.abs(first + j) * TIE);
  for (let k = 0; k < lines; k++) {
    const [low, high] = window(k);
    let nextBest = Infinity,
      nextBestAt = -1;
    const jumpCost = best + change.jump;
    for (let j = 0; j < span; j++) {
      const shift = first + j;
      if (shift < low || shift > high) {
        current[j] = Infinity;
        continue;
      }
      const energy = bandEnergy(table, k, j, from, to) * scale + drop(k, shift) + tieBias[j];
      if (k === 0) {
        current[j] = energy;
        if (current[j] < nextBest) {
          nextBest = current[j];
          nextBestAt = j;
        }
        continue;
      }
      let cost = previous[j],
        source = j;
      if (j > 0 && previous[j - 1] + change.step < cost) {
        cost = previous[j - 1] + change.step;
        source = j - 1;
      }
      if (j + 1 < span && previous[j + 1] + change.step < cost) {
        cost = previous[j + 1] + change.step;
        source = j + 1;
      }
      if (jumpCost < cost) {
        cost = jumpCost;
        source = bestAt;
      }
      current[j] = cost + energy;
      if (current[j] < nextBest) {
        nextBest = current[j];
        nextBestAt = j;
      }
      back[k * span + j] = source;
    }
    const scratch = previous;
    previous = current;
    current = scratch;
    best = nextBest;
    bestAt = nextBestAt;
  }
  let at = 0;
  for (let j = 1; j < span; j++) if (previous[j] < previous[at]) at = j;
  const shifts = new Int32Array(lines);
  let energy = 0,
    cost = 0;
  for (let k = lines - 1; k >= 0; k--) {
    shifts[k] = first + at;
    energy += bandEnergy(table, k, at, from, to);
    cost += drop(k, shifts[k]);
    if (k > 0) {
      const before = back[k * span + at];
      if (before !== at) cost += Math.abs(before - at) === 1 ? change.step : change.jump;
      at = before;
    }
  }
  return { shifts, energy, cost };
}

/** A phase field along one axis: the band boundaries (in cells) and every band's line shifts. */
interface AxisField {
  bands: number[];
  shifts: Int32Array[];
  energy: number;
  /** Nats the shifts and the pixels they drop cost. */
  cost: number;
}

const pitchOf = (cuts: readonly number[]) => (cuts[cuts.length - 1] - cuts[0]) / (cuts.length - 1);

function shiftRange(cuts: readonly number[]) {
  const pitch = pitchOf(cuts);
  const reach = Math.round(pitch * REACH);
  return { low: -reach, high: reach, pitch };
}

function bandsOf(cells: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, b) => Math.round((b * cells) / count));
}

interface RangedTable extends EnergyTable {
  range: { low: number; high: number; pitch: number };
}

/**
 * The field of one band split. Without `anchor` every shift lies within REACH; with it, every
 * line's shift lies in the anti-phase window of the anchor's. A line's pixels between where the
 * band before it ends and where its own band starts reading, or before the first band and past
 * the last, drop out of the straightened image; the bands are settled in order, each paying for
 * the pixels it drops after the one before.
 */
function splitField(
  table: RangedTable,
  bands: readonly number[],
  variance: number,
  anchor?: AxisField,
): AxisField {
  const { low, high, pitch } = table.range;
  const { length } = table.prefix;
  const options = high - low + 1;
  const line = Math.log(Math.max(2, table.prefix.lines.length)) + Math.LN2;
  const change = { step: line + Math.LN2, jump: line + Math.log(options - 1) };
  const shifts: Int32Array[] = [];
  const stationaryWindow: [number, number] = [low, high];
  let energy = 0,
    cost = 0;
  for (let b = 0; b + 1 < bands.length; b++) {
    const window = anchor
      ? (k: number): [number, number] => [
          Math.ceil(anchor.shifts[b][k] + ANTI_PHASE_FROM * pitch),
          Math.floor(anchor.shifts[b][k] + ANTI_PHASE_TO * pitch),
        ]
      : (): [number, number] => stationaryWindow;
    const start = b === 0 ? 0 : table.cuts[bands[b]],
      before = shifts[b - 1],
      last = b + 2 === bands.length;
    const drop = (k: number, shift: number) =>
      dropped(table, k, before ? start + before[k] : 0, start + shift) +
      (last && shift < 0 ? dropped(table, k, length + shift, length) : 0);
    const path = bandPath(table, bands[b], bands[b + 1], 1 / (2 * variance), change, window, drop);
    shifts.push(path.shifts);
    energy += path.energy;
    cost += Math.log(options) + path.cost;
  }
  return { bands: [...bands], shifts, energy, cost };
}

function rangedTable(prefix: LinePrefix, cuts: readonly number[]): RangedTable {
  const range = shiftRange(cuts);
  const last = range.high + Math.floor(ANTI_PHASE_TO * range.pitch);
  return { ...energyTable(prefix, cuts, range.low, last), range };
}

const samplesOf = (prefix: LinePrefix) => prefix.lines.length * prefix.length * CHANNELS;

/** Description length, in nats, of an axis's residual and shifts under a field. */
const fieldLength = (field: AxisField, samples: number) =>
  (samples / 2) * Math.log(field.energy / samples + RESIDUAL_FLOOR) + field.cost;

/** The band split, and its field, that codes the axis shortest. */
function bestField(table: RangedTable, bandCounts: readonly number[] = BAND_COUNTS): AxisField {
  const samples = samplesOf(table.prefix);
  let still = 0;
  for (let k = 0; k < table.prefix.lines.length; k++)
    still += bandEnergy(table, k, -table.first, 0, table.cells);
  let best: AxisField | null = null;
  for (const count of bandCounts) {
    if (count > 1 && table.cells < count * MIN_BAND_CELLS) break;
    const bands = bandsOf(table.cells, count);
    let variance = still / samples + RESIDUAL_FLOOR;
    let field = splitField(table, bands, variance);
    for (let pass = 1; pass < REFITS; pass++) {
      variance = field.energy / samples + RESIDUAL_FLOOR;
      field = splitField(table, bands, variance);
    }
    if (!best || fieldLength(field, samples) < fieldLength(best, samples)) best = field;
  }
  return best!;
}

/**
 * The image with each field line moved back by its shift. Reads interpolate by the original
 * nearest described line rule; an exact midpoint chooses the later line.
 */
function unfield(
  image: GridImageView,
  vertical: boolean,
  cuts: readonly number[],
  lines: Int32Array,
  field: AxisField,
): GridImageView {
  const count = vertical ? image.width : image.height;
  const across = [0];
  for (let i = 1; i < lines.length; i++) across.push(Math.ceil((lines[i - 1] + lines[i]) / 2));
  across.push(count);
  return shiftedGridImage(image, {
    axis: vertical ? PixelGridSamplingAxis.Vertical : PixelGridSamplingAxis.Horizontal,
    bands: field.bands.map((cell) => cuts[cell]),
    across,
    shifts: field.shifts,
  });
}

const moved = (field: AxisField) => field.shifts.some((shifts) => shifts.some(Boolean));

/** The field of a table confined to the anti-phase of `anchor`'s shifts, for the twin. */
function antiField(table: RangedTable, anchor: AxisField): AxisField {
  const variance = anchor.energy / samplesOf(table.prefix) + RESIDUAL_FLOOR;
  return splitField(table, anchor.bands, variance, anchor);
}

interface ColumnView {
  once: GridImageView;
  rowPrefix: LinePrefix;
}

interface LastColumns extends ColumnView {
  key: string;
  table: RangedTable;
  field: AxisField;
  anti?: ColumnView;
}

/** Only the most recent x geometry may retain its normal/anti row prefixes. */
const lastColumns = new WeakMap<StripImage, LastColumns>();

function columnView(
  strips: StripImage,
  cutsX: readonly number[],
  table: RangedTable,
  field: AxisField,
): ColumnView {
  const once = moved(field)
    ? unfield(strips.image, false, cutsX, table.prefix.lines, field)
    : strips.image;
  return {
    once,
    rowPrefix: once === strips.image ? strips.prefix(true) : linePrefix(once, true),
  };
}

function columnsOf(strips: StripImage, cutsX: readonly number[]): LastColumns {
  const key = cutsX.join(",");
  const cached = lastColumns.get(strips);
  if (cached?.key === key) return cached;
  const table = rangedTable(strips.prefix(false), cutsX);
  const field = bestField(table);
  const entry = { key, table, field, ...columnView(strips, cutsX, table, field) };
  lastColumns.set(strips, entry);
  return entry;
}

/**
 * Keep this closure separate from columnsOf/phaseField: retained readings must not retain an
 * evicted cache entry's normal/anti line prefixes. Only the last WeakMap entry owns those.
 */
function fieldTwin(
  strips: StripImage,
  cutsX: readonly number[],
  cutsY: readonly number[],
  columnTable: RangedTable,
  columns: AxisField,
  rows: AxisField,
): () => GridImageView {
  return () => {
    const cached = lastColumns.get(strips);
    const anti =
      cached?.table === columnTable
        ? (cached.anti ??= columnView(strips, cutsX, columnTable, antiField(columnTable, columns)))
        : columnView(strips, cutsX, columnTable, antiField(columnTable, columns));
    const rowTable = rangedTable(anti.rowPrefix, cutsY);
    const rowField = antiField(rowTable, rows);
    return moved(rowField)
      ? unfield(anti.once, true, cutsY, rowTable.prefix.lines, rowField)
      : anti.once;
  };
}

/** The grid read through phase fields, or null when no line of any band moves. */
export function phaseField(
  strips: StripImage,
  cutsX: readonly number[],
  cutsY: readonly number[],
): (StripShear & { bandsX: number; bandsY: number }) | null {
  const { table: columnTable, field: columns, once, rowPrefix } = columnsOf(strips, cutsX);
  const rowTable = rangedTable(rowPrefix, cutsY);
  const rows = bestField(rowTable);
  const straight = moved(rows) ? unfield(once, true, cutsY, rowTable.prefix.lines, rows) : once;
  if (!moved(columns) && !moved(rows)) return null;
  return {
    straight,
    cost: columns.cost + rows.cost,
    twin: fieldTwin(strips, cutsX, cutsY, columnTable, columns, rows),
    bandsX: columns.bands.length - 1,
    bandsY: rows.bands.length - 1,
  };
}

/** Phase evidence, per sample, of one axis's field: its shifts against their anti-phase. */
function axisEvidence(prefix: LinePrefix, cuts: readonly number[], bands: number) {
  const table = rangedTable(prefix, cuts);
  const samples = samplesOf(prefix);
  const best = bestField(table, [
    Math.min(bands, Math.max(1, Math.floor(table.cells / MIN_BAND_CELLS))),
  ]);
  const anti = antiField(table, best);
  return (
    HALF *
    Math.log((anti.energy / samples + RESIDUAL_FLOOR) / (best.energy / samples + RESIDUAL_FLOOR))
  );
}

/**
 * Phase evidence the field search finds without the grid, per sample: on each axis, the most it
 * finds at the off-pitch factors with the same number of bands, averaged over the two axes.
 */
export function fieldChanceEvidence(
  strips: StripImage,
  cutsX: readonly number[],
  cutsY: readonly number[],
  bandsX: number,
  bandsY: number,
): number {
  let total = 0;
  for (const vertical of [false, true]) {
    const cuts = vertical ? cutsY : cutsX;
    let most = 0;
    for (const factor of OFF_PITCH_FACTORS) {
      const off = offPitch(cuts, factor);
      if (off)
        most = Math.max(
          most,
          axisEvidence(strips.prefix(vertical), off, vertical ? bandsY : bandsX),
        );
    }
    total += most;
  }
  return total * HALF;
}
