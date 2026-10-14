import type { PixelBuffer } from "@xprite/editor-core/base";
import type { ExportAttribution, ExportRasterText } from "@xprite/editor-core/import-export";

export interface ExportArtifact {
  name: string;
  blob: Blob;
}

/** File encoding and saving are shared by the built-in exporters. */
export interface ExportOutputPort {
  encodePng(pixels: PixelBuffer): Promise<Blob>;
  readAttribution(
    name: string,
    url: string,
    logoUrl: string,
    pixelFont: boolean,
  ): Promise<ExportAttribution>;
  readonly rasterText: ExportRasterText;
  save(artifact: ExportArtifact): Promise<void>;
}
