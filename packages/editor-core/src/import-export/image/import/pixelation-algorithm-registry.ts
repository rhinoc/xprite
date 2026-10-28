import type { PixelBuffer } from "$/base/primitives";
import { forgetNeighbourSteps } from "$/import-export/image/import/color-step";
import { estimateTilt, straighten } from "$/import-export/image/import/deskew";
import { blockPartition } from "$/import-export/image/import/grid";
import { arbitrateGrids } from "$/import-export/image/import/grid-arbitrate";
import { detectMeshGrid, detectUniformGrid } from "$/import-export/image/import/grid-detect";
import { detectFrameLattices } from "$/import-export/image/import/grid-frame-lattice";
import { detectBoundaryPeriodGrids } from "$/import-export/image/import/grid-period-boundary";
import { combCountGrids } from "$/import-export/image/import/grid-period-comb";
import { distanceCountGrids } from "$/import-export/image/import/grid-period-distance";
import { pitchLattices } from "$/import-export/image/import/grid-pitch-lattice";
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
export type GridProposer = (image: PixelBuffer) => PixelGridAnalysis[];

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
 * Proposers that work best on upright images. These are run once on the appropriate view
 * (upright if tilt is claimed, original otherwise) and their reliable candidates are reused
 * for all evaluation views.
 */
const DESKEWING_PROPOSERS: readonly GridProposer[] = [
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

/**
 * Proposers that work on any view. These are run per evaluation view: for each view, their
 * candidates are collected and arbitrated alongside the deskewed candidates.
 */
const OTHER_PROPOSERS: readonly GridProposer[] = [
  detectFrameLattices,
  pitchLattices,
  combCountGrids,
  detectBoundaryPeriodGrids,
  distanceCountGrids,
];

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
 * Auto: every proposer runs on one or more evaluation views (扶正 and/or 原图), their candidates
 * compete in one arbitration per view (see grid-arbitrate), and the passthrough is one more
 * candidate in each. Deskewing proposers (Uniform, Edge) are run once on the appropriate view
 * (upright if the image carries a tilt, original otherwise); other proposers are run per view.
 * Soft edges make the tilt estimate unreliable, so when deskewing proposers find nothing on the
 * upright view, the original competes as well.
 */
function autoGrid(image: PixelBuffer): PixelGridAnalysis {
  const tilt = estimateTilt(image);
  if (tilt.extreme) return unreliable(image);

  // Run deskewing proposers once on the appropriate view
  let deskewedCandidates: PixelGridAnalysis[] = [];
  if (tilt.angle) {
    const upright = uprightOf(image, tilt.angle);
    deskewedCandidates = DESKEWING_PROPOSERS.flatMap((proposer) => proposer(upright))
      .filter((grid) => grid.reliable)
      .map((grid) => ({ ...grid, rotation: tilt.angle }));
  } else {
    deskewedCandidates = DESKEWING_PROPOSERS.flatMap((proposer) => proposer(image)).filter(
      (grid) => grid.reliable,
    );
  }

  // Determine evaluation views
  const rings: { image: PixelBuffer; rotation: number }[] = [];
  if (tilt.angle) rings.push({ image: uprightOf(image, tilt.angle), rotation: tilt.angle });
  if (!tilt.angle || deskewedCandidates.length === 0) rings.push({ image, rotation: 0 });

  // Arbitrate each view: deskewed candidates + other proposers on this view
  let best: { score: number; grid: PixelGridAnalysis; rotation: number } | null = null;
  for (const ring of rings) {
    const otherCandidates = OTHER_PROPOSERS.flatMap((proposer) => proposer(ring.image)).map(
      (grid) => (ring.rotation ? { ...grid, rotation: ring.rotation } : grid),
    );
    const allCandidates = [...deskewedCandidates, ...otherCandidates];
    const winner = arbitrateGrids(ring.image, allCandidates);
    if (winner && (!best || winner.score < best.score))
      best = { ...winner, rotation: ring.rotation };
  }

  if (!best) return unreliable(image);
  return best.rotation ? { ...best.grid, rotation: best.rotation } : best.grid;
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
    detect: (image) => {
      const grid = detectUniformGrid(image);
      return { ...grid, algorithm: PixelationAlgorithm.UniformGrid };
    },
    run: recoverGrid,
  },
  [PixelationAlgorithm.EdgeGrid]: {
    label: "import.algorithm.edge-grid",
    listed: true,
    detect: (image) => {
      const grid = detectMeshGrid(image);
      return { ...grid, algorithm: PixelationAlgorithm.EdgeGrid };
    },
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
