import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import {
  colorStep,
  neighbourSteps,
  OPAQUE_STEPS,
  OPAQUE_STEPS_32,
  releaseNeighbourSteps,
  step32Of,
  stepOf,
  TRANSLUCENT,
} from "$/import-export/image/import/color-step";
import {
  MAX_GRID_CELL_SIZE,
  MAX_RECOVERED_GRID_SIZE,
  pixelGridCuts,
} from "$/import-export/image/import/grid";
import type { PixelGridAnalysis } from "$/import-export/image/import/types";

/**
 * Edge-projection grid detection. The mesh idea (anchor cuts on projected edges, fill the gaps with
 * an even pitch) follows KennethJAllen/proper-pixel-art (MIT); its quantise-first step is not used.
 * Soft edge ramps are merged into one weighted-centre edge, the pitch is refined by least squares
 * on those centres, and a grid is accepted only when its cuts sit on sharp edges.
 */
const CHANNELS = 4;
const MIN_PITCH = 3;
const MIN_CELLS = 4;
const MIN_GRID_CELLS = 16;
const EDGE_PEAK_MULTIPLIER = 4;
const EDGE_FLOOR = 0.002;
const PITCH_STEP = 0.02;
const PITCH_MODE_FRACTION = 0.6;
const CONSISTENT_GAP = 0.2;
const DEDUPE_FRACTION = 0.45;
const REFINE_PASSES = 6;
const SHARP_WINDOW = 1;
const MIN_SHARP_SHARE = 0.4;
const MIN_CONTRAST = 2;
const CONTRAST_FLOOR = 1e-4;
const FLAT_RANGE = 0.25;
const MIN_FLAT_SHARE = 0.8;
const MIN_LATTICE_SHARE = 0.85;
const MAX_LATTICE_RESIDUAL = 0.12;
const FLAT_SAMPLES = 5;
const HISTOGRAM_BINS = 256;
const MIN_STEP = 12 / UINT8_MAX;
const NOISE_MULTIPLIER = 2.5;
const SLIVER_FRACTION = 0.5;
const SQUARE_TOLERANCE = 1.3;
const SQUARE_SUPPORT = 0.3;

interface Edge {
  position: number;
  weight: number;
}
interface AxisResult {
  length: number;
  profile: Float64Array;
  edges: readonly Edge[];
  pitch: number;
  lattice: {
    step: number;
    offset: number;
    share: number;
    residual: number;
  } | null;
  meshCuts: number[];
}
interface Analysis {
  x: AxisResult | null;
  y: AxisResult | null;
}

/**
 * profile[i] is the mean colour step above the noise floor between pixel i-1 and pixel i, taken
 * across the whole cross axis. The floor is twice the median step, so JPEG-like noise and smooth
 * gradients contribute nothing while real edges do.
 */
function edgeProfile(image: PixelBuffer, horizontal: boolean): Float64Array {
  const { width, height, data } = image;
  const length = horizontal ? width : height;
  const cross = horizontal ? height : width;
  // Both directions walk the pixels row by row: the step into pixel (x, y) from its left (or upper)
  // neighbour q is the pair code at q. Opaque pairs are counted by code and looked up; the profile
  // sums every position's steps in line order.
  const codes = horizontal ? neighbourSteps(image).right : neighbourSteps(image).down;
  const neighbour = horizontal ? 1 : width;
  const firstY = horizontal ? 0 : 1,
    firstX = horizontal ? 1 : 0;
  const histogram = new Uint32Array(HISTOGRAM_BINS);
  const byCode = new Uint32Array(TRANSLUCENT + 1);
  for (let y = firstY; y < height; y++)
    for (let q = y * width + firstX - neighbour, end = y * width + width - neighbour; q < end; q++)
      byCode[codes[q]]++;
  const bin = (step: number) => Math.min(HISTOGRAM_BINS - 1, Math.floor(step * HISTOGRAM_BINS));
  for (let code = 0; code < TRANSLUCENT; code++) histogram[bin(OPAQUE_STEPS[code])] += byCode[code];
  if (byCode[TRANSLUCENT])
    for (let y = firstY; y < height; y++)
      for (let x = firstX, q = y * width + x - neighbour; x < width; x++, q++)
        if (codes[q] === TRANSLUCENT) histogram[bin(stepOf(codes, data, q, neighbour))]++;
  let seen = 0;
  let median = 0;
  const half = (cross * (length - 1)) / 2;
  for (let bin = 0; bin < HISTOGRAM_BINS; bin++) {
    seen += histogram[bin];
    if (seen >= half) {
      median = (bin + 1) / HISTOGRAM_BINS;
      break;
    }
  }
  const floor = Math.max(MIN_STEP, NOISE_MULTIPLIER * median);
  // The profile reads the steps rounded to float32, as they were once stored. A step at or below
  // the floor adds zero, which leaves the (positive) sums unchanged.
  const above = new Float64Array(TRANSLUCENT + 1);
  for (let code = 0; code < TRANSLUCENT; code++) {
    const step = OPAQUE_STEPS_32[code];
    above[code] = step > floor ? step - floor : 0;
  }
  const translucent = byCode[TRANSLUCENT] > 0;
  const contribution = (q: number) => {
    const code = codes[q];
    if (code < TRANSLUCENT || !translucent) return above[code];
    const step = step32Of(codes, data, q, neighbour);
    return step > floor ? step - floor : 0;
  };
  const profile = new Float64Array(length);
  if (horizontal)
    for (let y = 0; y < height; y++)
      for (let x = 1, q = y * width; x < width; x++, q++) profile[x] += contribution(q);
  else
    for (let y = 1; y < height; y++) {
      let sum = 0;
      for (let q = (y - 1) * width, end = q + width; q < end; q++) sum += contribution(q);
      profile[y] = sum;
    }
  for (let i = 0; i < length; i++) profile[i] /= cross;
  return profile;
}
function mergeEdges(profile: Float64Array): Edge[] {
  const length = profile.length;
  let mean = 0;
  for (const value of profile) mean += value;
  mean /= length;
  const floor = Math.max(mean, EDGE_FLOOR);
  const edges: Edge[] = [];
  let start = -1,
    weight = 0,
    moment = 0,
    peak = 0;
  const close = () => {
    if (start >= 0 && peak >= EDGE_PEAK_MULTIPLIER * floor)
      edges.push({ position: moment / weight, weight });
    start = -1;
    weight = moment = peak = 0;
  };
  for (let i = 1; i < length; i++) {
    if (profile[i] > floor) {
      if (start < 0) start = i;
      weight += profile[i];
      moment += profile[i] * i;
      peak = Math.max(peak, profile[i]);
    } else close();
  }
  close();
  return edges;
}
interface Gap {
  gap: number;
  weight: number;
}
function edgeGaps(edges: readonly Edge[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < edges.length; i++)
    gaps.push({
      gap: edges[i].position - edges[i - 1].position,
      weight: Math.min(edges[i].weight, edges[i - 1].weight),
    });
  return gaps;
}
function pitchScore(gaps: readonly Gap[], pitch: number): number {
  const sigma = 0.08 * pitch + 0.25;
  let score = 0;
  for (const { gap, weight } of gaps) {
    const z = (gap - pitch) / sigma;
    if (Math.abs(z) < 4) score += weight * Math.exp(-0.5 * z * z);
  }
  return score;
}
/** Most common edge-to-edge gap, preferring the smallest mode so multiples of the pitch lose. */
function estimatePitch(gaps: readonly Gap[], length: number): number {
  const max = Math.min(MAX_GRID_CELL_SIZE, length / MIN_CELLS);
  const scores: number[] = [];
  const candidates: number[] = [];
  for (let pitch = MIN_PITCH; pitch <= max; pitch += PITCH_STEP) {
    candidates.push(pitch);
    scores.push(pitchScore(gaps, pitch));
  }
  const best = Math.max(...scores, 0);
  if (best <= 0) return 0;
  for (let i = 1; i < scores.length - 1; i++)
    if (
      scores[i] >= PITCH_MODE_FRACTION * best &&
      scores[i] >= scores[i - 1] &&
      scores[i] > scores[i + 1]
    )
      return candidates[i];
  return candidates[scores.indexOf(best)];
}
function refinePitch(edges: readonly Edge[], initial: number): number {
  let pitch = initial;
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    let gapSum = 0,
      cellSum = 0;
    for (let i = 1; i < edges.length; i++) {
      const gap = edges[i].position - edges[i - 1].position;
      const cells = Math.round(gap / pitch);
      if (cells >= 1 && Math.abs(gap - cells * pitch) <= CONSISTENT_GAP * pitch) {
        gapSum += gap;
        cellSum += cells;
      }
    }
    if (!cellSum) break;
    pitch = gapSum / cellSum;
  }
  return pitch;
}
/** Weighted least-squares lattice position = offset + k * step over edges that agree with it. */
function fitLattice(
  edges: readonly Edge[],
  pitch: number,
): { step: number; offset: number; share: number; residual: number } | null {
  if (edges.length < 3) return null;
  let step = pitch;
  let offset = edges[0].position;
  // Chain neighbouring edges first so a small pitch error cannot drift across the image.
  const index = Array.from({ length: edges.length }, () => 0);
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    if (pass === 0)
      for (let i = 1; i < edges.length; i++)
        index[i] =
          index[i - 1] +
          Math.max(1, Math.round((edges[i].position - edges[i - 1].position) / step));
    else
      for (let i = 0; i < edges.length; i++)
        index[i] = Math.round((edges[i].position - offset) / step);
    let sw = 0,
      sk = 0,
      sp = 0,
      skk = 0,
      skp = 0;
    for (let i = 0; i < edges.length; i++) {
      const residual = edges[i].position - (offset + index[i] * step);
      if (pass > 0 && Math.abs(residual) > CONSISTENT_GAP * step) continue;
      const w = edges[i].weight;
      sw += w;
      sk += w * index[i];
      sp += w * edges[i].position;
      skk += w * index[i] * index[i];
      skp += w * index[i] * edges[i].position;
    }
    const denominator = sw * skk - sk * sk;
    if (!sw || Math.abs(denominator) < 1e-9) return null;
    step = (sw * skp - sk * sp) / denominator;
    offset = (sp - step * sk) / sw;
  }
  let total = 0,
    fit = 0,
    squares = 0;
  for (const edge of edges) {
    const k = Math.round((edge.position - offset) / step);
    const residual = edge.position - (offset + k * step);
    total += edge.weight;
    if (Math.abs(residual) <= CONSISTENT_GAP * step) {
      fit += edge.weight;
      squares += edge.weight * residual * residual;
    }
  }
  if (!fit) return null;
  return {
    step,
    offset,
    share: fit / total,
    residual: Math.sqrt(squares / fit) / step,
  };
}
/** Cuts anchored on every edge, with even subdivisions wherever a gap spans several pitches. */
function buildMesh(edges: readonly Edge[], pitch: number, length: number): number[] {
  const anchors: Edge[] = [];
  for (const edge of edges) {
    const last = anchors[anchors.length - 1];
    if (last && edge.position - last.position < DEDUPE_FRACTION * pitch) {
      if (edge.weight > last.weight) anchors[anchors.length - 1] = edge;
    } else anchors.push(edge);
  }
  const marks = [0, ...anchors.map((edge) => edge.position), length];
  const cuts = [0];
  for (let i = 1; i < marks.length; i++) {
    const left = marks[i - 1],
      right = marks[i];
    const cells = Math.max(1, Math.round((right - left) / pitch));
    for (let n = 1; n < cells; n++) pushCut(cuts, left + ((right - left) * n) / cells, length);
    if (i < marks.length - 1) pushCut(cuts, right, length);
  }
  cuts.push(length);
  return mergeSlivers(cuts, pitch);
}
/** A cell cropped to less than half a pitch at the image border joins its neighbour. */
export function mergeSlivers(cuts: number[], pitch: number): number[] {
  const merged = [...cuts];
  if (merged.length > 2 && merged[1] - merged[0] < SLIVER_FRACTION * pitch) merged.splice(1, 1);
  const n = merged.length;
  if (n > 2 && merged[n - 1] - merged[n - 2] < SLIVER_FRACTION * pitch) merged.splice(n - 2, 1);
  return merged;
}
function pushCut(cuts: number[], position: number, length: number): void {
  const cut = Math.round(position);
  if (cut > cuts[cuts.length - 1] && cut < length) cuts.push(cut);
}
interface AxisDraft {
  length: number;
  profile: Float64Array;
  edges: readonly Edge[];
  gaps: readonly Gap[];
  pitch: number;
  best: number;
}
function draftAxis(image: PixelBuffer, horizontal: boolean): AxisDraft | null {
  const length = horizontal ? image.width : image.height;
  const profile = edgeProfile(image, horizontal);
  const edges = mergeEdges(profile);
  if (edges.length < MIN_CELLS) return null;
  const gaps = edgeGaps(edges);
  const pitch = estimatePitch(gaps, length);
  if (!pitch) return null;
  return { length, profile, edges, gaps, pitch, best: pitchScore(gaps, pitch) };
}
function finishAxis(draft: AxisDraft, requested: number): AxisResult | null {
  const refined = refinePitch(draft.edges, requested);
  const lattice = Number.isFinite(refined) ? fitLattice(draft.edges, refined) : null;
  // A true lattice supplies its own exact pitch; otherwise keep the shared square-cell estimate.
  const pitch = lattice && lattice.share >= MIN_LATTICE_SHARE ? lattice.step : requested;
  if (!Number.isFinite(pitch) || pitch < MIN_PITCH || pitch > MAX_GRID_CELL_SIZE) return null;
  return {
    length: draft.length,
    profile: draft.profile,
    edges: draft.edges,
    pitch,
    lattice,
    meshCuts: buildMesh(draft.edges, pitch, draft.length),
  };
}
/**
 * Pixel-art cells are square, so both axes vote on one pitch. An axis keeps its own estimate when
 * that agrees with the pooled one, and otherwise adopts the pooled pitch if its edges support it.
 */
function sharedPitches(x: AxisDraft, y: AxisDraft): [number, number] {
  const pooled = estimatePitch([...x.gaps, ...y.gaps], Math.max(x.length, y.length));
  if (!pooled) return [x.pitch, y.pitch];
  const pick = (axis: AxisDraft) =>
    Math.max(axis.pitch, pooled) / Math.min(axis.pitch, pooled) <= SQUARE_TOLERANCE ||
    pitchScore(axis.gaps, pooled) < SQUARE_SUPPORT * axis.best
      ? axis.pitch
      : pooled;
  return [pick(x), pick(y)];
}
/**
 * How sharply the cuts sit on edges: the share of all edge energy within one pixel of a cut, and
 * the peak at the cuts against the energy at the cell middles (1 means edges ignore the grid).
 */
function sharpness(axis: AxisResult, cuts: readonly number[]): { share: number; contrast: number } {
  let total = 0;
  for (const value of axis.profile) total += value;
  if (!total) return { share: 0, contrast: 0 };
  const value = (i: number) => (i >= 1 && i < axis.length ? axis.profile[i] : 0);
  let peakSum = 0,
    midSum = 0,
    near = 0,
    mids = 0;
  const covered = new Set<number>();
  for (let i = 0; i < cuts.length; i++) {
    const peak = Math.max(value(cuts[i] - 1), value(cuts[i]), value(cuts[i] + 1));
    peakSum += peak;
    for (let d = -SHARP_WINDOW; d <= SHARP_WINDOW; d++)
      if (!covered.has(cuts[i] + d)) {
        covered.add(cuts[i] + d);
        near += value(cuts[i] + d);
      }
    if (i + 1 < cuts.length) {
      midSum += value(Math.floor((cuts[i] + cuts[i + 1]) / 2));
      mids++;
    }
  }
  const peakMean = peakSum / cuts.length;
  const midMean = midSum / Math.max(1, mids);
  return {
    share: Math.min(1, near / total),
    contrast: peakMean / Math.max(midMean, peakMean * 1e-3, CONTRAST_FLOOR),
  };
}
/** Share of cells whose central region is one flat colour. */
function flatShare(image: PixelBuffer, xCuts: readonly number[], yCuts: readonly number[]): number {
  const width = xCuts.length - 1,
    height = yCuts.length - 1;
  const budget = 4096;
  const stride = Math.max(1, Math.ceil((width * height) / budget));
  let flat = 0,
    measured = 0;
  for (let cell = 0; cell < width * height; cell += stride) {
    const cx = cell % width,
      cy = Math.floor(cell / width);
    const x0 = xCuts[cx],
      x1 = xCuts[cx + 1],
      y0 = yCuts[cy],
      y1 = yCuts[cy + 1];
    const mx = (x1 - x0) / 4,
      my = (y1 - y0) / 4;
    let reference = -1,
      ok = true;
    for (let j = 0; j < FLAT_SAMPLES && ok; j++)
      for (let i = 0; i < FLAT_SAMPLES && ok; i++) {
        const sx = Math.min(
          image.width - 1,
          Math.floor(x0 + mx + ((x1 - x0 - 2 * mx) * i) / (FLAT_SAMPLES - 1) - 1e-6),
        );
        const sy = Math.min(
          image.height - 1,
          Math.floor(y0 + my + ((y1 - y0 - 2 * my) * j) / (FLAT_SAMPLES - 1) - 1e-6),
        );
        const index = (Math.max(0, sy) * image.width + Math.max(0, sx)) * CHANNELS;
        if (reference < 0) reference = index;
        else if (colorStep(image.data, reference, index) > FLAT_RANGE) ok = false;
      }
    measured++;
    if (ok) flat++;
  }
  return measured ? flat / measured : 0;
}
const NO_GRID = (image: PixelBuffer): PixelGridAnalysis => ({
  width: 1,
  height: 1,
  cellWidth: image.width,
  cellHeight: image.height,
  offsetX: 0,
  offsetY: 0,
  confidence: 0,
  reliable: false,
});
const cache = new WeakMap<PixelBuffer, Analysis>();
function analysisOf(image: PixelBuffer): Analysis {
  assertPixelBuffer(image);
  let found = cache.get(image);
  if (!found) {
    const x = draftAxis(image, true),
      y = draftAxis(image, false);
    if (x && y) {
      const [px, py] = sharedPitches(x, y);
      found = { x: finishAxis(x, px), y: finishAxis(y, py) };
    } else found = { x: null, y: null };
    releaseNeighbourSteps(image);
    cache.set(image, found);
  }
  return found;
}
function judge(
  image: PixelBuffer,
  x: AxisResult,
  y: AxisResult,
  xCuts: number[],
  yCuts: number[],
  extra: number,
): { confidence: number; reliable: boolean } {
  const width = xCuts.length - 1,
    height = yCuts.length - 1;
  const sx = sharpness(x, xCuts),
    sy = sharpness(y, yCuts);
  const sharp = Math.min(sx.share, sy.share);
  const flat = flatShare(image, xCuts, yCuts);
  const confidence = sharp * flat * extra;
  const reliable =
    width >= MIN_CELLS &&
    height >= MIN_CELLS &&
    width * height >= MIN_GRID_CELLS &&
    width <= MAX_RECOVERED_GRID_SIZE &&
    height <= MAX_RECOVERED_GRID_SIZE &&
    sx.share >= MIN_SHARP_SHARE &&
    sy.share >= MIN_SHARP_SHARE &&
    sx.contrast >= MIN_CONTRAST &&
    sy.contrast >= MIN_CONTRAST &&
    flat >= MIN_FLAT_SHARE;
  return { confidence, reliable };
}
/** One lattice (step + offset per axis) fitted to all edges; precise when the grid really is uniform. */
export function detectUniformGrid(image: PixelBuffer): PixelGridAnalysis {
  const { x, y } = analysisOf(image);
  if (!x?.lattice || !y?.lattice) return NO_GRID(image);
  const lx = x.lattice,
    ly = y.lattice;
  const xCuts = mergeSlivers(pixelGridCuts(image.width, lx.step, lx.offset), lx.step),
    yCuts = mergeSlivers(pixelGridCuts(image.height, ly.step, ly.offset), ly.step);
  const consistency = Math.min(lx.share, ly.share);
  const residual = Math.max(lx.residual, ly.residual);
  const verdict = judge(image, x, y, xCuts, yCuts, consistency);
  return {
    width: xCuts.length - 1,
    height: yCuts.length - 1,
    cellWidth: lx.step,
    cellHeight: ly.step,
    offsetX: lx.offset,
    offsetY: ly.offset,
    cutsX: xCuts,
    cutsY: yCuts,
    confidence: verdict.confidence,
    reliable:
      verdict.reliable && consistency >= MIN_LATTICE_SHARE && residual <= MAX_LATTICE_RESIDUAL,
  };
}
/** Cuts anchored on edges, so irregular or slightly distorted cell sizes survive. */
export function detectMeshGrid(image: PixelBuffer): PixelGridAnalysis {
  const { x, y } = analysisOf(image);
  if (!x || !y) return NO_GRID(image);
  const verdict = judge(image, x, y, x.meshCuts, y.meshCuts, 1);
  return {
    width: x.meshCuts.length - 1,
    height: y.meshCuts.length - 1,
    cellWidth: image.width / (x.meshCuts.length - 1),
    cellHeight: image.height / (y.meshCuts.length - 1),
    offsetX: 0,
    offsetY: 0,
    cutsX: x.meshCuts,
    cutsY: y.meshCuts,
    ...verdict,
  };
}
