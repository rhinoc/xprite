import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  ExportAnimationSourceFrame,
  ExportRasterPlan,
  GifEncodeOptions,
  RgbChannels,
} from "@xprite/editor-core/import-export";

export interface RasterEncodeTransferOptions {
  /** True only when the caller owns a detached buffer that will not be read again. */
  transfer?: boolean;
}

/** Browser-backed raster encoding port supporting streaming PNG, hybrid JPEG, and Worker GIF. */
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
  encodeGifSources(
    frames: readonly ExportAnimationSourceFrame[],
    options?: GifEncodeOptions & RasterEncodeTransferOptions,
  ): Promise<Blob>;
  encodeGifBuffer(
    pixels: PixelBuffer,
    options?: GifEncodeOptions & RasterEncodeTransferOptions & { duration?: number },
  ): Promise<Blob>;
}
