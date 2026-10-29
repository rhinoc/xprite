import type { PixelBuffer } from "$/base/primitives";
import { forgetNeighbourSteps } from "$/import-export/image/import/color-step";
import { estimateTilt, straighten } from "$/import-export/image/import/deskew";
import { blockPartition } from "$/import-export/image/import/grid";
import { detectAcRlConsensus } from "$/import-export/image/import/grid-ac-rl-consensus";
import {
  arbitrateGrids,
  gridEvidence,
  octaveShortfall,
  phaseScore,
  type ArbitratedGrid,
} from "$/import-export/image/import/grid-arbitrate";
import { detectMeshGrid, detectUniformGrid } from "$/import-export/image/import/grid-detect";
import { detectFrameLattices, FrameModel } from "$/import-export/image/import/grid-frame-lattice";
import { detectBoundaryPeriodGrids } from "$/import-export/image/import/grid-period-boundary";
import { combCountGrids } from "$/import-export/image/import/grid-period-comb";
import { distanceCountGrids } from "$/import-export/image/import/grid-period-distance";
import { recoverGrid } from "$/import-export/image/import/grid-sample";
import { resizeBox } from "$/import-export/image/import/resize";
import {
  CellColorPicker,
  PixelationAlgorithm,
  type PixelGridAnalysis,
  type PixelGridGeometry,
  type PixelationSize,
} from "$/import-export/image/import/types";

/**
 * A grid proposer: takes an image and returns zero or more candidate grids. Auto runs every
 * proposer per evaluation view, collects their candidates, and arbitrates them in one decision.
 */
type GridProposer = (image: PixelBuffer) => PixelGridAnalysis[];

/**
 * Skip bd_dist proposer on large images (area >= 1M pixels) where it returns 0 useful candidates.
 * Same function ref used in both PROPOSERS and corroboratingProposers so BD_DIST_INDEX stays correct.
 */
const _distanceCountGridsLargeAreaSkip: GridProposer = (image) =>
  image.width * image.height >= 1_000_000 ? [] : distanceCountGrids(image);

/**
 * Skip comb proposer on large images (area >= 1M pixels) where frame already covers the grid.
 * Same function ref used in both PROPOSERS and corroboratingProposers.
 */
const _combCountGridsLargeAreaSkip: GridProposer = (image) =>
  image.width * image.height >= 1_000_000 ? [] : combCountGrids(image);

/**
 * Soft-only frame on large images (area >= 1M pixels) with cheaper energy/recon sampling.
 * Same function ref used in both PROPOSERS and corroboratingProposers.
 */
const _frameLatticesSoftOnlyLargeArea: GridProposer = (image) =>
  image.width * image.height >= 1_000_000
    ? detectFrameLattices(image, [FrameModel.Soft])
    : detectFrameLattices(image);

export interface PixelationAlgorithmEntry {
  /** i18n key of the label shown in the import dialog and preferences. */
  readonly label: string;
  /** Whether the import dialog offers this entry; the plain resize is only Auto's fallback. */
  readonly listed: boolean;
  detect(image: PixelBuffer, size?: PixelationSize): PixelGridAnalysis;
  /** One output pixel per grid cell. */
  run(image: PixelBuffer, grid: PixelGridGeometry, picker: CellColorPicker): PixelBuffer;
}

const unreliable = (image: PixelBuffer): PixelGridAnalysis => ({
  width: 1,
  height: 1,
  cellWidth: image.width,
  cellHeight: image.height,
  offsetX: 0,
  offsetY: 0,
  confidence: 0,
  reliable: false,
  algorithm: PixelationAlgorithm.Resize,
});

/**
 * One detection call's shared work: Auto runs several grid algorithms on the same image, and each
 * straightens it the same way (the tilt and the edge analysis are cached per image). Kept only
 * while the call runs; recovery straightens its own copy.
 */
let detection: { image: PixelBuffer; upright?: PixelBuffer } | null = null;
function uprightOf(image: PixelBuffer, angle: number): PixelBuffer {
  if (detection?.image !== image) return straighten(image, angle);
  if (!detection.upright) detection.upright = straighten(image, angle);
  return detection.upright;
}

/**
 * Every proposer Auto runs. Each proposer runs on each evaluation view; their candidates compete
 * equally in arbitration.
 */
const PROPOSERS: readonly GridProposer[] = [
  (image): PixelGridAnalysis[] => {
    // Large images (area >= 1M): skip uniform+mesh (shared analysisOf).
    if (image.width * image.height >= 1_000_000) return [];
    const grid = detectUniformGrid(image);
    return grid.reliable
      ? [{ ...grid, algorithm: PixelationAlgorithm.UniformGrid, reliable: true }]
      : [];
  },
  (image): PixelGridAnalysis[] => {
    // Large images (area >= 1M): skip uniform+mesh (shared analysisOf).
    if (image.width * image.height >= 1_000_000) return [];
    const grid = detectMeshGrid(image);
    return grid.reliable
      ? [{ ...grid, algorithm: PixelationAlgorithm.EdgeGrid, reliable: true }]
      : [];
  },
  _frameLatticesSoftOnlyLargeArea,
  _combCountGridsLargeAreaSkip,
  detectBoundaryPeriodGrids,
  _distanceCountGridsLargeAreaSkip,
];

/**
 * Detect on a straightened copy when the image carries a convincing tilt; the grid then records
 * the rotation so recovery straightens the same way. A tilt beyond the search range, or a
 * straightened image that still has no reliable grid, is refused rather than guessed from the
 * tilted pixels (those yield confident but wrong grids). Used for manual algorithm selection.
 */
const deskewed =
  (algorithm: PixelationAlgorithm, detect: (image: PixelBuffer) => PixelGridAnalysis) =>
  (image: PixelBuffer): PixelGridAnalysis => {
    const tilt = estimateTilt(image);
    if (tilt.extreme) return unreliable(image);
    if (!tilt.angle) return { ...detect(image), algorithm };
    const found = detect(uprightOf(image, tilt.angle));
    return found.reliable ? { ...found, rotation: tilt.angle, algorithm } : unreliable(image);
  };

const FALLBACK = PixelationAlgorithm.Resize;
const DEFAULT_CUSTOM_SIZE = 64;

/** Even blocks of the requested size; without one, the size a photo is shrunk to by default. */
const customSize = (image: PixelBuffer, size?: PixelationSize): PixelGridAnalysis => {
  const scale = Math.min(1, DEFAULT_CUSTOM_SIZE / Math.max(image.width, image.height));
  return {
    ...blockPartition(
      image,
      size?.width ?? image.width * scale,
      size?.height ?? image.height * scale,
    ),
    confidence: 1,
    reliable: true,
  };
};

/**
 * Minimum number of proposers that must agree on a lattice size for corroborated admission.
 * When arbitration refuses (passthrough wins), if this many proposers agree on a strict lattice,
 * admit the best-phaseScore corroborated lattice instead of falling through to passthrough.
 */
const MIN_CORROBORATORS = 2;

/**
 * Maximum candidates to pass to arbitration. Description-length scoring scales O(pixels),
 * and each candidate requires strip computation + phase field. Pruning reduces latency
 * while preserving high-confidence and diverse-dimension candidates.
 */
const MAX_ARBITRATION_CANDIDATES = 6;

/**
 * Prune candidates before expensive DL/arbitration to reduce latency.
 * Strategy: dedupe near-dimensions (±1), keep highest confidence per size class, cap total.
 * Preserves Exact by keeping diverse sizes and high-confidence candidates.
 * Always keeps WASM consensus candidate (if present) to enable consensus override.
 */
function pruneCandidatesBeforeArbitration(
  candidates: PixelGridAnalysis[],
  wasmConsensus?: { cols: number; rows: number } | null,
): PixelGridAnalysis[] {
  if (candidates.length <= MAX_ARBITRATION_CANDIDATES) return candidates;

  // Always keep WASM consensus candidate if present
  const wasmCandidate = wasmConsensus
    ? candidates.find(
        (c) => c.width === wasmConsensus.cols && c.height === wasmConsensus.rows && c.reliable,
      )
    : undefined;

  // Group by similar dimensions (within ±1 on both width and height)
  const groups = new Map<string, PixelGridAnalysis[]>();
  for (const cand of candidates) {
    // Use rounded dimensions as group key to cluster near-identical sizes
    const key = `${cand.width}×${cand.height}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(cand);
  }

  // Keep best (highest confidence) from each group
  const pruned: PixelGridAnalysis[] = [];
  for (const group of groups.values()) {
    // Sort by confidence desc, then by cellWidth*cellHeight asc (prefer smaller cells)
    const sorted = group.sort(
      (a, b) =>
        b.confidence - a.confidence || a.cellWidth * a.cellHeight - b.cellWidth * b.cellHeight,
    );
    pruned.push(sorted[0]);
  }

  // If still over limit, keep highest-confidence candidates
  if (pruned.length > MAX_ARBITRATION_CANDIDATES) {
    pruned.sort((a, b) => b.confidence - a.confidence);
    const limited = pruned.slice(0, MAX_ARBITRATION_CANDIDATES);
    // Ensure WASM candidate is in the limited set
    if (wasmCandidate && !limited.includes(wasmCandidate)) {
      limited[limited.length - 1] = wasmCandidate;
    }
    return limited;
  }

  return pruned;
}

/**
 * Auto: every proposer runs on each evaluation view (扶正 and/or 原图), their candidates compete
 * in one arbitration per view (see grid-arbitrate), and the passthrough is one more candidate in
 * each. When the image carries a tilt, the upright view is tried; when no proposer finds a
 * reliable grid there (soft edges), the original competes as well, so a false tilt does not hide
 * the upright grid.
 *
 * Performance: Call preloadWasm() during app/worker initialization to prewarm WASM module.
 * Proposers run sequentially (JavaScript single-threaded); future: Web Workers for true parallelization.
 */
function autoGrid(image: PixelBuffer): PixelGridAnalysis {
  const tilt = estimateTilt(image);
  if (tilt.extreme) return unreliable(image);

  // Determine evaluation views
  const rings: { image: PixelBuffer; rotation: number }[] = [];
  if (tilt.angle) rings.push({ image: uprightOf(image, tilt.angle), rotation: tilt.angle });

  // Run all proposers on the upright view; if none find a grid, also try the original
  const uprightCandidates = tilt.angle
    ? PROPOSERS.flatMap((proposer) => proposer(rings[0].image)).filter((grid) => grid.reliable)
    : [];
  if (!tilt.angle || uprightCandidates.length === 0) rings.push({ image, rotation: 0 });

  // Specific proposers for corroborated admission: frame, comb, bd, bd_dist
  const corroboratingProposers = [
    _frameLatticesSoftOnlyLargeArea,
    _combCountGridsLargeAreaSkip,
    detectBoundaryPeriodGrids,
    _distanceCountGridsLargeAreaSkip,
  ];

  // Arbitrate each view: all proposers run on this view
  let best: { score: number; grid: PixelGridAnalysis; rotation: number } | null = null;
  for (const ring of rings) {
    // Run each proposer once and track outputs with their corroboration index
    const proposerOutputs = PROPOSERS.map((proposer) => {
      const grids = proposer(ring.image);
      const corrobIndex = corroboratingProposers.indexOf(proposer);
      return { grids, corrobIndex };
    });

    // Build candidates list from all proposer outputs
    const candidates = proposerOutputs.flatMap(({ grids }) =>
      grids.map((grid) => (ring.rotation ? { ...grid, rotation: ring.rotation } : grid)),
    );

    // Tag candidates from corroborating proposers (reuse outputs, no re-run)
    const tagged = proposerOutputs
      .filter(({ corrobIndex }) => corrobIndex >= 0)
      .flatMap(({ grids, corrobIndex }) =>
        grids.map((grid) => ({
          grid: ring.rotation ? { ...grid, rotation: ring.rotation } : grid,
          proposerIndex: corrobIndex,
        })),
      );

    // Detect WASM consensus early to preserve consensus candidate during pruning
    const consensus =
      ring.image.width * ring.image.height >= 1_000_000
        ? null
        : detectAcRlConsensus(ring.image);

    // WASM-first short-circuit: when consensus fires and candidate@G exists, skip expensive full arb
    let winner: ArbitratedGrid | null = null;
    if (consensus) {
      const candidateAtG = candidates.find(
        (c) => c.width === consensus.cols && c.height === consensus.rows && c.reliable,
      );
      if (candidateAtG) {
        // Score just the G candidate + near-G alternatives (±1 dimension) for safety
        const nearGCandidates = candidates.filter(
          (c) =>
            c.reliable &&
            Math.abs(c.width - consensus.cols) <= 1 &&
            Math.abs(c.height - consensus.rows) <= 1,
        );
        // Short-circuit: arbitrate only near-G subset (much cheaper than full candidate list)
        winner = arbitrateGrids(
          ring.image,
          nearGCandidates.length > 0 ? nearGCandidates : [candidateAtG],
        );
      }
    }

    // Fallback: if WASM didn't fire or no G candidate, run full arbitration
    if (!winner) {
      const prunedCandidates = pruneCandidatesBeforeArbitration(candidates, consensus);
      winner = arbitrateGrids(ring.image, prunedCandidates);
    }

    // Prefer corroborated near-count with strict gates: winner corrob=1, challenger≥2,
    // bd_dist in challenger proposers, phaseScore margin ≤0.40
    // Large images (area >= 1M): skip preferCorroborated (Gate3 dead without bd_dist).
    if (winner && ring.image.width * ring.image.height < 1_000_000) {
      const preferred = preferCorroboratedNearCountMarginBdDist(ring.image, winner, tagged);
      if (preferred) winner = preferred;
    }

    // AC+RL consensus override: when WASM consensus fires and differs from winner,
    // select an existing candidate at G dimensions (preferred) or rebuild grid for G
    if (winner && consensus) {
      if (consensus.cols !== winner.grid.width || consensus.rows !== winner.grid.height) {
        // Prefer: select existing candidate with G dimensions (full grid with consistent cuts/offsets)
        const candidateAtG = candidates.find(
          (c) => c.width === consensus.cols && c.height === consensus.rows && c.reliable,
        );

        if (candidateAtG) {
          // Use existing candidate's full grid directly (singleton arbitration would return null)
          const { readings } = gridEvidence(ring.image, [candidateAtG]);
          const reading = readings[0];
          if (reading) {
            const phase = phaseScore(reading);
            const { cutsX, cutsY } = reading.grid;
            const score = phase + octaveShortfall(reading.frame(), cutsX!, cutsY!);
            const share = Math.max(0, Math.min(1, (reading.twin - reading.length) / reading.twin));
            winner = {
              grid: {
                ...reading.grid,
                confidence: Math.max(reading.grid.confidence, share),
                reliable: true,
              },
              length: reading.length,
              score,
            };
          }
        } else {
          // Rebuild: create grid with G dimensions and consistent geometry
          const cellWidth = ring.image.width / consensus.cols;
          const cellHeight = ring.image.height / consensus.rows;

          winner = {
            grid: {
              ...winner.grid,
              width: consensus.cols,
              height: consensus.rows,
              cellWidth,
              cellHeight,
              // Clear cuts/offsets that were computed for old dimensions
              cutsX: undefined,
              cutsY: undefined,
              offsetX: 0,
              offsetY: 0,
            },
            length: winner.length,
            score: winner.score,
          };
        }
      }
    }

    if (winner && (!best || winner.score < best.score))
      best = { ...winner, rotation: ring.rotation };

    // Corroborated admission: when arbitration refuses, check if multiple proposers agree
    if (!winner && !best) {
      const corroborated = admitCorroboratedLattice(
        ring.image,
        corroboratingProposers,
        ring.rotation,
      );
      if (corroborated) best = corroborated;
    }
  }

  if (!best) return unreliable(image);
  return best.rotation ? { ...best.grid, rotation: best.rotation } : best.grid;
}

/**
 * After arbitration picks a winner, check if near-count readings (±1 cell per axis) have
 * strictly higher corroboration from period proposers. Only override when ALL gates hold:
 * 1. Winner corroboration = 1 (singleton period proposer)
 * 2. Challenger corroboration ≥ 2
 * 3. bd_dist (distanceCountGrids, index 4) in challenger proposers
 * 4. phaseScore(challenger) - phaseScore(winner) ≤ 0.40 nats
 *
 * Stricter than reverted ungated version to prevent drift cliff (game1x −0.233pp, drift −20pp).
 */
function preferCorroboratedNearCountMarginBdDist(
  image: PixelBuffer,
  winner: ArbitratedGrid,
  tagged: readonly { grid: PixelGridAnalysis; proposerIndex: number }[],
): ArbitratedGrid | null {
  const BD_DIST_INDEX = 3; // distanceCountGrids in corroboratingProposers
  const MAX_PHASE_SCORE_DELTA = 0.4;

  const winnerWidth = winner.grid.width;
  const winnerHeight = winner.grid.height;

  // Group tagged grids by size and track proposers
  const bySize = new Map<
    string,
    { proposers: Set<number>; grids: { grid: PixelGridAnalysis; proposerIndex: number }[] }
  >();
  for (const entry of tagged) {
    const key = `${entry.grid.width}x${entry.grid.height}`;
    const group = bySize.get(key) ?? { proposers: new Set(), grids: [] };
    group.proposers.add(entry.proposerIndex);
    group.grids.push(entry);
    bySize.set(key, group);
  }

  // Count winner's corroboration
  const winnerKey = `${winnerWidth}x${winnerHeight}`;
  const winnerCorroboration = bySize.get(winnerKey)?.proposers.size ?? 0;

  // Gate 1: only apply when winner has corroboration=1 (singleton period proposer)
  if (winnerCorroboration !== 1) return null;

  // Compute winner's phase score once
  const { readings: winnerReadings } = gridEvidence(image, [winner.grid]);
  if (winnerReadings.length === 0) return null;
  const winnerPhaseScore = phaseScore(winnerReadings[0]);

  // Find near-count candidates (±1 cell per axis)
  let bestChallenger: {
    grid: PixelGridAnalysis;
    corroboration: number;
    score: number;
    phaseScore: number;
  } | null = null;

  for (const [key, group] of bySize) {
    const [w, h] = key.split("x").map(Number);
    const deltaW = Math.abs(w - winnerWidth);
    const deltaH = Math.abs(h - winnerHeight);

    // Must be ±1 cell per axis
    if (deltaW > 1 || deltaH > 1 || (deltaW === 0 && deltaH === 0)) continue;

    const corroboration = group.proposers.size;

    // Gate 2: challenger must have corroboration ≥ 2
    if (corroboration < 2) continue;

    // Gate 3: bd_dist must be in challenger's proposers
    if (!group.proposers.has(BD_DIST_INDEX)) continue;

    // Must have strictly higher corroboration than winner
    if (corroboration <= winnerCorroboration) continue;

    // Compute challenger's arbitration score and phase score
    const candidateGrid = group.grids[0].grid;
    const { readings } = gridEvidence(image, [candidateGrid]);
    if (readings.length === 0) continue;

    const reading = readings[0];
    const challengerPhaseScore = phaseScore(reading);

    // Gate 4: phase score delta must be ≤ 0.40
    const phaseDelta = challengerPhaseScore - winnerPhaseScore;
    if (phaseDelta > MAX_PHASE_SCORE_DELTA) continue;

    const { cutsX, cutsY } = reading.grid;
    const totalScore = challengerPhaseScore + octaveShortfall(reading.frame(), cutsX!, cutsY!);

    // Pick best-corroborated among valid challengers
    if (
      !bestChallenger ||
      corroboration > bestChallenger.corroboration ||
      (corroboration === bestChallenger.corroboration && totalScore < bestChallenger.score)
    ) {
      bestChallenger = {
        grid: candidateGrid,
        corroboration,
        score: totalScore,
        phaseScore: challengerPhaseScore,
      };
    }
  }

  if (!bestChallenger) return null;

  // Return the preferred challenger
  const share = Math.max(0, Math.min(1, bestChallenger.grid.confidence ?? 0));
  return {
    grid: {
      ...bestChallenger.grid,
      confidence: Math.max(bestChallenger.grid.confidence, share),
      reliable: true,
    },
    length: 0, // Not used after this point
    score: bestChallenger.score,
  };
}

/**
 * When arbitration refuses (passthrough wins), check if multiple corroborating proposers agree
 * on a strict lattice size. If ≥MIN_CORROBORATORS agree, admit the best-phaseScore among them.
 */
function admitCorroboratedLattice(
  image: PixelBuffer,
  proposers: readonly GridProposer[],
  rotation: number,
): { score: number; grid: PixelGridAnalysis; rotation: number } | null {
  // Collect proposals from corroborating proposers, tagged by source
  const tagged = proposers.flatMap((proposer, index) =>
    proposer(image).map((grid) => ({ grid, proposerIndex: index })),
  );

  // Group by strict lattice size (width × height)
  const bySize = new Map<string, { grid: PixelGridAnalysis; proposerIndex: number }[]>();
  for (const entry of tagged) {
    const key = `${entry.grid.width}x${entry.grid.height}`;
    const group = bySize.get(key) ?? [];
    group.push(entry);
    bySize.set(key, group);
  }

  // Find sizes corroborated by ≥MIN_CORROBORATORS distinct proposers
  let bestCorroborated: PixelGridAnalysis | null = null;
  let bestScore = Infinity;

  for (const [, group] of bySize) {
    // Count distinct proposers in this group
    const proposerIndices = new Set(group.map((entry) => entry.proposerIndex));
    if (proposerIndices.size < MIN_CORROBORATORS) continue;

    // Among corroborated grids of this size, find best phaseScore
    const { readings } = gridEvidence(
      image,
      group.map((e) => e.grid),
    );
    for (const reading of readings) {
      const phase = phaseScore(reading);
      if (phase < bestScore) {
        bestScore = phase;
        bestCorroborated = reading.grid;
      }
    }
  }

  if (!bestCorroborated) return null;

  return {
    score: bestScore,
    grid: rotation ? { ...bestCorroborated, rotation } : bestCorroborated,
    rotation,
  };
}

/** Algorithm table. Auto runs pluggable proposers and falls back to FALLBACK as data. */
const TABLE: Readonly<Record<PixelationAlgorithm, PixelationAlgorithmEntry>> = {
  [PixelationAlgorithm.Auto]: {
    label: "import.algorithm.auto",
    listed: true,
    detect: autoGrid,
    run: (image, grid, picker) =>
      TABLE[(grid as PixelGridAnalysis).algorithm ?? FALLBACK].run(image, grid, picker),
  },
  [PixelationAlgorithm.UniformGrid]: {
    label: "import.algorithm.uniform-grid",
    listed: true,
    detect: deskewed(PixelationAlgorithm.UniformGrid, detectUniformGrid),
    run: recoverGrid,
  },
  [PixelationAlgorithm.EdgeGrid]: {
    label: "import.algorithm.edge-grid",
    listed: true,
    detect: deskewed(PixelationAlgorithm.EdgeGrid, detectMeshGrid),
    run: recoverGrid,
  },
  [PixelationAlgorithm.CustomSize]: {
    label: "import.algorithm.custom-size",
    listed: true,
    detect: (image, size) => ({
      ...customSize(image, size),
      algorithm: PixelationAlgorithm.CustomSize,
    }),
    run: recoverGrid,
  },
  [PixelationAlgorithm.Resize]: {
    label: "import.algorithm.resize",
    listed: false,
    detect: unreliable,
    run: (image, grid) => resizeBox(image, grid.width, grid.height, "premultiplied"),
  },
};

export function getAlgorithmEntry(algorithm: PixelationAlgorithm): PixelationAlgorithmEntry {
  const entry = (TABLE as Partial<Record<string, PixelationAlgorithmEntry>>)[algorithm];
  if (!entry) throw new RangeError(`Unknown pixelation algorithm: ${algorithm}`);
  return entry;
}

export function getAllAlgorithms(): readonly PixelationAlgorithm[] {
  return Object.keys(TABLE) as PixelationAlgorithm[];
}

/** Entries the import dialog offers, in registry order. */
export function getListedAlgorithms(): readonly PixelationAlgorithm[] {
  return getAllAlgorithms().filter((id) => TABLE[id].listed);
}

export function detectWithAlgorithm(
  image: PixelBuffer,
  algorithm: PixelationAlgorithm = PixelationAlgorithm.Auto,
  size?: PixelationSize,
): PixelGridAnalysis {
  const entry = getAlgorithmEntry(algorithm);
  if (detection) return entry.detect(image, size);
  detection = { image };
  try {
    return entry.detect(image, size);
  } finally {
    detection = null;
    forgetNeighbourSteps();
  }
}

export function recoverWithGrid(
  image: PixelBuffer,
  grid: PixelGridGeometry,
  picker: CellColorPicker = CellColorPicker.MostCommon,
): PixelBuffer {
  const { rotation } = grid as PixelGridAnalysis;
  return getAlgorithmEntry(
    (grid as PixelGridAnalysis).algorithm ?? PixelationAlgorithm.EdgeGrid,
  ).run(rotation ? straighten(image, rotation) : image, grid, picker);
}
