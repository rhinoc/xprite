import type { ToolWheelInput } from "$/managers/ports/preview";
import type { Rgba } from "@xprite/editor-core/base";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  PixelateOptions,
  PixelationAlgorithm,
  PixelGridAnalysis,
} from "@xprite/editor-core/import-export";
import type { PaletteBrowserChoice } from "@xprite/editor-ui/palette/model";
export interface PixelationPort {
  readWheel(event: WheelEvent): ToolWheelInput;
  paletteResources(): { choices: readonly PaletteBrowserChoice[]; defaultPalette: readonly Rgba[] };
  detectGrid(image: PixelBuffer, algorithm?: PixelationAlgorithm): Promise<PixelGridAnalysis>;
  read(file: File): Promise<PixelBuffer>;
  example(): Promise<File>;
  convert(image: PixelBuffer, options: PixelateOptions): Promise<PixelBuffer>;
  save(pixels: PixelBuffer, name: string): Promise<void>;
  edit(pixels: PixelBuffer, name: string, palette?: readonly Rgba[]): Promise<void>;
  dispose(): void;
}
