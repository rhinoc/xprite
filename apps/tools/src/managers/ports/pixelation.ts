import type { ToolWheelInput } from "$/managers/ports/preview";
import type { Rgba } from "@xprite/editor-core/base";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  PixelateOptions,
  PixelationAlgorithm,
  PixelationSize,
  PixelGridAnalysis,
} from "@xprite/editor-core/import-export";
import type { PaletteBrowserChoice } from "@xprite/editor-ui/palette/model";
export interface PixelationPort {
  readWheel(event: WheelEvent): ToolWheelInput;
  paletteResources(): { choices: readonly PaletteBrowserChoice[] };
  detectGrid(
    image: PixelBuffer,
    algorithm?: PixelationAlgorithm,
    size?: PixelationSize,
  ): Promise<PixelGridAnalysis>;
  read(file: File): Promise<PixelBuffer>;
  example(): Promise<File>;
  convert(image: PixelBuffer, options: PixelateOptions): Promise<PixelBuffer>;
  save(pixels: PixelBuffer, name: string): Promise<void>;
  edit(pixels: PixelBuffer, name: string, palette?: readonly Rgba[]): Promise<void>;
  /** Start the background worker as a file starts opening, so its startup overlaps the read. */
  prepare(): void;
  dispose(): void;
}
