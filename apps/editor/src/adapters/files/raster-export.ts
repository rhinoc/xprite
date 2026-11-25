import {
  RasterWorkerFormat,
  type RasterWorkerRequest,
  type RasterWorkerResponse,
} from "$/adapters/workers/raster-export-worker-types";
import { tUi } from "$/i18n";
import type { RasterEncodeTransferOptions, RasterExportPort } from "$/managers/ports/raster-export";
import {
  encodeImageBlob,
  encodePngRowSource,
  ImageEncodingFormat,
} from "@xprite/bedrock/browser/images";
import {
  CANVAS_ENCODE_SAFE_PIXELS,
  CANVAS_IMAGE_MAX_DIMENSION,
} from "@xprite/bedrock/common/image-dimensions";
import { createPixelBufferRowSource } from "@xprite/bedrock/common/png-encode";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  createExportRowSource,
  encodeJpegChunks,
  materializeExportRaster,
  type ExportRasterPlan,
  type RgbChannels,
} from "@xprite/editor-core/import-export";

const QUALITY_PERCENT_SCALE = 100;
const STREAMING_UPSCALE_FACTOR = 4;
const STREAMING_UPSCALE_MIN_PIXELS = 4_194_304;

function shouldStreamJpeg(width: number, height: number, sourcePixels: number): boolean {
  const outputPixels = width * height;
  if (
    width > CANVAS_IMAGE_MAX_DIMENSION ||
    height > CANVAS_IMAGE_MAX_DIMENSION ||
    outputPixels > CANVAS_ENCODE_SAFE_PIXELS
  ) {
    return true;
  }
  return (
    outputPixels > STREAMING_UPSCALE_MIN_PIXELS &&
    outputPixels >= sourcePixels * STREAMING_UPSCALE_FACTOR
  );
}

function runWorkerEncode(request: RasterWorkerRequest, transfer: boolean): Promise<Blob> {
  const worker = new Worker(new URL("../workers/raster-export-worker.ts", import.meta.url), {
    type: "module",
  });
  return new Promise<Blob>((resolve, reject) => {
    worker.onmessage = ({ data }: MessageEvent<RasterWorkerResponse>) => {
      if (data.ok) resolve(data.blob);
      else reject(new Error(data.message));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      reject(new Error(event.message || tUi("ui.image.export.worker.failed")));
    };
    worker.onmessageerror = () => reject(new Error(tUi("ui.image.export.output.unreadable")));
    worker.postMessage(request, transfer ? [request.source.data] : []);
  }).finally(() => {
    worker.terminate();
  });
}

function encodeInProcess(
  format: RasterWorkerFormat,
  source: PixelBuffer,
  plan?: ExportRasterPlan,
  qualityPercent?: number,
  matte?: RgbChannels,
): Promise<Blob> {
  const rowSource = plan ? createExportRowSource(plan) : createPixelBufferRowSource(source);
  if (format === RasterWorkerFormat.Png) return encodePngRowSource(rowSource);
  return Promise.resolve(
    new Blob(encodeJpegChunks(rowSource, qualityPercent, matte), {
      type: ImageEncodingFormat.Jpeg,
    }),
  );
}

async function encodePortable(
  format: RasterWorkerFormat,
  source: PixelBuffer,
  options: {
    plan?: ExportRasterPlan;
    qualityPercent?: number;
    matte?: RgbChannels;
    transfer?: boolean;
  },
): Promise<Blob> {
  if (typeof Worker === "function" && source.data.buffer instanceof ArrayBuffer) {
    const request: RasterWorkerRequest = {
      format,
      source: {
        width: source.width,
        height: source.height,
        data: source.data.buffer,
        byteOffset: source.data.byteOffset,
        length: source.data.byteLength,
      },
      ...(options.plan
        ? {
            plan: {
              bounds: options.plan.bounds,
              width: options.plan.width,
              height: options.plan.height,
              jpegMatte: options.plan.jpegMatte,
              forTwitterOpaqueTweak: options.plan.forTwitterOpaqueTweak,
            },
          }
        : {}),
      ...(options.qualityPercent !== undefined ? { qualityPercent: options.qualityPercent } : {}),
      ...(options.matte ? { matte: options.matte } : {}),
    };
    return runWorkerEncode(request, Boolean(options.transfer));
  }
  return encodeInProcess(format, source, options.plan, options.qualityPercent, options.matte);
}

/** Streaming PNG (never uses 2D canvas) + hybrid JPEG (native canvas for small images, streaming worker for wide/large images). */
export function createBrowserRasterExportPort(): RasterExportPort {
  return {
    encodePngPlan(plan: ExportRasterPlan, options?: RasterEncodeTransferOptions) {
      return encodePortable(RasterWorkerFormat.Png, plan.source, {
        plan,
        transfer: options?.transfer,
      });
    },
    encodePngBuffer(pixels: PixelBuffer, options?: RasterEncodeTransferOptions) {
      return encodePortable(RasterWorkerFormat.Png, pixels, {
        transfer: options?.transfer,
      });
    },
    async encodeJpegPlan(
      plan: ExportRasterPlan,
      qualityPercent: number,
      options?: RasterEncodeTransferOptions,
    ) {
      if (!shouldStreamJpeg(plan.width, plan.height, plan.source.width * plan.source.height)) {
        try {
          return await encodeImageBlob(
            materializeExportRaster(plan),
            ImageEncodingFormat.Jpeg,
            qualityPercent / QUALITY_PERCENT_SCALE,
          );
        } catch {
          // Fall back to the portable streaming encoder when native canvas JPEG is unavailable.
        }
      }
      return encodePortable(RasterWorkerFormat.Jpeg, plan.source, {
        plan,
        qualityPercent,
        transfer: options?.transfer,
      });
    },
    async encodeJpegBuffer(
      pixels: PixelBuffer,
      qualityPercent: number,
      options?: RasterEncodeTransferOptions & { matte?: RgbChannels },
    ) {
      if (
        !shouldStreamJpeg(pixels.width, pixels.height, pixels.width * pixels.height) &&
        !options?.matte
      ) {
        try {
          return await encodeImageBlob(
            pixels,
            ImageEncodingFormat.Jpeg,
            qualityPercent / QUALITY_PERCENT_SCALE,
          );
        } catch {
          // Fall back to the portable streaming encoder when native canvas JPEG is unavailable.
        }
      }
      return encodePortable(RasterWorkerFormat.Jpeg, pixels, {
        qualityPercent,
        matte: options?.matte,
        transfer: options?.transfer,
      });
    },
  };
}
