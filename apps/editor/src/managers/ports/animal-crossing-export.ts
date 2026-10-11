import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  AnimalCrossingSettings,
  AnimalCrossingResult,
} from "@xprite/editor-core/import-export";

interface AnimalCrossingPreview {
  result: AnimalCrossingResult;
  selected: number;
  qr: PixelBuffer;
}
export interface AnimalCrossingExportPort {
  preview(
    pixels: PixelBuffer,
    settings: AnimalCrossingSettings,
    selected: number,
    signal: AbortSignal,
  ): Promise<AnimalCrossingPreview>;
  releasePreview(pixels: PixelBuffer): void;
  save(result: AnimalCrossingResult, name: string): Promise<void>;
  saveQr(pixels: PixelBuffer, name: string): Promise<void>;
}
