import type { PixelBuffer } from "$/base/primitives";
import {
  MAX_GRID_CELL_SIZE,
  MAX_RECOVERED_GRID_SIZE,
  pixelGridCuts,
} from "$/import-export/image/import/grid";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

/**
 * Boundary run-length comb period detection for painterly and similar inputs where soft pitch
 * search and edge detection may fail. Counts run lengths of the same boundary color along the
 * image edges, scores uniform step hypotheses by how well they comb those runs, and proposes
 * lattices whose periods match the detected step on each axis.
 *
 * This is an additional candidate source that feeds the arbiter alongside edge/uniform/pitch
 * detectors; it does not replace them. The arbiter's min-DL still chooses the final grid among
 * all proposals and the passthrough baseline.
 */

const MIN_STEP = 2.0;
const MIN_CELLS = 4;
const MIN_GRID_CELLS = 16;
const MAX_STEP_SEARCH = 48; // Expanded to cover larger periods
const STEP_INCREMENT = 0.05; // Finer granularity for better precision
/** Number of top-scoring periods to consider per axis. */
const MAX_CANDIDATES_PER_AXIS = 8;
/** Exponential weight decay for successive comb teeth (k0 in the reference). */
const DECAY_CONSTANT = 12.0;
/** Maximum teeth count (comb order) when scoring a period. */
const MAX_COMB_ORDER = 24;

interface RunLengthCandidate {
  step: number;
  score: number;
}

/**
 * Extract run lengths of consecutive similar colors across sampled lines.
 * Uses a more permissive threshold to catch soft edges in painterly inputs.
 */
function extractColorRuns(image: PixelBuffer, horizontal: boolean): number[] {
  const { width, height, data } = image;
  const scanLength = horizontal ? width : height;
  const crossLength = horizontal ? height : width;

  // Sample more lines for better statistics
  const maxSampledLines = 128;
  const stride = Math.max(1, Math.floor(crossLength / maxSampledLines));

  const runs: number[] = [];
  // Looser threshold for painterly/blurred edges
  const COLOR_THRESHOLD = 30;

  for (let line = 0; line < crossLength; line += stride) {
    let runLength = 0;
    let lastR = -1,
      lastG = -1,
      lastB = -1,
      lastA = -1;

    for (let i = 0; i < scanLength; i++) {
      const pixelIndex = horizontal ? (line * width + i) * 4 : (i * width + line) * 4;

      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      const a = data[pixelIndex + 3];

      // Check if color is similar to previous pixel
      let similar = false;
      if (lastR >= 0) {
        const dist = Math.sqrt((r - lastR) ** 2 + (g - lastG) ** 2 + (b - lastB) ** 2);
        const alphaDiff = Math.abs(a - lastA);
        similar = dist <= COLOR_THRESHOLD && alphaDiff <= 40;
      }

      if (i === 0 || similar) {
        runLength++;
      } else {
        if (runLength > 0) runs.push(runLength);
        runLength = 1;
      }

      lastR = r;
      lastG = g;
      lastB = b;
      lastA = a;
    }

    if (runLength > 0) runs.push(runLength);
  }

  return runs;
}

/**
 * Score a period hypothesis using a comb-anticomb approach on run lengths.
 * Comb peaks at k*step, anticomb at k*step ± 0.5*step.
 * A true period will have strong alignment at multiples of the step.
 */
function scorePeriod(runs: readonly number[], step: number): number {
  if (runs.length < 2 || step < MIN_STEP) return -1;

  // Build histogram of run lengths
  const histogram = new Map<number, number>();
  let maxRun = 0;
  let totalRuns = 0;
  for (const run of runs) {
    histogram.set(run, (histogram.get(run) || 0) + 1);
    maxRun = Math.max(maxRun, run);
    totalRuns++;
  }

  const maxK = Math.min(MAX_COMB_ORDER, Math.floor(maxRun / step));
  if (maxK < 2) return -1;

  let combScore = 0;
  let antiCombScore = 0;
  let totalWeight = 0;

  // Comb-anticomb scoring: measure alignment vs offset
  for (let k = 1; k <= maxK; k++) {
    const target = k * step;
    const weight = Math.exp(-(k - 1) / DECAY_CONSTANT);
    totalWeight += weight;

    // Window for "near" the target
    const window = Math.max(0.5, step * 0.12);

    // Comb: count runs near k*step
    let combCount = 0;
    // Anticomb: count runs near k*step ± 0.5*step
    let antiCombCount = 0;

    const offsetLeft = target - 0.5 * step;
    const offsetRight = target + 0.5 * step;

    for (const [runLength, count] of histogram) {
      const distTarget = Math.abs(runLength - target);
      const distLeft = Math.abs(runLength - offsetLeft);
      const distRight = Math.abs(runLength - offsetRight);

      if (distTarget <= window) {
        combCount += count;
      }
      if (distLeft <= window || distRight <= window) {
        antiCombCount += count;
      }
    }

    combScore += weight * combCount;
    antiCombScore += weight * antiCombCount;
  }

  // Normalize by total weight and runs
  if (totalWeight === 0 || totalRuns === 0) return -1;

  const normalizedComb = combScore / (totalWeight * totalRuns);
  const normalizedAntiComb = antiCombScore / (totalWeight * totalRuns);

  // Return comb - anticomb difference
  return normalizedComb - normalizedAntiComb;
}

/**
 * Search for the best period (step size) on one axis by scoring many candidates
 * and returning the top scorers.
 */
function searchAxisPeriod(runs: readonly number[], maxStep: number): RunLengthCandidate[] {
  const candidates: RunLengthCandidate[] = [];

  for (let step = MIN_STEP; step <= maxStep; step += STEP_INCREMENT) {
    const score = scorePeriod(runs, step);
    if (score > 0) {
      candidates.push({ step, score });
    }
  }

  // Sort by score descending and take top candidates
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, MAX_CANDIDATES_PER_AXIS);
}

/**
 * Detect a grid using boundary run-length comb period search. Returns multiple
 * candidates (one per top-scoring period combination) for the arbiter to evaluate.
 */
export function detectBoundaryPeriodGrids(image: PixelBuffer): PixelGridAnalysis[] {
  const { width, height } = image;

  const minStep = Math.max(MIN_STEP, Math.max(width, height) / MAX_RECOVERED_GRID_SIZE);
  const maxStepX = Math.min(MAX_STEP_SEARCH, Math.min(MAX_GRID_CELL_SIZE, width / MIN_CELLS));
  const maxStepY = Math.min(MAX_STEP_SEARCH, Math.min(MAX_GRID_CELL_SIZE, height / MIN_CELLS));

  if (maxStepX < minStep || maxStepY < minStep) return [];

  // Extract color runs across sampled lines
  const xRuns = extractColorRuns(image, true);
  const yRuns = extractColorRuns(image, false);

  if (xRuns.length < 2 || yRuns.length < 2) return [];

  // Search for periods on each axis
  const xCandidates = searchAxisPeriod(xRuns, maxStepX);
  const yCandidates = searchAxisPeriod(yRuns, maxStepY);

  if (xCandidates.length === 0 || yCandidates.length === 0) return [];

  // Generate grid proposals from period combinations.
  // For each axis step, emit covering lattices at floor/round/ceil cell counts so a step
  // that lands between two integers (e.g. 826/2.35 ≈ 351.5) still proposes the true count.
  const grids: PixelGridAnalysis[] = [];
  const seen = new Set<string>();

  /**
   * Covering cell counts for a period: always the nearest integer, plus the other side when
   * length/step is near halfway (so 826/2.35 ≈ 351.5 still proposes 352). Far-from-half
   * fractions (545/2.35 ≈ 231.91) keep only the rounded count — emitting the farther floor
   * let a lower-residual wrong height win on painterly inputs.
   */
  const countNeighbors = (length: number, step: number): number[] => {
    const exact = length / step;
    if (!Number.isFinite(exact) || exact <= 0) return [];
    const rounded = Math.round(exact);
    const neighbors = [rounded];
    const frac = exact - Math.floor(exact);
    if (frac > 0.35 && frac < 0.65) {
      const other = frac >= 0.5 ? Math.floor(exact) : Math.ceil(exact);
      if (other > 0 && other !== rounded) neighbors.push(other);
    }
    return neighbors;
  };

  for (const xCand of xCandidates.slice(0, 3)) {
    for (const yCand of yCandidates.slice(0, 3)) {
      const confidence = Math.min(xCand.score, yCand.score);
      for (const cols of countNeighbors(width, xCand.step)) {
        for (const rows of countNeighbors(height, yCand.step)) {
          if (
            cols < MIN_CELLS ||
            rows < MIN_CELLS ||
            cols * rows < MIN_GRID_CELLS ||
            cols > MAX_RECOVERED_GRID_SIZE ||
            rows > MAX_RECOVERED_GRID_SIZE
          ) {
            continue;
          }
          const key = `${cols}x${rows}`;
          if (seen.has(key)) continue;
          seen.add(key);

          // Image-covering lattice for the cell counts (not the raw float step).
          const coverWidth = width / cols;
          const coverHeight = height / rows;
          const cutsX = pixelGridCuts(width, coverWidth, 0);
          const cutsY = pixelGridCuts(height, coverHeight, 0);

          grids.push({
            width: cols,
            height: rows,
            cellWidth: coverWidth,
            cellHeight: coverHeight,
            offsetX: 0,
            offsetY: 0,
            cutsX,
            cutsY,
            confidence,
            reliable: true,
            algorithm: PixelationAlgorithm.UniformGrid,
          });
        }
      }
    }
  }

  return grids;
}

/**
 * Returns the top-scored boundary period grid, or unreliable when none found.
 * This is the single-hypothesis interface for registry entries; the multi-hypothesis
 * version above feeds the arbiter's candidate pool.
 */
export function detectBoundaryPeriodGrid(image: PixelBuffer): PixelGridAnalysis {
  const grids = detectBoundaryPeriodGrids(image);
  if (grids.length === 0) {
    return {
      width: 1,
      height: 1,
      cellWidth: image.width,
      cellHeight: image.height,
      offsetX: 0,
      offsetY: 0,
      confidence: 0,
      reliable: false,
    };
  }
  return grids[0];
}
