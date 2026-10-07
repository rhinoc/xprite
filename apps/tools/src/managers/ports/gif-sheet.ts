import type { ToolWheelInput } from "$/managers/ports/preview";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { RasterAnimation } from "@xprite/editor-core/import-export";
import type { AppearanceMode } from "@xprite/editor-ui/appearance";

export interface GifSheetPort {
  readWheel(event: WheelEvent): ToolWheelInput;
  readAppearance(): AppearanceMode;
  watchAppearance(listener: (mode: AppearanceMode) => void): () => void;
  read(file: File): Promise<RasterAnimation>;
  example(): Promise<File>;
  savePng(pixels: PixelBuffer, name: string): Promise<void>;
  saveJson(content: string, name: string): Promise<void>;
}
