import type { PixelBuffer } from "$/base/primitives";
import { forgetNeighbourSteps } from "$/import-export/image/import/color/color-step";
import {
  arbitrateGrids,
  GridEvidenceReader,
  octaveShortfall,
  phaseScore,
  twinCuts,
  type ArbitratedGrid,
  type GridEvidence,
} from "$/import-export/image/import/grid/arbitrate/arbitrate";
import {
  CutModel,
  describeImage,
  descriptionLength,
} from "$/import-export/image/import/grid/arbitrate/description-length";
import { coherentGrids } from "$/import-export/image/import/grid/arbitrate/edge-coherence";
import { detectMeshGrid, detectUniformGrid } from "$/import-export/image/import/grid/detect/detect";
import { detectFrameLattices } from "$/import-export/image/import/grid/detect/frame-lattice";
import { pitchLattices } from "$/import-export/image/import/grid/detect/pitch-lattice";
import { blockPartition, MAX_RECOVERED_GRID_SIZE } from "$/import-export/image/import/grid/lattice";
import {
  beginAcRlConsensusJob,
  beginAcRlConsensusJobAsync,
  finishAcRlConsensusJob,
  finishAcRlConsensusJobAsync,
  type AcRlConsensusAsyncJob,
  type AcRlConsensusJob,
} from "$/import-export/image/import/grid/period/ac-rl-consensus";
import { detectBoundaryPeriodGrids } from "$/import-export/image/import/grid/period/boundary";
import { combCountGrids } from "$/import-export/image/import/grid/period/comb";
import { distanceCountGrids } from "$/import-export/image/import/grid/period/distance";
import { recoverGrid } from "$/import-export/image/import/grid/sample";
import { prepareGridSampling } from "$/import-export/image/import/grid/sampling";
import { estimateTilt, straighten } from "$/import-export/image/import/prepass/deskew";
import { resizeBox } from "$/import-export/image/import/prepass/resize";
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

export interface PixelationAlgorithmEntry {
  /** i18n key of the label shown in the import dialog and preferences. */
  readonly label: string;
  /** Whether the import dialog offers this entry; the plain resize is only Auto's fallback. */
  readonly listed: boolean;
  /**
   * Sync detect for most algorithms. Auto also exposes detectAsync for product overlap
   * (browser nested Worker join without COOP/COEP).
   */
  detect(image: PixelBuffer, size?: PixelationSize): PixelGridAnalysis;
  /** Optional async detect (Auto): awaitable WASM||proposers overlap. */
  detectAsync?(image: PixelBuffer, size?: PixelationSize): Promise<PixelGridAnalysis>;
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
const BOUNDARY_PROPOSERS: readonly GridProposer[] = [
  (image): PixelGridAnalysis[] => {
    const grid = detectUniformGrid(image);
    return grid.reliable
      ? [{ ...grid, algorithm: PixelationAlgorithm.UniformGrid, reliable: true }]
      : [];
  },
  (image): PixelGridAnalysis[] => {
    const grid = detectMeshGrid(image);
    return grid.reliable
      ? [{ ...grid, algorithm: PixelationAlgorithm.EdgeGrid, reliable: true }]
      : [];
  },
];
const PROPOSERS: readonly GridProposer[] = [
  ...BOUNDARY_PROPOSERS,
  detectFrameLattices,
  pitchLattices,
  combCountGrids,
  detectBoundaryPeriodGrids,
  distanceCountGrids,
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
 * The AC+RL consensus counts cells across the whole image. A sprite exported on a clear canvas
 * has soft edges against the clear margin, which shift that count by one cell, so on such an
 * image (at least CLEAR_MARGIN_SHARE of its pixels clear) a consensus within one cell of the
 * arbitrated winner does not replace it. A farther consensus still does.
 */
const CLEAR_MARGIN_SHARE = 0.25;
const ALPHA_CHANNEL = 3;
const STRIDE = 4;

const clearMargins = new WeakMap<PixelBuffer, boolean>();
function hasClearMargin(image: PixelBuffer): boolean {
  let known = clearMargins.get(image);
  if (known === undefined) {
    let clear = 0;
    for (let o = ALPHA_CHANNEL; o < image.data.length; o += STRIDE) if (!image.data[o]) clear++;
    known = clear >= CLEAR_MARGIN_SHARE * image.width * image.height;
    clearMargins.set(image, known);
  }
  return known;
}

/** Whether the consensus counts replace the arbitrated winner (see CLEAR_MARGIN_SHARE). */
function consensusOverrides(
  image: PixelBuffer,
  winner: PixelGridAnalysis,
  consensus: { cols: number; rows: number },
): boolean {
  const columns = Math.abs(consensus.cols - winner.width),
    rows = Math.abs(consensus.rows - winner.height);
  if (!columns && !rows) return false;
  return !hasClearMargin(image) || columns > 1 || rows > 1;
}

/**
 * Maximum candidates to pass to arbitration. Description-length scoring scales O(pixels),
 * and each candidate requires strip computation + phase field. Pruning reduces latency
 * while preserving high-confidence and diverse-dimension candidates.
 */
const MAX_ARBITRATION_CANDIDATES = 10;

/**
 * Exact A/B: pass-through (no prune). Peak d698be86 scored without pruning;
 * tip prune path (39ba4659) is bypassed so arbitration sees the full candidate list.
 * MAX_ARBITRATION_CANDIDATES / wasmConsensus args retained for call-site compatibility.
 */
function pruneCandidatesBeforeArbitration(
  candidates: PixelGridAnalysis[],
  _wasmConsensus?: { cols: number; rows: number } | null,
): PixelGridAnalysis[] {
  void MAX_ARBITRATION_CANDIDATES;
  return candidates;
}

/** A dimension-only consensus describes one complete, uniformly partitioned frame. */
function consensusLattice(
  image: PixelBuffer,
  columns: number,
  rows: number,
): PixelGridAnalysis | null {
  if (
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    Math.min(columns, rows) < 2 ||
    columns > Math.min(image.width, MAX_RECOVERED_GRID_SIZE) ||
    rows > Math.min(image.height, MAX_RECOVERED_GRID_SIZE)
  )
    return null;
  return {
    ...blockPartition(image, columns, rows),
    confidence: 0,
    reliable: true,
    algorithm: PixelationAlgorithm.UniformGrid,
  };
}

function scoredReading(reading: GridEvidence): ArbitratedGrid {
  const { cutsX, cutsY } = reading.grid;
  const score = phaseScore(reading) + octaveShortfall(reading.frame(), cutsX!, cutsY!);
  const share =
    reading.twin > 0 ? Math.max(0, Math.min(1, (reading.twin - reading.length) / reading.twin)) : 0;
  return {
    grid: {
      ...reading.grid,
      confidence: Math.max(reading.grid.confidence, share),
      reliable: true,
    },
    length: reading.length,
    score,
  };
}

const geometryKey = (grid: PixelGridAnalysis) =>
  `${grid.algorithm}:${grid.cutsX?.join(",")}:${grid.cutsY?.join(",")}`;

/** A deterministic tie keeps proposer ordering out of model/geometry selection. */
function betterReading(candidate: ArbitratedGrid, current: ArbitratedGrid | null): boolean {
  return (
    !current ||
    candidate.score < current.score ||
    (candidate.score === current.score &&
      (candidate.length < current.length ||
        (candidate.length === current.length &&
          geometryKey(candidate.grid) < geometryKey(current.grid))))
  );
}

function consensusWinner(
  evidence: GridEvidenceReader,
  image: PixelBuffer,
  candidates: readonly PixelGridAnalysis[],
  consensus: { cols: number; rows: number },
): ArbitratedGrid | null {
  const matching = candidates.filter(
    (grid) => grid.width === consensus.cols && grid.height === consensus.rows && grid.reliable,
  );
  let readings: readonly GridEvidence[];
  if (matching.length) {
    readings = evidence.read(matching).readings;
  } else {
    // A dimension-only consensus carries no placement or local-deformation evidence. Score
    // its whole-frame partition on the original view and keep that exact geometry for coloring.
    const grid = consensusLattice(image, consensus.cols, consensus.rows);
    if (!grid) return null;
    const described = describeImage(image);
    const { cutsX, cutsY } = grid;
    readings = [
      {
        grid,
        length: descriptionLength(described, {
          cutsX: cutsX!,
          cutsY: cutsY!,
          model: CutModel.Lattice,
        }),
        twin: descriptionLength(described, {
          cutsX: twinCuts(cutsX!),
          cutsY: twinCuts(cutsY!),
          model: CutModel.Lattice,
        }),
        chance: 0,
        frame: () => described,
      },
    ];
  }
  let best: ArbitratedGrid | null = null;
  for (const reading of readings) {
    if (reading.grid.width !== consensus.cols || reading.grid.height !== consensus.rows) continue;
    const candidate = scoredReading(reading);
    if (betterReading(candidate, best)) best = candidate;
  }
  return best;
}

/** Every proposer's grids for one view, less those the view's edges reject. */
function proposalsOf(image: PixelBuffer, outputs?: PixelGridAnalysis[][]): PixelGridAnalysis[][] {
  return coherentGrids(
    image,
    PROPOSERS.map((proposer, index) => outputs?.[index] ?? proposer(image)),
  );
}

/**
 * Auto: every proposer runs on each evaluation view (扶正 and/or 原图), their candidates compete
 * in one arbitration per view (see grid-arbitrate), and the passthrough is one more candidate in
 * each. When the image carries a tilt, the upright view is tried. Without boundary or independent
 * count support there, corroborated readings of the original view may also compete.
 *
 * Performance: Call preloadWasm() during app/worker initialization to prewarm WASM module.
 * On Node, AC+RL WASM detect starts on a worker_threads worker before proposers run on this
 * thread (begin/finish sync join). Product Auto uses autoGridAsync + browser nested Worker
 * Promise join (no COOP/COEP SAB). Exact semantics identical.
 */
function autoGrid(image: PixelBuffer): PixelGridAnalysis {
  const tilt = estimateTilt(image);
  if (tilt.extreme) return unreliable(image);

  // Determine evaluation views
  const rings: {
    image: PixelBuffer;
    rotation: number;
    requiresCountAgreement?: boolean;
    outputs?: PixelGridAnalysis[][];
    wasmJob?: AcRlConsensusJob;
  }[] = [];
  if (tilt.angle) {
    const upright = uprightOf(image, tilt.angle);
    const wasmJob = beginAcRlConsensusJob(upright);
    const outputs = PROPOSERS.map((proposer) => proposer(upright));
    rings.push({ image: upright, rotation: tilt.angle, outputs, wasmJob });
    if (!outputs.some((grids) => grids.some((grid) => grid.reliable)))
      rings.push({ image, rotation: 0 });
  } else {
    rings.push({ image, rotation: 0 });
  }

  const corroboratingProposers = [
    detectFrameLattices,
    pitchLattices,
    combCountGrids,
    detectBoundaryPeriodGrids,
    distanceCountGrids,
  ];

  // Arbitrate each view: all proposers run on this view
  let best: { score: number; grid: PixelGridAnalysis; rotation: number } | null = null;
  for (const ring of rings) {
    // Overlap: start WASM AC+RL on a Node worker (no-op→sync fallback in browser) while proposers run
    const wasmJob = ring.wasmJob ?? beginAcRlConsensusJob(ring.image);

    // Run each proposer once and track outputs with their corroboration index
    const proposerOutputs = proposalsOf(ring.image, ring.outputs).map((grids, index) => ({
      grids,
      corrobIndex: corroboratingProposers.indexOf(PROPOSERS[index]),
    }));

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

    // Join WASM consensus (already running during proposers when worker overlap is active)
    const consensus = finishAcRlConsensusJob(wasmJob);
    // Preserve the original view when rotation has neither boundary support nor independent
    // count consensus; fitted lattices alone do not establish the rotation.
    if (
      ring.rotation &&
      !consensus &&
      !rings.some((view) => view.rotation === 0) &&
      !proposerOutputs
        .slice(0, BOUNDARY_PROPOSERS.length)
        .some(({ grids }) => grids.some((grid) => grid.reliable))
    )
      rings.push({ image, rotation: 0, requiresCountAgreement: true });

    // WASM-first short-circuit: when consensus fires and candidate@G exists, skip expensive full arb
    const evidence = new GridEvidenceReader(ring.image);
    let winner: ArbitratedGrid | null = null;
    if (consensus) {
      const candidatesAtG = candidates.filter(
        (c) => c.width === consensus.cols && c.height === consensus.rows && c.reliable,
      );
      if (candidatesAtG.length) {
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
          nearGCandidates.length > 0 ? nearGCandidates : candidatesAtG,
          evidence,
        );
      }
    }

    // Fallback: if WASM didn't fire or no G candidate, run full arbitration
    if (!winner) {
      const prunedCandidates = pruneCandidatesBeforeArbitration(candidates, consensus);
      winner = arbitrateGrids(ring.image, prunedCandidates, evidence);
    }

    // Prefer corroborated near-count with strict gates: winner corrob=1, challenger≥2,
    // bd_dist in challenger proposers, phaseScore margin ≤0.40
    if (winner) {
      const preferred = preferCorroboratedNearCountMarginBdDist(evidence, winner, tagged);
      if (preferred) winner = preferred;
    }

    if (winner && consensus && consensusOverrides(ring.image, winner.grid, consensus)) {
      const replacement = consensusWinner(evidence, ring.image, candidates, consensus);
      if (replacement) winner = replacement;
    }

    if (winner && ring.requiresCountAgreement) {
      // Reuse the existing independent-proposer quorum for this additional evaluation view.
      const supporters = new Set(
        tagged
          .filter(
            ({ grid }) => grid.width === winner!.grid.width && grid.height === winner!.grid.height,
          )
          .map(({ proposerIndex }) => proposerIndex),
      );
      if (supporters.size < MIN_CORROBORATORS) winner = null;
    }

    if (winner && (!best || winner.score < best.score))
      best = { ...winner, rotation: ring.rotation };

    // Corroborated admission: when arbitration refuses, check if multiple proposers agree
    if (!winner && !best) {
      const corroborated = admitCorroboratedLattice(evidence, tagged, ring.rotation);
      if (corroborated) best = corroborated;
    }
  }

  if (!best) return unreliable(image);
  return best.rotation ? { ...best.grid, rotation: best.rotation } : best.grid;
}

/**
 * Async Auto: same Exact logic as autoGrid, but joins WASM via Promise so a browser nested
 * Worker can overlap proposers without COOP/COEP / SharedArrayBuffer sync-join.
 */
async function autoGridAsync(image: PixelBuffer): Promise<PixelGridAnalysis> {
  const tilt = estimateTilt(image);
  if (tilt.extreme) return unreliable(image);

  const rings: {
    image: PixelBuffer;
    rotation: number;
    requiresCountAgreement?: boolean;
    outputs?: PixelGridAnalysis[][];
    wasmJob?: AcRlConsensusAsyncJob;
  }[] = [];
  if (tilt.angle) {
    const upright = uprightOf(image, tilt.angle);
    const wasmJob = await beginAcRlConsensusJobAsync(upright);
    const outputs = PROPOSERS.map((proposer) => proposer(upright));
    rings.push({ image: upright, rotation: tilt.angle, outputs, wasmJob });
    if (!outputs.some((grids) => grids.some((grid) => grid.reliable)))
      rings.push({ image, rotation: 0 });
  } else {
    rings.push({ image, rotation: 0 });
  }

  const corroboratingProposers = [
    detectFrameLattices,
    pitchLattices,
    combCountGrids,
    detectBoundaryPeriodGrids,
    distanceCountGrids,
  ];

  let best: { score: number; grid: PixelGridAnalysis; rotation: number } | null = null;
  for (const ring of rings) {
    const wasmJob = ring.wasmJob ?? (await beginAcRlConsensusJobAsync(ring.image));

    const proposerOutputs = proposalsOf(ring.image, ring.outputs).map((grids, index) => ({
      grids,
      corrobIndex: corroboratingProposers.indexOf(PROPOSERS[index]),
    }));

    const candidates = proposerOutputs.flatMap(({ grids }) =>
      grids.map((grid) => (ring.rotation ? { ...grid, rotation: ring.rotation } : grid)),
    );

    const tagged = proposerOutputs
      .filter(({ corrobIndex }) => corrobIndex >= 0)
      .flatMap(({ grids, corrobIndex }) =>
        grids.map((grid) => ({
          grid: ring.rotation ? { ...grid, rotation: ring.rotation } : grid,
          proposerIndex: corrobIndex,
        })),
      );

    const consensus = await finishAcRlConsensusJobAsync(wasmJob);
    // Preserve the original view when rotation has neither boundary support nor independent
    // count consensus; fitted lattices alone do not establish the rotation.
    if (
      ring.rotation &&
      !consensus &&
      !rings.some((view) => view.rotation === 0) &&
      !proposerOutputs
        .slice(0, BOUNDARY_PROPOSERS.length)
        .some(({ grids }) => grids.some((grid) => grid.reliable))
    )
      rings.push({ image, rotation: 0, requiresCountAgreement: true });

    const evidence = new GridEvidenceReader(ring.image);
    let winner: ArbitratedGrid | null = null;
    if (consensus) {
      const candidatesAtG = candidates.filter(
        (c) => c.width === consensus.cols && c.height === consensus.rows && c.reliable,
      );
      if (candidatesAtG.length) {
        const nearGCandidates = candidates.filter(
          (c) =>
            c.reliable &&
            Math.abs(c.width - consensus.cols) <= 1 &&
            Math.abs(c.height - consensus.rows) <= 1,
        );
        winner = arbitrateGrids(
          ring.image,
          nearGCandidates.length > 0 ? nearGCandidates : candidatesAtG,
          evidence,
        );
      }
    }

    if (!winner) {
      const prunedCandidates = pruneCandidatesBeforeArbitration(candidates, consensus);
      winner = arbitrateGrids(ring.image, prunedCandidates, evidence);
    }

    if (winner) {
      const preferred = preferCorroboratedNearCountMarginBdDist(evidence, winner, tagged);
      if (preferred) winner = preferred;
    }

    if (winner && consensus && consensusOverrides(ring.image, winner.grid, consensus)) {
      const replacement = consensusWinner(evidence, ring.image, candidates, consensus);
      if (replacement) winner = replacement;
    }

    if (winner && ring.requiresCountAgreement) {
      // Reuse the existing independent-proposer quorum for this additional evaluation view.
      const supporters = new Set(
        tagged
          .filter(
            ({ grid }) => grid.width === winner!.grid.width && grid.height === winner!.grid.height,
          )
          .map(({ proposerIndex }) => proposerIndex),
      );
      if (supporters.size < MIN_CORROBORATORS) winner = null;
    }

    if (winner && (!best || winner.score < best.score))
      best = { ...winner, rotation: ring.rotation };

    if (!winner && !best) {
      const corroborated = admitCorroboratedLattice(evidence, tagged, ring.rotation);
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
  evidence: GridEvidenceReader,
  winner: ArbitratedGrid,
  tagged: readonly { grid: PixelGridAnalysis; proposerIndex: number }[],
): ArbitratedGrid | null {
  const BD_DIST_INDEX = 4; // distanceCountGrids in corroboratingProposers
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

  // Read the winner only if a corroborated near-count challenger can compete.
  let winnerPhaseScore: number | undefined;

  // Find near-count candidates (±1 cell per axis)
  let bestChallenger: (ArbitratedGrid & { corroboration: number }) | null = null;

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

    if (winnerPhaseScore === undefined) {
      const { readings } = evidence.read([winner.grid]);
      if (readings.length === 0) return null;
      winnerPhaseScore = phaseScore(readings[0]);
    }

    const { readings } = evidence.read(group.grids.map(({ grid }) => grid));
    for (const reading of readings) {
      // Gate 4 applies to each geometry/model, rather than whichever proposer arrived first.
      if (phaseScore(reading) - winnerPhaseScore > MAX_PHASE_SCORE_DELTA) continue;
      const challenger = scoredReading(reading);
      // Corroboration admits a size; it does not calibrate the proposer's local-correction
      // confidence. Keep that confidence so admission cannot activate a different coloring map.
      challenger.grid = { ...challenger.grid, confidence: reading.grid.confidence };
      if (
        !bestChallenger ||
        corroboration > bestChallenger.corroboration ||
        (corroboration === bestChallenger.corroboration &&
          betterReading(challenger, bestChallenger))
      )
        bestChallenger = { ...challenger, corroboration };
    }
  }

  if (!bestChallenger) return null;
  return {
    grid: bestChallenger.grid,
    length: bestChallenger.length,
    score: bestChallenger.score,
  };
}

/**
 * When arbitration refuses (passthrough wins), check if multiple corroborating proposers agree
 * on a strict lattice size. If ≥MIN_CORROBORATORS agree, admit the best-phaseScore among them.
 */
function admitCorroboratedLattice(
  evidence: GridEvidenceReader,
  tagged: readonly { grid: PixelGridAnalysis; proposerIndex: number }[],
  rotation: number,
): { score: number; grid: PixelGridAnalysis; rotation: number } | null {
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
    const { readings } = evidence.read(group.map((e) => e.grid));
    for (const reading of readings) {
      const phase = phaseScore(reading);
      if (
        phase < bestScore ||
        (phase === bestScore &&
          bestCorroborated &&
          geometryKey(reading.grid) < geometryKey(bestCorroborated))
      ) {
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
    detectAsync: autoGridAsync,
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

/**
 * Async detect for product Auto path: uses detectAsync when present (WASM||proposers
 * overlap via nested Worker Promise join). Other algorithms resolve sync detect.
 */
export async function detectWithAlgorithmAsync(
  image: PixelBuffer,
  algorithm: PixelationAlgorithm = PixelationAlgorithm.Auto,
  size?: PixelationSize,
): Promise<PixelGridAnalysis> {
  const entry = getAlgorithmEntry(algorithm);
  const run = () =>
    entry.detectAsync ? entry.detectAsync(image, size) : Promise.resolve(entry.detect(image, size));
  if (detection) return run();
  detection = { image };
  try {
    return await run();
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
  return getAlgorithmEntry(
    (grid as PixelGridAnalysis).algorithm ?? PixelationAlgorithm.EdgeGrid,
  ).run(prepareGridSampling(image, grid as PixelGridAnalysis), grid, picker);
}
