import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  PixelateOptions,
  PixelationAlgorithm,
  PixelationSize,
  PixelGridAnalysis,
} from "@xprite/editor-core/import-export";
export enum PixelationWorkerOperation {
  Convert = "convert",
  DetectGrid = "detect-grid",
}
export type PixelationWorkerRequest =
  | { operation: PixelationWorkerOperation.Convert; image: PixelBuffer; options: PixelateOptions }
  | {
      operation: PixelationWorkerOperation.DetectGrid;
      image: PixelBuffer;
      algorithm?: PixelationAlgorithm;
      size?: PixelationSize;
    };
export type PixelationWorkerResponse =
  | { pixels: PixelBuffer }
  | { grid: PixelGridAnalysis }
  | { error: string };
