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
const MAX_STEP_SEARCH = 32;
const STEP_INCREMENT = 0.1;
/** Number of top-scoring periods to consider per axis. */
const MAX_CANDIDATES_PER_AXIS = 6;
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
 * A run is a sequence of pixels whose color difference is below a threshold.
 * Returns histogram of run lengths for period detection.
 */
function extractColorRuns(image: PixelBuffer, horizontal: boolean): number[] {
  const { width, height, data } = image;
  const scanLength = horizontal ? width : height;
  const crossLength = horizontal ? height : width;

  // Sample lines with stride to limit work on large images
  const maxSampledLines = 64;
  const stride = Math.max(1, Math.floor(crossLength / maxSampledLines));

  const runs: number[] = [];
  const COLOR_THRESHOLD = 20; // RGB distance threshold for "same color"

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
        // Weight alpha difference
        const alphaDiff = Math.abs(a - lastA);
        similar = dist <= COLOR_THRESHOLD && alphaDiff <= 30;
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
 * Score a period hypothesis by measuring how well it directly matches the observed run lengths.
 * Prefer periods that match the actual run lengths over periods that are factors.
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

  // Primary score: how many runs directly match the step (k=1)?
  const window = Math.max(0.5, step * 0.1);
  let directMatches = 0;
  for (const [runLength, count] of histogram) {
    if (Math.abs(runLength - step) <= window) {
      directMatches += count;
    }
  }

  const directScore = directMatches / totalRuns;

  // Secondary score: harmonic alignment for multiples
  const maxK = Math.min(MAX_COMB_ORDER, Math.floor(maxRun / step));
  let harmonicScore = 0;
  let totalWeight = 0;

  for (let k = 2; k <= maxK; k++) {
    const target = k * step;
    const weight = Math.exp(-(k - 1) / DECAY_CONSTANT);
    totalWeight += weight;

    let matchCount = 0;
    for (const [runLength, count] of histogram) {
      if (Math.abs(runLength - target) <= window * k) {
        matchCount += count;
      }
    }

    harmonicScore += (weight * matchCount) / totalRuns;
  }

  const normalizedHarmonic = totalWeight > 0 ? harmonicScore / totalWeight : 0;

  // Heavily weight direct matches (80%) vs harmonics (20%)
  return directScore * 0.8 + normalizedHarmonic * 0.2;
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

  // Generate grid proposals from period combinations
  const grids: PixelGridAnalysis[] = [];

  // Try top candidate from each axis
  for (const xCand of xCandidates.slice(0, 3)) {
    for (const yCand of yCandidates.slice(0, 3)) {
      const cellWidth = xCand.step;
      const cellHeight = yCand.step;
      const cols = Math.round(width / cellWidth);
      const rows = Math.round(height / cellHeight);

      // Check cell count constraints
      if (
        cols < MIN_CELLS ||
        rows < MIN_CELLS ||
        cols * rows < MIN_GRID_CELLS ||
        cols > MAX_RECOVERED_GRID_SIZE ||
        rows > MAX_RECOVERED_GRID_SIZE
      ) {
        continue;
      }

      // Build the lattice with the detected periods
      const cutsX = pixelGridCuts(width, cellWidth, 0);
      const cutsY = pixelGridCuts(height, cellHeight, 0);

      // Confidence is the minimum of the two axis scores
      const confidence = Math.min(xCand.score, yCand.score);

      grids.push({
        width: cols,
        height: rows,
        cellWidth,
        cellHeight,
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
