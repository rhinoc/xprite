import type { PixelBuffer } from "@xprite/editor-core/base";
import type { AnimalCrossingResult } from "@xprite/editor-core/import-export";

export interface AnimalCrossingExportPort {
  save(result: AnimalCrossingResult, name: string): Promise<void>;
  saveQr(pixels: PixelBuffer, name: string): Promise<void>;
}
