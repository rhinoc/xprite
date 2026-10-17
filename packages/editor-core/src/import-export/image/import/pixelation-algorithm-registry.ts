import type { PixelBuffer } from "$/base/primitives";
import { detectEdgeBasedGrid } from "$/import-export/image/import/edge-based-grid";
import { detectPixelGrid } from "$/import-export/image/import/grid";
import {
  PixelationAlgorithm,
  type PixelGridAnalysis,
  PixelationMode,
} from "$/import-export/image/import/types";

interface PixelationAlgorithmDescriptor {
  readonly id: PixelationAlgorithm;
  readonly label: string;
  readonly supportsDetection: boolean;
  readonly minCellSize?: number;
  readonly minGridCells?: number;
  detect(image: PixelBuffer): PixelGridAnalysis;
  prepareMode(detected: PixelGridAnalysis): PixelationMode;
}

function validateGrid(
  result: PixelGridAnalysis,
  minCellSize: number = 4,
  minGridCells: number = 16,
): PixelGridAnalysis {
  if (!result.reliable) return result;

  const tooSmallCells = result.cellWidth < minCellSize || result.cellHeight < minCellSize;
  const tooFewCells = result.width * result.height < minGridCells;
  const tooLargeCells = result.cellWidth > 64 || result.cellHeight > 64;
  const implausible = result.width < 4 || result.height < 4;
  const tooManySmallCells =
    (result.cellWidth <= 5 && result.width > 100) ||
    (result.cellHeight <= 5 && result.height > 100);
  const suspiciouslyManyTinyCells = result.width > 200 || result.height > 200;
  const lowConfidence = result.confidence < 0.7;

  if (
    tooSmallCells ||
    tooFewCells ||
    tooLargeCells ||
    implausible ||
    tooManySmallCells ||
    suspiciouslyManyTinyCells ||
    lowConfidence
  ) {
    return { ...result, reliable: false };
  }

  return result;
}

const edgeGridDescriptor: PixelationAlgorithmDescriptor = {
  id: PixelationAlgorithm.EdgeGrid,
  label: "import.algorithm.edge-grid",
  supportsDetection: true,
  minCellSize: 4,
  minGridCells: 16,
  detect: (image) => validateGrid(detectEdgeBasedGrid(image), 4, 16),
  prepareMode: (detected) =>
    detected.reliable ? PixelationMode.RecoverGrid : PixelationMode.Convert,
};

const uniformGridDescriptor: PixelationAlgorithmDescriptor = {
  id: PixelationAlgorithm.UniformGrid,
  label: "import.algorithm.uniform-grid",
  supportsDetection: true,
  minCellSize: 4,
  minGridCells: 16,
  detect: (image) => validateGrid(detectPixelGrid(image), 4, 16),
  prepareMode: (detected) =>
    detected.reliable ? PixelationMode.RecoverGrid : PixelationMode.Convert,
};

const resizeDescriptor: PixelationAlgorithmDescriptor = {
  id: PixelationAlgorithm.Resize,
  label: "import.algorithm.resize",
  supportsDetection: false,
  detect: (image) => ({
    width: 1,
    height: 1,
    cellWidth: image.width,
    cellHeight: image.height,
    offsetX: 0,
    offsetY: 0,
    confidence: 0,
    reliable: false,
  }),
  prepareMode: () => PixelationMode.Convert,
};

const autoDescriptor: PixelationAlgorithmDescriptor = {
  id: PixelationAlgorithm.Auto,
  label: "import.algorithm.auto",
  supportsDetection: true,
  detect: (image) => {
    const detectors = [edgeGridDescriptor, uniformGridDescriptor];
    const results = detectors.map((d) => d.detect(image));
    const best = results.reduce((a, b) => {
      if (a.reliable && !b.reliable) return a;
      if (!a.reliable && b.reliable) return b;
      return a.confidence >= b.confidence ? a : b;
    });
    return best.reliable ? best : resizeDescriptor.detect(image);
  },
  prepareMode: (detected) =>
    detected.reliable ? PixelationMode.RecoverGrid : PixelationMode.Convert,
};

const ALGORITHM_REGISTRY: ReadonlyMap<PixelationAlgorithm, PixelationAlgorithmDescriptor> = new Map(
  [
    [PixelationAlgorithm.Auto, autoDescriptor],
    [PixelationAlgorithm.EdgeGrid, edgeGridDescriptor],
    [PixelationAlgorithm.UniformGrid, uniformGridDescriptor],
    [PixelationAlgorithm.Resize, resizeDescriptor],
  ],
);

export type { PixelationAlgorithmDescriptor };

export function getAlgorithmDescriptor(
  algorithm: PixelationAlgorithm,
): PixelationAlgorithmDescriptor {
  const descriptor = ALGORITHM_REGISTRY.get(algorithm);
  if (!descriptor) throw new RangeError(`Unknown pixelation algorithm: ${algorithm}`);
  return descriptor;
}

export function getAllAlgorithms(): readonly PixelationAlgorithm[] {
  return [
    PixelationAlgorithm.Auto,
    PixelationAlgorithm.EdgeGrid,
    PixelationAlgorithm.UniformGrid,
    PixelationAlgorithm.Resize,
  ];
}

export function detectWithAlgorithm(
  image: PixelBuffer,
  algorithm: PixelationAlgorithm,
): PixelGridAnalysis {
  return getAlgorithmDescriptor(algorithm).detect(image);
}
