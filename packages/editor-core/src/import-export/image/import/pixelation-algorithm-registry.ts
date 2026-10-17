import type { PixelBuffer } from "$/base/primitives";
import { detectEdgeBasedGrid } from "$/import-export/image/import/edge-based-grid";
import {
  PixelationAlgorithm,
  type PixelGridAnalysis,
  PixelationMode,
} from "$/import-export/image/import/types";

interface PixelationAlgorithmDescriptor {
  readonly id: PixelationAlgorithm;
  readonly label: string;
  readonly supportsDetection: boolean;
  detect(image: PixelBuffer): PixelGridAnalysis;
  prepareMode(detected: PixelGridAnalysis): PixelationMode;
}

const edgeGridDescriptor: PixelationAlgorithmDescriptor = {
  id: PixelationAlgorithm.EdgeGrid,
  label: "import.algorithm.edge-grid",
  supportsDetection: true,
  detect: detectEdgeBasedGrid,
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
    const result = edgeGridDescriptor.detect(image);
    return result.reliable ? result : resizeDescriptor.detect(image);
  },
  prepareMode: (detected) =>
    detected.reliable ? PixelationMode.RecoverGrid : PixelationMode.Convert,
};

const ALGORITHM_REGISTRY: ReadonlyMap<PixelationAlgorithm, PixelationAlgorithmDescriptor> = new Map(
  [
    [PixelationAlgorithm.Auto, autoDescriptor],
    [PixelationAlgorithm.EdgeGrid, edgeGridDescriptor],
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
  return [PixelationAlgorithm.Auto, PixelationAlgorithm.EdgeGrid, PixelationAlgorithm.Resize];
}

export function detectWithAlgorithm(
  image: PixelBuffer,
  algorithm: PixelationAlgorithm,
): PixelGridAnalysis {
  return getAlgorithmDescriptor(algorithm).detect(image);
}
