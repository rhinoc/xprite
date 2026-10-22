import type { PixelBuffer } from "$/base/primitives";
import { forgetNeighbourSteps } from "$/import-export/image/import/color-step";
import { estimateTilt, straighten } from "$/import-export/image/import/deskew";
import { blockPartition } from "$/import-export/image/import/grid";
import { detectMeshGrid, detectUniformGrid } from "$/import-export/image/import/grid-detect";
import { recoverGrid } from "$/import-export/image/import/grid-sample";
import { resizeBox } from "$/import-export/image/import/resize";
import {
  CellColorPicker,
  PixelationAlgorithm,
  type PixelGridAnalysis,
  type PixelGridGeometry,
  type PixelationSize,
} from "$/import-export/image/import/types";

export interface PixelationAlgorithmEntry {
  /** i18n key of the label shown in the import dialog and preferences. */
  readonly label: string;
  /** Whether Auto considers this entry. */
  readonly auto: boolean;
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

const tag =
  (
    algorithm: PixelationAlgorithm,
    detect: (image: PixelBuffer, size?: PixelationSize) => PixelGridAnalysis,
  ) =>
  (image: PixelBuffer, size?: PixelationSize): PixelGridAnalysis => ({
    ...detect(image, size),
    algorithm,
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
 * Detect on a straightened copy when the image carries a convincing tilt; the grid then records
 * the rotation so recovery straightens the same way. A tilt beyond the search range, or a
 * straightened image that still has no reliable grid, is refused rather than guessed from the
 * tilted pixels (those yield confident but wrong grids).
 */
const deskewed =
  (detect: (image: PixelBuffer, size?: PixelationSize) => PixelGridAnalysis) =>
  (image: PixelBuffer, size?: PixelationSize): PixelGridAnalysis => {
    const tilt = estimateTilt(image);
    if (tilt.extreme) return unreliable(image);
    if (!tilt.angle) return detect(image, size);
    const found = detect(uprightOf(image, tilt.angle), size);
    return found.reliable ? { ...found, rotation: tilt.angle } : unreliable(image);
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

/** Algorithm table. Auto is a reduce over the `auto` entries and falls back to FALLBACK as data. */
const TABLE: Readonly<Record<PixelationAlgorithm, PixelationAlgorithmEntry>> = {
  [PixelationAlgorithm.Auto]: {
    label: "import.algorithm.auto",
    auto: false,
    listed: true,
    detect: (image) =>
      getAllAlgorithms()
        .map((id) => TABLE[id])
        .filter((entry) => entry.auto)
        .map((entry) => entry.detect(image))
        .reduce(
          (best, next) =>
            next.reliable && (!best.reliable || next.confidence > best.confidence) ? next : best,
          TABLE[FALLBACK].detect(image),
        ),
    run: (image, grid, picker) =>
      TABLE[(grid as PixelGridAnalysis).algorithm ?? FALLBACK].run(image, grid, picker),
  },
  [PixelationAlgorithm.UniformGrid]: {
    label: "import.algorithm.uniform-grid",
    auto: true,
    listed: true,
    detect: tag(PixelationAlgorithm.UniformGrid, deskewed(detectUniformGrid)),
    run: recoverGrid,
  },
  [PixelationAlgorithm.EdgeGrid]: {
    label: "import.algorithm.edge-grid",
    auto: true,
    listed: true,
    detect: tag(PixelationAlgorithm.EdgeGrid, deskewed(detectMeshGrid)),
    run: recoverGrid,
  },
  [PixelationAlgorithm.CustomSize]: {
    label: "import.algorithm.custom-size",
    auto: false,
    listed: true,
    detect: tag(PixelationAlgorithm.CustomSize, customSize),
    run: recoverGrid,
  },
  [PixelationAlgorithm.Resize]: {
    label: "import.algorithm.resize",
    auto: false,
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
