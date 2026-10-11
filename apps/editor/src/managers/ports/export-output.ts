import type { PixelBuffer } from "@xprite/editor-core/base";

export interface ExportArtifact {
  name: string;
  blob: Blob;
}

/** File encoding and saving are shared by the built-in exporters. */
export interface ExportOutputPort {
  encodePng(pixels: PixelBuffer): Promise<Blob>;
  save(artifact: ExportArtifact): Promise<void>;
}
