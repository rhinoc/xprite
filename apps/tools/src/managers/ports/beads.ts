import type { ToolWheelInput } from "$/managers/ports/preview";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  BeadDocumentLabels,
  BeadGrid,
  BeadBoardSize,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

export interface BeadInput {
  pixels: PixelBuffer;
  project?: SessionProject;
}

export interface BeadToolPort {
  read(file: File): Promise<BeadInput>;
  example(): Promise<File>;
  readWheel(event: WheelEvent): ToolWheelInput;
  edit(pixels: PixelBuffer, name: string): Promise<void>;
  savePng(
    grid: BeadGrid,
    brand: string,
    showCodes: boolean,
    boardSize: BeadBoardSize,
    name: string,
    labels: BeadDocumentLabels,
  ): Promise<void>;
  savePdf(
    grid: BeadGrid,
    brand: string,
    showCodes: boolean,
    boardSize: BeadBoardSize,
    name: string,
    labels: BeadDocumentLabels,
    onProgress: (progress: number) => void,
  ): Promise<void>;
}
