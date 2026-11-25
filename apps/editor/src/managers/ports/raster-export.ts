import type { PixelBuffer } from "@xprite/editor-core/base";
import type { ExportRasterPlan, RgbChannels } from "@xprite/editor-core/import-export";

export interface RasterEncodeTransferOptions {
  /** True only when the caller owns a detached buffer that will not be read again. */
  transfer?: boolean;
}

/** Browser-backed raster encoding port supporting streaming PNG and hybrid canvas/streaming JPEG. */
export interface RasterExportPort {
  encodePngPlan(plan: ExportRasterPlan, options?: RasterEncodeTransferOptions): Promise<Blob>;
  encodePngBuffer(pixels: PixelBuffer, options?: RasterEncodeTransferOptions): Promise<Blob>;
  encodeJpegPlan(
    plan: ExportRasterPlan,
    qualityPercent: number,
    options?: RasterEncodeTransferOptions,
  ): Promise<Blob>;
  encodeJpegBuffer(
    pixels: PixelBuffer,
    qualityPercent: number,
    options?: RasterEncodeTransferOptions & { matte?: RgbChannels },
  ): Promise<Blob>;
}
