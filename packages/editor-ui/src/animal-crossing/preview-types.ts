import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  AnimalCrossingResult,
  AnimalCrossingSettings,
} from "@xprite/editor-core/import-export/animal-crossing";

export interface AnimalCrossingPreview {
  result: AnimalCrossingResult;
  selected: number;
  qr: PixelBuffer;
}
export interface AnimalCrossingPreviewRequest {
  pixels?: PixelBuffer;
  settings: AnimalCrossingSettings;
  selected: number;
}
export type AnimalCrossingPreviewResponse =
  | { ok: true; preview: AnimalCrossingPreview }
  | { ok: false; message: string };
