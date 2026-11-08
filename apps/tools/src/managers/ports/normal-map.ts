import type { ToolWheelInput } from "$/managers/ports/preview";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { AppearanceMode } from "@xprite/editor-ui/appearance";

export interface NormalMapPort {
  readWheel(event: WheelEvent): ToolWheelInput;
  readAppearance(): AppearanceMode;
  watchAppearance(listener: (mode: AppearanceMode) => void): () => void;
  read(file: File): Promise<PixelBuffer>;
  example(): Promise<File>;
  savePng(pixels: PixelBuffer, name: string): Promise<void>;
  edit(pixels: PixelBuffer, name: string): Promise<void>;
}
