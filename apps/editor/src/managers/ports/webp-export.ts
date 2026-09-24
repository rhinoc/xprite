import type { ExportAnimationFrame, WebpCompression } from "@xprite/editor-core/import-export";

export interface WebpExportOptions {
  compression: WebpCompression;
  qualityPercent: number;
  animated: boolean;
  loopCount: number;
}

/** The encoder may consume the detached render buffers; canonical document pixels are never passed. */
export interface WebpExportPort {
  supportsLossless(): boolean;
  encode(frames: readonly ExportAnimationFrame[], options: WebpExportOptions): Promise<Blob>;
}
