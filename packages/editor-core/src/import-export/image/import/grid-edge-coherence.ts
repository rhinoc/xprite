import type { PixelBuffer } from "$/base/primitives";
import { pixelGridCuts } from "$/import-export/image/import/grid";
import type { PixelGridAnalysis } from "$/import-export/image/import/types";

/**
 * Edge coherence of a grid: how much of the image's colour steps fall on its cuts. Each step
 * between two neighbouring pixels counts with the cosine of its phase inside its cell, so a step on
 * a cut counts fully, a step at a cell middle counts against the grid, and steps spread evenly over
 * a cell of two or more whole pixels add up to nothing. The score of a grid is the smaller of its
 * two axes' shares.
 *
 * A soft or noisy upscale describes slightly better through a lattice at a half or third of its
 * pitch: the finer cells follow the blur and noise inside each source pixel. Such a lattice puts
 * most of its cuts inside source pixels, where the image has no edges. Auto does not read a grid
 * the edges reject in either of two ways, which also spares it the cost of reading the grid:
 *
 * - Rigid: the steps summed over the whole image, against the grid's own phase. A grid is rejected
 *   when a proposal of at least COARSER_PITCH times its pitch on both axes reaches MIN_COHERENCE and
 *   the grid keeps less than COHERENCE_SHARE of it. Only a coarser proposal can reject a grid this
 *   way: a warped, drifting or re-blocked grid scores low on one rigid lattice, and its true count
 *   must still compete with the lattices near it.
 * - Local: the steps summed over BANDS strips, scored in runs of RUN_CELLS cells at whatever phase
 *   the run takes, so a grid whose phase drifts across the image keeps its coherence. When some
 *   grid is crisp in the rigid sense (MIN_COHERENCE) and the best local coherence reaches
 *   MIN_LOCAL_COHERENCE, a grid that keeps less than COHERENCE_SHARE of it is rejected.
 *   Of the grids left, only the MAX_COHERENT_GRIDS of highest local coherence are read: the rest
 *   are near-duplicate counts that cost a reading each and do not win.
 *
 * Only grids of at least MIN_REJECTING_CELLS cells per axis reject others: on a small sprite, a
 * lattice of a few large cells lines up with its outline by chance.
 *
 * A bilinear or blurred upscale spreads every edge over its cells; no grid reaches the minimums,
 * and every proposal is read.
 */
const STRIDE = 4;
const CHANNELS = 4;
const ALPHA_CHANNEL = 3;
const ALPHA_SCALE = 255;
/** Share of the coherence that rejects a grid a grid must keep to be read. */
const COHERENCE_SHARE = 0.6;
/** Rigid coherence a grid needs to reject others. */
const MIN_COHERENCE = 0.2;
/** Local coherence the best grid needs before local coherence rejects others. */
const MIN_LOCAL_COHERENCE = 0.3;
/** Cells per axis a grid needs to reject others. */
const MIN_REJECTING_CELLS = 12;
/** Pitch ratio, per axis, from which a proposal counts as coarser. */
const COARSER_PITCH = 1.5;
/** Grids read at most when local coherence selects them. */
const MAX_COHERENT_GRIDS = 10;
/** Strips across each axis the local steps are summed over. */
const BANDS = 8;
/** Cells along a strip that share one phase in the local score. */
const RUN_CELLS = 16;
/**
 * Pixels per cell, per axis, a grid needs for the check: cells of one pixel put every step on a
 * cut. Finer grids are always read and reject none.
 */
const MIN_COHERENCE_PITCH = 2;

/** Per axis, the colour step into each column (or row) in each of BANDS strips across the axis. */
interface StepProfiles {
  x: Float64Array[];
  y: Float64Array[];
}

/** Colour step (premultiplied RGB and alpha) into each column and row, per strip. */
function stepProfiles(image: PixelBuffer): StepProfiles {
  const { width, height, data } = image;
  const x = Array.from({ length: BANDS }, () => new Float64Array(width)),
    y = Array.from({ length: BANDS }, () => new Float64Array(height));
  const columnBand = Int32Array.from({ length: width }, (_, column) =>
    Math.floor((column * BANDS) / width),
  );
  // One row of premultiplied colours at a time, with the row above it.
  let above = new Float64Array(width * CHANNELS),
    current = new Float64Array(width * CHANNELS);
  for (let row = 0; row < height; row++) {
    const across = x[Math.floor((row * BANDS) / height)];
    for (let column = 0, o = row * width * STRIDE; column < width; column++, o += STRIDE) {
      const alpha = data[o + ALPHA_CHANNEL] / ALPHA_SCALE,
        at = column * CHANNELS;
      current[at] = data[o] * alpha;
      current[at + 1] = data[o + 1] * alpha;
      current[at + 2] = data[o + 2] * alpha;
      current[at + ALPHA_CHANNEL] = data[o + ALPHA_CHANNEL];
    }
    for (let column = 0, at = 0; column < width; column++, at += CHANNELS) {
      let right = 0,
        down = 0;
      for (let c = 0; c < CHANNELS; c++) {
        if (column) right += Math.abs(current[at + c] - current[at - CHANNELS + c]);
        if (row) down += Math.abs(current[at + c] - above[at + c]);
      }
      across[column] += right;
      y[columnBand[column]][row] += down;
    }
    [above, current] = [current, above];
  }
  return { x, y };
}

/**
 * Share of one axis's steps on the cuts, weighted by the cosine of their phase in the cell. With
 * `run`, the steps of every `run` cells of each strip add up as phasors and only their length
 * counts, so each run is scored at its own phase.
 */
function axisCoherence(
  strips: readonly Float64Array[],
  cuts: readonly number[],
  run?: number,
): number {
  let aligned = 0,
    total = 0;
  const cells = cuts.length - 1;
  const length = run ?? cells;
  for (const profile of strips)
    for (let first = 0; first < cells; first += length) {
      let real = 0,
        imaginary = 0;
      for (let cell = first; cell < Math.min(cells, first + length); cell++) {
        const from = Math.max(0, Math.ceil(cuts[cell])),
          to = Math.min(profile.length, Math.ceil(cuts[cell + 1]));
        const size = cuts[cell + 1] - cuts[cell];
        for (let p = from; p < to; p++) {
          const angle = (2 * Math.PI * (p - cuts[cell])) / size;
          real += profile[p] * Math.cos(angle);
          if (run) imaginary += profile[p] * Math.sin(angle);
          total += profile[p];
        }
      }
      aligned += run ? Math.hypot(real, imaginary) : real;
    }
  return total ? aligned / total : 0;
}

const sum = (strips: readonly Float64Array[]) => {
  const total = new Float64Array(strips[0].length);
  for (const strip of strips) for (let p = 0; p < strip.length; p++) total[p] += strip[p];
  return [total];
};

/** The proposals Auto reads, per proposer: those the image's edges do not reject (see above). */
export function coherentGrids(
  image: PixelBuffer,
  proposals: readonly (readonly PixelGridAnalysis[])[],
): PixelGridAnalysis[][] {
  if (!proposals.some((grids) => grids.length)) return proposals.map((grids) => [...grids]);
  const bands = stepProfiles(image);
  const whole = { x: sum(bands.x), y: sum(bands.y) };
  const scored = proposals.map((grids) =>
    grids.map((grid) => {
      const cutsX = grid.cutsX ?? pixelGridCuts(image.width, grid.cellWidth, grid.offsetX),
        cutsY = grid.cutsY ?? pixelGridCuts(image.height, grid.cellHeight, grid.offsetY);
      const pitchX = image.width / (cutsX.length - 1),
        pitchY = image.height / (cutsY.length - 1);
      const checked = pitchX >= MIN_COHERENCE_PITCH && pitchY >= MIN_COHERENCE_PITCH;
      return {
        grid,
        pitchX,
        pitchY,
        checked,
        coherence: checked
          ? Math.min(axisCoherence(whole.x, cutsX), axisCoherence(whole.y, cutsY))
          : 0,
        local: checked
          ? Math.min(
              axisCoherence(bands.x, cutsX, RUN_CELLS),
              axisCoherence(bands.y, cutsY, RUN_CELLS),
            )
          : 0,
      };
    }),
  );
  const all = scored.flat();
  const large = all.filter(({ grid }) => Math.min(grid.width, grid.height) >= MIN_REJECTING_CELLS);
  const rejecters = large.filter(({ coherence }) => coherence >= MIN_COHERENCE);
  const bestLocal = rejecters.length ? Math.max(...large.map(({ local }) => local)) : 0;
  const localFloor = bestLocal >= MIN_LOCAL_COHERENCE ? COHERENCE_SHARE * bestLocal : -Infinity;
  const supported = (grid: (typeof all)[number]) =>
    grid.local >= localFloor &&
    !rejecters.some(
      (rejecter) =>
        rejecter.pitchX >= COARSER_PITCH * grid.pitchX &&
        rejecter.pitchY >= COARSER_PITCH * grid.pitchY &&
        grid.coherence < COHERENCE_SHARE * rejecter.coherence,
    );
  let read = new Set(all.filter((grid) => grid.checked && supported(grid)));
  if (localFloor > -Infinity && read.size > MAX_COHERENT_GRIDS)
    read = new Set([...read].sort((a, b) => b.local - a.local).slice(0, MAX_COHERENT_GRIDS));
  return scored.map((grids) =>
    grids.filter((grid) => !grid.checked || read.has(grid)).map(({ grid }) => grid),
  );
}
