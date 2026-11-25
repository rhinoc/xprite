import {
  RasterWorkerFormat,
  type RasterWorkerGifFrame,
  type RasterWorkerPixelBuffer,
  type RasterWorkerPlan,
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
  encodeGifRowSources,
  encodeJpegChunks,
  materializeExportRaster,
  type ExportAnimationSourceFrame,
  type ExportRasterPlan,
  type GifEncodeOptions,
  type RgbChannels,
} from "@xprite/editor-core/import-export";

const QUALITY_PERCENT_SCALE = 100;
const STREAMING_UPSCALE_FACTOR = 4;
const STREAMING_UPSCALE_MIN_PIXELS = 4_194_304;
const GIF_MIME_TYPE = "image/gif";
const DEFAULT_GIF_FRAME_DURATION_MS = 100;

function serializePlan(plan: ExportRasterPlan): RasterWorkerPlan {
  return {
    bounds: plan.bounds,
    width: plan.width,
    height: plan.height,
    jpegMatte: plan.jpegMatte,
    forTwitterOpaqueTweak: plan.forTwitterOpaqueTweak,
  };
}

function serializePixelBuffer(source: PixelBuffer): RasterWorkerPixelBuffer {
  return {
    width: source.width,
    height: source.height,
    data: source.data.buffer as ArrayBuffer,
    byteOffset: source.data.byteOffset,
    length: source.data.byteLength,
  };
}

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

function runWorkerEncode(
  request: RasterWorkerRequest,
  transferList: Transferable[],
): Promise<Blob> {
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
    worker.postMessage(request, transferList);
  }).finally(() => {
    worker.terminate();
  });
}

function encodeInProcess(
  format: RasterWorkerFormat.Png | RasterWorkerFormat.Jpeg,
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
  format: RasterWorkerFormat.Png | RasterWorkerFormat.Jpeg,
  source: PixelBuffer,
  options: {
    plan?: ExportRasterPlan;
    qualityPercent?: number;
    matte?: RgbChannels;
    transfer?: boolean;
  },
): Promise<Blob> {
  if (typeof Worker === "function" && source.data.buffer instanceof ArrayBuffer) {
    const serializedSource = serializePixelBuffer(source);
    const request: RasterWorkerRequest = {
      format,
      source: serializedSource,
      ...(options.plan ? { plan: serializePlan(options.plan) } : {}),
      ...(options.qualityPercent !== undefined ? { qualityPercent: options.qualityPercent } : {}),
      ...(options.matte ? { matte: options.matte } : {}),
    };
    return runWorkerEncode(request, options.transfer ? [serializedSource.data] : []);
  }
  return encodeInProcess(format, source, options.plan, options.qualityPercent, options.matte);
}

function stripTransferOption(
  options?: GifEncodeOptions & RasterEncodeTransferOptions & { duration?: number },
): GifEncodeOptions | undefined {
  if (!options) return undefined;
  return {
    ...(options.loopCount !== undefined ? { loopCount: options.loopCount } : {}),
    ...(options.interlaced !== undefined ? { interlaced: options.interlaced } : {}),
    ...(options.palette !== undefined ? { palette: options.palette } : {}),
    ...(options.forTwitter !== undefined ? { forTwitter: options.forTwitter } : {}),
  };
}

/** Streaming PNG (never uses 2D canvas), hybrid JPEG, and Worker-offloaded streaming GIF. */
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
    async encodeGifSources(
      frames: readonly ExportAnimationSourceFrame[],
      options?: GifEncodeOptions & RasterEncodeTransferOptions,
    ) {
      const gifOptions = stripTransferOption(options);
      if (
        typeof Worker === "function" &&
        frames.every((frame) => frame.plan.source.data.buffer instanceof ArrayBuffer)
      ) {
        const sourceIndices = new Map<PixelBuffer, number>();
        const sources: RasterWorkerPixelBuffer[] = [];
        const transferSet = new Set<ArrayBuffer>();
        const workerFrames: RasterWorkerGifFrame[] = frames.map((frame) => {
          let sourceIndex = sourceIndices.get(frame.plan.source);
          if (sourceIndex === undefined) {
            sourceIndex = sources.length;
            sourceIndices.set(frame.plan.source, sourceIndex);
            const serialized = serializePixelBuffer(frame.plan.source);
            sources.push(serialized);
            if (options?.transfer) transferSet.add(serialized.data);
          }
          return {
            sourceIndex,
            plan: serializePlan(frame.plan),
            duration: frame.duration,
            ...(frame.palette ? { palette: frame.palette } : {}),
          };
        });
        const request: RasterWorkerRequest = {
          format: RasterWorkerFormat.Gif,
          sources,
          frames: workerFrames,
          ...(gifOptions ? { options: gifOptions } : {}),
        };
        return runWorkerEncode(request, Array.from(transferSet));
      }
      const chunks = encodeGifRowSources(
        frames.map((frame) => ({
          rowSource: createExportRowSource(frame.plan),
          duration: frame.duration,
          palette: frame.palette,
        })),
        gifOptions,
      );
      return new Blob(chunks, { type: GIF_MIME_TYPE });
    },
    async encodeGifBuffer(
      pixels: PixelBuffer,
      options?: GifEncodeOptions & RasterEncodeTransferOptions & { duration?: number },
    ) {
      const gifOptions = stripTransferOption(options);
      const duration = options?.duration ?? DEFAULT_GIF_FRAME_DURATION_MS;
      if (typeof Worker === "function" && pixels.data.buffer instanceof ArrayBuffer) {
        const serialized = serializePixelBuffer(pixels);
        const request: RasterWorkerRequest = {
          format: RasterWorkerFormat.Gif,
          sources: [serialized],
          frames: [{ sourceIndex: 0, duration }],
          ...(gifOptions ? { options: gifOptions } : {}),
        };
        return runWorkerEncode(request, options?.transfer ? [serialized.data] : []);
      }
      const chunks = encodeGifRowSources(
        [{ rowSource: createPixelBufferRowSource(pixels), duration }],
        gifOptions,
      );
      return new Blob(chunks, { type: GIF_MIME_TYPE });
    },
  };
}
