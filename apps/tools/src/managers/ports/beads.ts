import type { ToolWheelInput } from "$/managers/ports/preview";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { BeadGrid } from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

export interface BeadInput {
  pixels: PixelBuffer;
  project?: SessionProject;
}

export interface BeadToolPort {
  read(file: File): Promise<BeadInput>;
  example(): Promise<File>;
  readWheel(event: WheelEvent): ToolWheelInput;
  savePng(grid: BeadGrid, showCodes: boolean, boardSize: number, name: string): Promise<void>;
  savePdf(
    grid: BeadGrid,
    brand: string,
    showCodes: boolean,
    boardSize: number,
    name: string,
  ): Promise<void>;
}
