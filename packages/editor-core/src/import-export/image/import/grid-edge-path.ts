import type { PixelBuffer } from "$/base/primitives";
import { pixelGridCuts } from "$/import-export/image/import/grid";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

/**
 * Edge paths: a mesh whose cuts follow the colour edges at a pitch another proposer found.
 *
 * A generator does not draw its cells at one width. Along an axis the cells of a generated sprite
 * are 0.8 to 1.2 times the pitch, and the width wanders across the image, so every lattice falls
 * out of step with the art somewhere and cuts through its pixels. The edge mesh (grid-detect) only
 * keeps cuts on sharp, consistent edges, which a soft generated image rarely has everywhere.
 *
 * Per axis, the colour steps into each column (or row) are summed over the image, and the cuts are
 * the path through them, from the first strong step to the last, that gathers the most step energy
 * (EDGE_GAIN per cut, relative to the mean step) at cell widths between MIN_WIDTH and MAX_WIDTH of
 * the pitch. A width away from the pitch costs PITCH_WEIGHT, a change of width from one cell to
 * the next SMOOTH_WEIGHT, both on the square of the change as a share of the pitch, so across a
 * stretch of one colour the path keeps the pitch and at an edge it moves onto it. Outside the
 * content the cuts continue at the pitch. Arbitration reads the paths as free meshes: each cut pays
 * for itself, so a path wins only where the art does not keep one pitch. A path already sits on
 * the edges, so it is read as placed, without strip shifts or a phase field.
 */
const STRIDE = 4;
const CHANNELS = 4;
const ALPHA_CHANNEL = 3;
const ALPHA_SCALE = 255;
const MIN_WIDTH = 0.75;
const MAX_WIDTH = 1.25;
const PITCH_WEIGHT = 10;
const SMOOTH_WEIGHT = 8;
/** Share of the strongest step a step needs to start or end the content. */
const CONTENT_STEP = 0.05;
/** A border cell narrower than this share of the pitch joins its neighbour. */
const SLIVER = 0.5;
/** Pitches of at least this many pixels are followed; finer ones have no room to move. */
const MIN_PITCH = 4;
/** Cells per axis a path needs. */
const MIN_CELLS = 8;
/** Pitch pairs within this many pixels on both axes share one path. */
const PITCH_TOLERANCE = 0.5;
/** Paths proposed at most: each costs a reading. */
const MAX_PATHS = 3;

/** Colour step into every column and row, summed over the image (premultiplied RGB and alpha). */
function stepProfiles(image: PixelBuffer): { x: Float64Array; y: Float64Array } {
  const { width, height, data } = image;
  const x = new Float64Array(width),
    y = new Float64Array(height);
  let above = new Float64Array(width * CHANNELS),
    current = new Float64Array(width * CHANNELS);
  for (let row = 0; row < height; row++) {
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
      x[column] += right;
      y[row] += down;
    }
    [above, current] = [current, above];
  }
  return { x, y };
}

/** The cuts of one axis along its step profile at `pitch`; null when the axis has no content. */
export function edgePath(profile: Float64Array, pitch: number): number[] | null {
  const length = profile.length;
  let peak = 0;
  for (let p = 1; p < length; p++) peak = Math.max(peak, profile[p]);
  if (!peak) return null;
  let first = -1,
    last = -1;
  for (let p = 1; p < length; p++)
    if (profile[p] >= CONTENT_STEP * peak) {
      if (first < 0) first = p;
      last = p;
    }
  const narrow = Math.max(2, Math.round(MIN_WIDTH * pitch)),
    wide = Math.max(narrow, Math.round(MAX_WIDTH * pitch));
  if (first < 0 || last - first < narrow) return null;
  let mean = 0;
  for (let p = first; p <= last; p++) mean += profile[p];
  mean /= last - first + 1;
  const gain = (p: number) => (p < length ? profile[p] / mean - 1 : -1);
  const widths = wide - narrow + 1;
  const span = last - first;
  // score[q][w]: best path from `first` to a cut at first + q whose last cell is narrow + w wide.
  const score = new Float64Array((span + wide + 1) * widths).fill(-Infinity);
  const from = new Int32Array((span + wide + 1) * widths).fill(-1);
  const cost = (w: number) => PITCH_WEIGHT * ((narrow + w - pitch) / pitch) ** 2;
  for (let w = 0; w < widths; w++) {
    const q = narrow + w;
    if (q <= span + wide) score[q * widths + w] = gain(first) + gain(first + q) - cost(w);
  }
  for (let q = narrow; q <= span; q++)
    for (let w = 0; w < widths; w++) {
      const here = score[q * widths + w];
      if (here === -Infinity) continue;
      for (let next = 0; next < widths; next++) {
        const to = q + narrow + next;
        if (to > span + wide) break;
        const change = (next - w) / pitch;
        const value = here + gain(first + to) - cost(next) - SMOOTH_WEIGHT * change * change;
        if (value > score[to * widths + next]) {
          score[to * widths + next] = value;
          from[to * widths + next] = q * widths + w;
        }
      }
    }
  let end = -1,
    best = -Infinity;
  // The path ends on the last content step, or within one narrow cell past it.
  for (let q = span; q <= Math.min(span + narrow, span + wide); q++)
    for (let w = 0; w < widths; w++)
      if (score[q * widths + w] > best) {
        best = score[q * widths + w];
        end = q * widths + w;
      }
  if (end < 0) return null;
  const inner: number[] = [];
  for (let at = end; at >= 0; at = from[at]) {
    const q = Math.floor(at / widths);
    inner.push(first + q);
    if (from[at] < 0) inner.push(first);
  }
  inner.reverse();
  // Continue at the pitch to both ends of the axis.
  const cuts = inner.filter((c) => c > 0 && c < length);
  while (cuts[0] - pitch > 0) cuts.unshift(cuts[0] - pitch);
  while (cuts[cuts.length - 1] + pitch < length) cuts.push(cuts[cuts.length - 1] + pitch);
  if (cuts[0] < SLIVER * pitch) cuts.shift();
  if (length - cuts[cuts.length - 1] < SLIVER * pitch) cuts.pop();
  return [0, ...cuts.map((c) => Math.round(c * 100) / 100), length];
}

const pitchOf = (cuts: readonly number[]) => (cuts[cuts.length - 1] - cuts[0]) / (cuts.length - 1);

/**
 * Edge-path meshes at the pitches of the given proposals, strongest proposals first, one per pitch
 * pair (see above).
 */
export function edgePathGrids(
  image: PixelBuffer,
  proposals: readonly PixelGridAnalysis[],
): PixelGridAnalysis[] {
  const pitches: { x: number; y: number; confidence: number }[] = [];
  for (const grid of [...proposals].sort((a, b) => b.confidence - a.confidence)) {
    if (!grid.reliable) continue;
    const x = pitchOf(grid.cutsX ?? pixelGridCuts(image.width, grid.cellWidth, grid.offsetX)),
      y = pitchOf(grid.cutsY ?? pixelGridCuts(image.height, grid.cellHeight, grid.offsetY));
    if (Math.min(x, y) < MIN_PITCH) continue;
    if (
      pitches.some(
        (p) => Math.abs(p.x - x) <= PITCH_TOLERANCE && Math.abs(p.y - y) <= PITCH_TOLERANCE,
      )
    )
      continue;
    pitches.push({ x, y, confidence: grid.confidence });
    if (pitches.length === MAX_PATHS) break;
  }
  if (!pitches.length) return [];
  const profiles = stepProfiles(image);
  const grids: PixelGridAnalysis[] = [];
  const seen = new Set<string>();
  for (const { x, y, confidence } of pitches) {
    const cutsX = edgePath(profiles.x, x),
      cutsY = edgePath(profiles.y, y);
    if (!cutsX || !cutsY) continue;
    const columns = cutsX.length - 1,
      rows = cutsY.length - 1;
    if (Math.min(columns, rows) < MIN_CELLS) continue;
    const key = `${cutsX.join(",")}|${cutsY.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    grids.push({
      width: columns,
      height: rows,
      cellWidth: image.width / columns,
      cellHeight: image.height / rows,
      offsetX: 0,
      offsetY: 0,
      cutsX,
      cutsY,
      confidence,
      reliable: true,
      algorithm: PixelationAlgorithm.EdgeGrid,
      placed: true,
    });
  }
  return grids;
}
