import type { ToolWheelInput } from "$/managers/ports/preview";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  AnimalCrossingResult,
  ImportedAnimalCrossingPattern,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

export interface AnimalCrossingPort {
  readWheel(event: WheelEvent): ToolWheelInput;
  read(file: File): Promise<{
    pixels: PixelBuffer;
    project?: SessionProject;
    pattern?: ImportedAnimalCrossingPattern;
  }>;
  example(): Promise<File>;
  saveQr(pixels: PixelBuffer, name: string): Promise<void>;
  save(result: AnimalCrossingResult, name: string): Promise<void>;
}
