import type { PixelBuffer } from "$/base/primitives";

/**
 * A lattice whose cuts each moved to the strongest colour step within `radius` pixels: the cell
 * count of a regular grid with the cut positions of the raster that rounded it. A cut with no
 * stronger step nearby, as in a flat border, stays where the lattice put it.
 */
const CHANNELS = 3;
const STRIDE = 4;
/** Share of a cell a cut may move. */
const SNAP_SHARE = 0.25;
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

/** Colour step between each pixel column (or row) and the one before it, summed along the line. */
function stepProfile(image: PixelBuffer, horizontal: boolean): Float64Array {
  const { width, height, data } = image;
  const length = horizontal ? width : height;
  const profile = new Float64Array(length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const along = horizontal ? x : y;
      if (along === 0) continue;
      const o = (y * width + x) * STRIDE;
      const p = horizontal ? o - STRIDE : o - width * STRIDE;
      let step = 0;
      for (let c = 0; c < CHANNELS; c++) step += Math.abs(data[o + c] - data[p + c]);
      profile[along] += step;
    }
  return profile;
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
  const snapped = [...cuts];
  for (let i = 1; i < cells; i++) {
    const low = Math.max(cuts[i] - radius, snapped[i - 1] + 1),
      high = Math.min(cuts[i] + radius, cuts[i + 1] - 1);
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
  return {
    x: snapAxis(stepProfile(image, true), cutsX, avoid.x),
    y: snapAxis(stepProfile(image, false), cutsY, avoid.y),
  };
}
