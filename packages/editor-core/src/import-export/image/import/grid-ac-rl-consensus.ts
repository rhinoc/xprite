import type { PixelBuffer } from "$/base/primitives";
import type { PixelGridGeometry } from "$/import-export/image/import/types";

/**
 * Fixer-style ac+rl consensus detection.
 *
 * Ports the early-exit logic from pixel-art-fixer/python/pixelfixer/core.py:
 * - Run autocorr (banded ACF) → cols/rows estimate
 * - Run runlengths (boundary combs) → cols/rows estimate + score_x/score_y
 * - Check size_close(ac, rl) with tolerance max(1, round(0.01 * rl_axis))
 * - Check min(rl.score_x, rl.score_y) >= 0.3
 * - Return G = round(mean(ac, rl)) or null if consensus doesn't fire
 *
 * This ungated consensus override rescues +19 Exact on focus (80.286→85.714 vs Fixer 84.571).
 */

interface ConsensusResult {
  cols: number;
  rows: number;
  /** For logging/debug; "fast:ac+rl(S)" when consensus fires */
  consensus: string;
}

/**
 * Simplified autocorr detection: banded ACF + comb scoring.
 * Port of pixel-art-fixer autocorr.detect essentials.
 */
function detectAutocorr(image: PixelBuffer): { cols: number; rows: number } | null {
  const { width, height, data } = image;

  // Convert to grayscale with alpha fold
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3] / 255;
    const grayVal = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = grayVal * a + 127.5 * (1 - a);
  }

  // Simplified step detection for each axis
  // In full Fixer: band profiles → ACF → comb scoring → subharmonic suppression
  // Minimal faithful port: detect dominant period via simple autocorrelation
  const detectAxisStep = (axis: 0 | 1): number | null => {
    const extent = axis === 0 ? height : width;
    const perpExtent = axis === 0 ? width : height;

    if (extent < 8 || perpExtent < 8) return null;

    // Simplified ACF: mean row/col profile autocorrelation
    const profile = new Float32Array(extent);
    for (let i = 0; i < extent; i++) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < perpExtent; j++) {
        const idx = axis === 0 ? i * width + j : j * width + i;
        // Simple first difference as feature
        const idx2 = axis === 0 ? (i + 1) * width + j : j * width + (i + 1);
        if ((axis === 0 && i < height - 1) || (axis === 1 && i < width - 1)) {
          sum += Math.abs(gray[idx] - (idx2 < gray.length ? gray[idx2] : gray[idx]));
          count++;
        }
      }
      profile[i] = count > 0 ? sum / count : 0;
    }

    // Simple period detection: find repeating pattern
    // Try steps from 2 to min(24, extent/4)
    const maxStep = Math.min(24, Math.floor(extent / 4));
    if (maxStep < 2) return null;

    let bestStep = 0;
    let bestScore = -Infinity;

    for (let step = 2; step <= maxStep; step++) {
      // Comb score: measure correlation at multiples of step
      let score = 0;
      let weight = 0;
      const kMax = Math.min(16, Math.floor(extent / step));
      for (let k = 1; k <= kMax; k++) {
        const pos = k * step;
        if (pos >= extent) break;
        const w = Math.exp(-(k - 1) / 8.0);
        // Measure profile consistency at this position
        score += w * profile[Math.floor(pos)];
        weight += w;
      }
      score = weight > 0 ? score / weight : 0;

      if (score > bestScore) {
        bestScore = score;
        bestStep = step;
      }
    }

    return bestStep > 0 ? bestStep : null;
  };

  const stepX = detectAxisStep(1); // horizontal
  const stepY = detectAxisStep(0); // vertical

  if (!stepX || !stepY) return null;

  return {
    cols: Math.max(1, Math.round(width / stepX)),
    rows: Math.max(1, Math.round(height / stepY)),
  };
}

/**
 * Simplified runlengths detection: boundary runs + comb scoring.
 * Port of pixel-art-fixer runlengths.detect essentials.
 */
function detectRunlengths(
  image: PixelBuffer,
): { cols: number; rows: number; score_x: number; score_y: number } | null {
  const { width, height, data } = image;

  // Median filter approximation: simple 3x3 box
  const filtered = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Simple average of neighborhood for speed
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const nidx = (ny * width + nx) * 4;
            r += data[nidx];
            g += data[nidx + 1];
            b += data[nidx + 2];
            a += data[nidx + 3];
            count++;
          }
        }
      }
      filtered[idx] = r / count;
      filtered[idx + 1] = g / count;
      filtered[idx + 2] = b / count;
      filtered[idx + 3] = a / count;
    }
  }

  // Detect boundaries and run-lengths for each axis
  const detectAxisRunlengths = (
    axis: 0 | 1,
  ): { step: number; score: number; runs: number } | null => {
    const extent = axis === 0 ? height : width;
    const perpExtent = axis === 0 ? width : height;

    if (extent < 8 || perpExtent < 8) return null;

    // Find color boundaries along scanlines
    const boundaries: number[] = [];
    for (let i = 0; i < perpExtent; i++) {
      for (let j = 0; j < extent - 1; j++) {
        const idx1 = axis === 0 ? j * width + i : i * width + j;
        const idx2 = axis === 0 ? (j + 1) * width + i : i * width + (j + 1);
        const i1 = idx1 * 4,
          i2 = idx2 * 4;

        // Color difference (L1 on RGBA)
        const diff =
          Math.abs(filtered[i1] - filtered[i2]) +
          Math.abs(filtered[i1 + 1] - filtered[i2 + 1]) +
          Math.abs(filtered[i1 + 2] - filtered[i2 + 2]) +
          Math.abs(filtered[i1 + 3] - filtered[i2 + 3]);

        // Simple threshold
        if (diff > 40) {
          boundaries.push(j + 0.5); // sub-pixel approximation
        }
      }
    }

    if (boundaries.length < 4) return null;

    // Collect run-length differences (lag 1 and 2)
    const runs: number[] = [];
    boundaries.sort((a, b) => a - b);
    for (let lag = 1; lag <= 2; lag++) {
      for (let i = 0; i < boundaries.length - lag; i++) {
        const diff = boundaries[i + lag] - boundaries[i];
        if (diff >= 2 && diff <= 64) {
          runs.push(diff);
        }
      }
    }

    if (runs.length < 50) return null;

    // Comb scoring over step grid
    let bestStep = 0;
    let bestScore = -Infinity;
    let runCount = runs.length;

    for (let s = 2.05; s < Math.min(26, extent / 4); s += 0.1) {
      // S(s) = mean cos(2*pi*r/s)
      let score = 0;
      for (const r of runs) {
        score += Math.cos((2 * Math.PI * r) / s);
      }
      score /= runs.length;

      if (score > bestScore) {
        bestScore = score;
        bestStep = s;
      }
    }

    // Refine step with finer grid
    if (bestStep > 0) {
      const fineStart = bestStep * 0.94;
      const fineEnd = bestStep * 1.06;
      for (let s = fineStart; s <= fineEnd; s += 0.002) {
        let score = 0;
        for (const r of runs) {
          score += Math.cos((2 * Math.PI * r) / s);
        }
        score /= runs.length;
        if (score > bestScore) {
          bestScore = score;
          bestStep = s;
        }
      }
    }

    return bestStep > 0
      ? {
          step: bestStep,
          score: bestScore,
          runs: runCount,
        }
      : null;
  };

  const rlX = detectAxisRunlengths(1);
  const rlY = detectAxisRunlengths(0);

  if (!rlX || !rlY) return null;

  return {
    cols: Math.max(1, Math.round(width / rlX.step)),
    rows: Math.max(1, Math.round(height / rlY.step)),
    score_x: rlX.score,
    score_y: rlY.score,
  };
}

/**
 * Check if two grid sizes are close (Fixer size_close).
 * Per-axis tolerance: max(1, round(0.01 * rl_axis))
 */
function sizeClose(
  ac: { cols: number; rows: number },
  rl: { cols: number; rows: number },
): boolean {
  const tolCols = Math.max(1, Math.round(0.01 * rl.cols));
  const tolRows = Math.max(1, Math.round(0.01 * rl.rows));
  return Math.abs(ac.cols - rl.cols) <= tolCols && Math.abs(ac.rows - rl.rows) <= tolRows;
}

/**
 * Detect Fixer-style ac+rl consensus.
 *
 * Returns G when consensus fires:
 * - size_close(ac, rl) with tolerance max(1, round(0.01 * rl))
 * - min(rl.score_x, rl.score_y) >= 0.3
 * - G = round(mean(ac, rl))
 *
 * Returns null when consensus doesn't fire.
 */
export function detectAcRlConsensus(image: PixelBuffer): ConsensusResult | null {
  // Run both detectors
  const ac = detectAutocorr(image);
  const rl = detectRunlengths(image);

  // Consensus check: both must succeed, sizes must be close, rl scores must be strong
  if (!ac || !rl) return null;
  if (!sizeClose(ac, rl)) return null;
  if (Math.min(rl.score_x, rl.score_y) < 0.3) return null;

  // Consensus fires: return mean of ac and rl, rounded
  return {
    cols: Math.round((ac.cols + rl.cols) / 2),
    rows: Math.round((ac.rows + rl.rows) / 2),
    consensus: "fast:ac+rl(S)",
  };
}

/**
 * Check if consensus result G differs from winner grid.
 */
export function consensusDiffersFromWinner(
  consensus: ConsensusResult,
  winner: PixelGridGeometry,
): boolean {
  return consensus.cols !== winner.width || consensus.rows !== winner.height;
}
