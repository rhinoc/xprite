import type { PixelBuffer } from "$/base/primitives";

/**
 * A lattice whose cuts each moved to the strongest colour step within `radius` pixels: the cell
 * count of a regular grid with the cut positions of the raster that rounded it. A cut with no
 * stronger step nearby, as in a flat border, stays where the lattice put it. A cut only moves
 * where the cell before it stays within CELL_SPREAD of the pitch, so a strong edge inside a cell
 * (a highlight, an outline) cannot squeeze one cell and stretch the next.
 */
const CHANNELS = 3;
const STRIDE = 4;
const ALPHA_CHANNEL = 3;
const ALPHA_SCALE = 255;
/** Share of a cell a cut may move. */
const SNAP_SHARE = 0.25;
/** Share of the pitch a snapped cell may differ from it. */
const CELL_SPREAD = 0.25;
const NO_STEP = -1;

export interface SnappedAxis {
  cuts: number[];
  /** Pixels each cut could move either way. */
  radius: number;
}

/** Positions per axis a snapped cut may not take. */
export interface AvoidedCuts {
  x: readonly number[];
  y: readonly number[];
}

/**
 * Colour step between each pixel column (or row) and the one before it, summed along the line, on
 * premultiplied colour and alpha: a clear pixel's hidden colour (a removed background) is no edge.
 */
function computeStepProfile(image: PixelBuffer, horizontal: boolean): Float64Array {
  const { width, height, data } = image;
  const length = horizontal ? width : height;
  const profile = new Float64Array(length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const along = horizontal ? x : y;
      if (along === 0) continue;
      const o = (y * width + x) * STRIDE;
      const p = horizontal ? o - STRIDE : o - width * STRIDE;
      const a = data[o + ALPHA_CHANNEL] / ALPHA_SCALE,
        b = data[p + ALPHA_CHANNEL] / ALPHA_SCALE;
      let step = Math.abs(data[o + ALPHA_CHANNEL] - data[p + ALPHA_CHANNEL]);
      for (let c = 0; c < CHANNELS; c++) step += Math.abs(data[o + c] * a - data[p + c] * b);
      profile[along] += step;
    }
  return profile;
}

/** Every reading of one image snaps against the same profiles. */
const profiles = new WeakMap<PixelBuffer, { x: Float64Array; y: Float64Array }>();

function stepProfiles(image: PixelBuffer) {
  let cached = profiles.get(image);
  if (!cached) {
    cached = { x: computeStepProfile(image, true), y: computeStepProfile(image, false) };
    profiles.set(image, cached);
  }
  return cached;
}

function snapAxis(
  profile: Float64Array,
  cuts: readonly number[],
  avoid: readonly number[],
): SnappedAxis {
  const cells = cuts.length - 1;
  const pitch = (cuts[cells] - cuts[0]) / cells;
  const radius = Math.max(1, Math.floor(pitch * SNAP_SHARE));
  const avoided = new Set(avoid);
  const strength = (at: number) => (avoided.has(at) ? NO_STEP : profile[at]);
  // Rounded outwards: at a small pitch, whole pixels must still cover the cells' own spread.
  const narrowest = Math.max(1, Math.floor((1 - CELL_SPREAD) * pitch)),
    widest = Math.ceil((1 + CELL_SPREAD) * pitch);
  const snapped = [...cuts];
  for (let i = 1; i < cells; i++) {
    const low = Math.max(cuts[i] - radius, snapped[i - 1] + narrowest),
      high = Math.min(cuts[i] + radius, cuts[i + 1] - 1, snapped[i - 1] + widest);
    if (low > high) continue;
    let best = Math.min(Math.max(cuts[i], low), high);
    for (let at = low; at <= high; at++) if (strength(at) > strength(best)) best = at;
    snapped[i] = best;
  }
  return { cuts: snapped, radius };
}

export function snapLatticeCuts(
  image: PixelBuffer,
  cutsX: readonly number[],
  cutsY: readonly number[],
  avoid: AvoidedCuts = { x: [], y: [] },
): { x: SnappedAxis; y: SnappedAxis } {
  const profile = stepProfiles(image);
  return {
    x: snapAxis(profile.x, cutsX, avoid.x),
    y: snapAxis(profile.y, cutsY, avoid.y),
  };
}
