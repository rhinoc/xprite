import type { ToolWheelInput } from "$/managers/ports/preview";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  AnimalCrossingResult,
  AnimalCrossingSettings,
  ImportedAnimalCrossingPattern,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

export interface AnimalCrossingPort {
  preview(
    pixels: PixelBuffer,
    settings: AnimalCrossingSettings,
    selected: number,
    signal: AbortSignal,
  ): Promise<{ result: AnimalCrossingResult; selected: number; qr: PixelBuffer }>;
  releasePreview(pixels: PixelBuffer): void;
  readWheel(event: WheelEvent): ToolWheelInput;
  read(file: File): Promise<{
    pixels: PixelBuffer;
    project?: SessionProject;
    pattern?: ImportedAnimalCrossingPattern;
  }>;
  example(): Promise<File>;
  edit(pixels: PixelBuffer, name: string): Promise<void>;
  saveQr(pixels: PixelBuffer, name: string): Promise<void>;
  save(result: AnimalCrossingResult, name: string): Promise<void>;
}
