import type { PixelBuffer } from "$/base/primitives";
import { detectMeshGrid, detectUniformGrid } from "$/import-export/image/import/grid-detect";
import { recoverGrid } from "$/import-export/image/import/grid-sample";
import { resizeBox } from "$/import-export/image/import/resize";
import {
  CellColorPicker,
  PixelationAlgorithm,
  type PixelGridAnalysis,
  type PixelGridGeometry,
} from "$/import-export/image/import/types";

export interface PixelationAlgorithmEntry {
  /** i18n key of the label shown in the import dialog and preferences. */
  readonly label: string;
  /** Whether Auto considers this entry. */
  readonly auto: boolean;
  detect(image: PixelBuffer): PixelGridAnalysis;
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
  (algorithm: PixelationAlgorithm, detect: (image: PixelBuffer) => PixelGridAnalysis) =>
  (image: PixelBuffer): PixelGridAnalysis => ({ ...detect(image), algorithm });

const FALLBACK = PixelationAlgorithm.Resize;

/** Algorithm table. Auto is a reduce over the `auto` entries and falls back to FALLBACK as data. */
const TABLE: Readonly<Record<PixelationAlgorithm, PixelationAlgorithmEntry>> = {
  [PixelationAlgorithm.Auto]: {
    label: "import.algorithm.auto",
    auto: false,
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
    detect: tag(PixelationAlgorithm.UniformGrid, detectUniformGrid),
    run: recoverGrid,
  },
  [PixelationAlgorithm.EdgeGrid]: {
    label: "import.algorithm.edge-grid",
    auto: true,
    detect: tag(PixelationAlgorithm.EdgeGrid, detectMeshGrid),
    run: recoverGrid,
  },
  [PixelationAlgorithm.Resize]: {
    label: "import.algorithm.resize",
    auto: false,
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

export function detectWithAlgorithm(
  image: PixelBuffer,
  algorithm: PixelationAlgorithm = PixelationAlgorithm.Auto,
): PixelGridAnalysis {
  return getAlgorithmEntry(algorithm).detect(image);
}

export function recoverWithGrid(
  image: PixelBuffer,
  grid: PixelGridGeometry,
  picker: CellColorPicker = CellColorPicker.MostCommon,
): PixelBuffer {
  return getAlgorithmEntry(
    (grid as PixelGridAnalysis).algorithm ?? PixelationAlgorithm.EdgeGrid,
  ).run(image, grid, picker);
}
