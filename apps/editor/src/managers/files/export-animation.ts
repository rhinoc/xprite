import { tUi } from "$/i18n";
import {
  DEFAULT_IMAGE_EXPORT_QUALITY,
  DEFAULT_JPEG_MATTE,
  ImageExportFormat,
  writeImageExportPreferences,
} from "$/managers/files/export-format-preferences";
import type { ExportRecord } from "$/managers/files/export-preferences";
import {
  validateImageExport,
  localizeImageExportError,
} from "$/managers/files/image-export-validation";
import type { ExportArtifact } from "$/managers/ports/export-output";
import type { RasterExportPort } from "$/managers/ports/raster-export";
import type { WebpExportPort } from "$/managers/ports/webp-export";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import {
  compressPngScanlines,
  encodePngBlob as encodePng,
  encodePngRowSource,
  encodeImageBlob,
  ImageEncodingFormat,
  isImageEncodingSupported,
} from "@xprite/bedrock/browser/images";
import type { JsonStoragePort } from "@xprite/bedrock/browser/json-storage";
import {
  CANVAS_ENCODE_SAFE_PIXELS,
  CANVAS_IMAGE_MAX_DIMENSION,
} from "@xprite/bedrock/common/image-dimensions";
import { createPixelBufferRowSource } from "@xprite/bedrock/common/png-encode";
import type { ExportFileOptions } from "@xprite/editor-core";
import { workingColorProfile } from "@xprite/editor-core/color";
import { colorProfileToSrgb } from "@xprite/editor-core/color";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  WebpCompression,
  createExportRowSource,
  encodeApngParts,
  encodeGif,
  encodeJpegChunks,
  materializeExportRaster,
  parseJpegMatte,
  renderExportAnimation,
  renderExportAnimationSources,
  sequenceFilename,
  renderSpriteSheet,
  type CompressedApngFrame,
  type ExportRasterPlan,
  type RgbChannels,
  type SpriteSheetOptions,
  type SpriteSheetResult,
} from "@xprite/editor-core/import-export";
import { animationExportLoopCount } from "@xprite/editor-core/timeline";

export interface ExportExecutionPorts {
  webp?: WebpExportPort;
  raster?: RasterExportPort;
  encodePng?: typeof encodePng;
  encodeImage?: typeof encodeImageBlob;
  save?(artifact: ExportArtifact): Promise<void>;
  storage?: JsonStoragePort;
  rememberExport?(record: ExportRecord): void;
}
export enum SpriteSheetOutputFormat {
  Png = "png",
  Jpeg = "jpeg",
  Gif = "gif",
  Webp = "webp",
  Apng = "apng",
}
const SPRITE_SHEET_FRAME_DURATION_MS = 100;
const SPRITE_SHEET_SOURCE_FRAME_INDEX = 0;
const SINGLE_SPRITE_SHEET_PLAY_COUNT = 1;
const IMAGE_QUALITY_PERCENT_SCALE = 100;

export class UnsupportedSpriteSheetOutputFormatError extends Error {
  constructor() {
    super("Unsupported sprite sheet output format.");
    this.name = "UnsupportedSpriteSheetOutputFormatError";
  }
}

export class SpriteSheetOutputEncoderUnavailableError extends Error {
  constructor(readonly format: SpriteSheetOutputFormat) {
    super(`The ${format} sprite sheet encoder is unavailable.`);
    this.name = "SpriteSheetOutputEncoderUnavailableError";
  }
}

function spriteSheetOutputFormat(name: string): SpriteSheetOutputFormat | null {
  if (/\.png$/i.test(name)) return SpriteSheetOutputFormat.Png;
  if (/\.jpe?g$/i.test(name)) return SpriteSheetOutputFormat.Jpeg;
  if (/\.gif$/i.test(name)) return SpriteSheetOutputFormat.Gif;
  if (/\.webp$/i.test(name)) return SpriteSheetOutputFormat.Webp;
  if (/\.apng$/i.test(name)) return SpriteSheetOutputFormat.Apng;
  return null;
}

export async function downloadExportArtifact({ name, blob }: ExportArtifact): Promise<void> {
  downloadBlob(blob, name);
}
function toArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? (bytes as Uint8Array<ArrayBuffer>)
    : new Uint8Array(bytes);
}

function canUseCanvasJpeg(width: number, height: number): boolean {
  return (
    width <= CANVAS_IMAGE_MAX_DIMENSION &&
    height <= CANVAS_IMAGE_MAX_DIMENSION &&
    width * height <= CANVAS_ENCODE_SAFE_PIXELS
  );
}

async function encodeJpegPlanFallback(
  plan: ExportRasterPlan,
  qualityPercent: number,
  encodeImage?: typeof encodeImageBlob,
): Promise<Blob> {
  if (encodeImage) {
    const blob = await encodeImage(
      materializeExportRaster(plan),
      ImageEncodingFormat.Jpeg,
      qualityPercent / IMAGE_QUALITY_PERCENT_SCALE,
    );
    if (blob.type.toLowerCase() !== ImageEncodingFormat.Jpeg)
      throw new Error(tUi("ui.image.encoding.unsupported", { format: ImageEncodingFormat.Jpeg }));
    return blob;
  }
  if (canUseCanvasJpeg(plan.width, plan.height)) {
    try {
      return await encodeImageBlob(
        materializeExportRaster(plan),
        ImageEncodingFormat.Jpeg,
        qualityPercent / IMAGE_QUALITY_PERCENT_SCALE,
      );
    } catch {
      // Fall back to the portable streaming JPEG encoder.
    }
  }
  return new Blob(encodeJpegChunks(createExportRowSource(plan), qualityPercent), {
    type: ImageEncodingFormat.Jpeg,
  });
}

async function encodeJpegBufferFallback(
  pixels: SpriteSheetResult["pixels"],
  qualityPercent: number,
  matte: RgbChannels | undefined,
  encodeImage?: typeof encodeImageBlob,
): Promise<Blob> {
  if (encodeImage) {
    return encodeImage(
      pixels,
      ImageEncodingFormat.Jpeg,
      qualityPercent / IMAGE_QUALITY_PERCENT_SCALE,
    );
  }
  if (canUseCanvasJpeg(pixels.width, pixels.height) && !matte) {
    try {
      return await encodeImageBlob(
        pixels,
        ImageEncodingFormat.Jpeg,
        qualityPercent / IMAGE_QUALITY_PERCENT_SCALE,
      );
    } catch {
      // Fall back to the portable streaming JPEG encoder.
    }
  }
  return new Blob(encodeJpegChunks(createPixelBufferRowSource(pixels), qualityPercent, matte), {
    type: ImageEncodingFormat.Jpeg,
  });
}

export async function exportDocumentAnimation(
  doc: EditorDocument,
  options: ExportFileOptions,
  ports: ExportExecutionPorts = {},
): Promise<{ names: string[]; artifacts: ExportArtifact[] }> {
  // Render all source state before the first await; selection/edits/tab switches
  // while encoding cannot mix frames from different document revisions.
  validateImageExport(doc, options);
  const name = options.name.trim();
  const palette = doc.palette?.map((c) => colorProfileToSrgb(c, workingColorProfile(doc.timeline)));
  const artifacts: ExportArtifact[] = [];
  const loopCount = animationExportLoopCount(doc.timeline?.loopCount, options);
  if (/\.webp$/i.test(name)) {
    if (!ports.webp) throw new Error(tUi("ui.webp.export.unavailable"));
    const frames = renderExportAnimation(doc, options);
    const blob = await ports.webp.encode(frames, {
      compression: options.webpCompression ?? WebpCompression.Lossless,
      qualityPercent: options.imageQualityPercent ?? DEFAULT_IMAGE_EXPORT_QUALITY,
      animated: frames.length > 1 || (!!options.frames && options.frames !== "current"),
      loopCount,
    });
    if (blob.type.toLowerCase() !== "image/webp")
      throw new Error(tUi("ui.webp.export.type.unexpected"));
    artifacts.push({ name, blob });
  } else if (/\.jpe?g$/i.test(name)) {
    const sourceFrames = renderExportAnimationSources(doc, options);
    const qualityPercent = options.imageQualityPercent ?? DEFAULT_IMAGE_EXPORT_QUALITY;
    const blob = ports.raster
      ? await ports.raster.encodeJpegPlan(sourceFrames[0].plan, qualityPercent, { transfer: true })
      : await encodeJpegPlanFallback(sourceFrames[0].plan, qualityPercent, ports.encodeImage);
    if (blob.type.toLowerCase() !== ImageEncodingFormat.Jpeg)
      throw new Error(tUi("ui.image.encoding.unsupported", { format: ImageEncodingFormat.Jpeg }));
    artifacts.push({ name, blob });
  } else if (/\.gif$/i.test(name)) {
    const frames = renderExportAnimation(doc, options);
    const encoded = encodeGif(frames, {
      loopCount,
      interlaced: options.gifInterlaced,
      forTwitter: options.forTwitter,
      palette: options.gifPreservePaletteOrder ? palette : undefined,
    });
    artifacts.push({
      name,
      blob: new Blob([toArrayBufferBytes(encoded)], { type: "image/gif" }),
    });
  } else if (/\.apng$/i.test(name)) {
    const sourceFrames = renderExportAnimationSources(doc, options);
    const compressedBySource = new Map<number, Uint8Array<ArrayBuffer>[]>();
    const compressedFrames: CompressedApngFrame[] = [];
    for (const frame of sourceFrames) {
      let compressed = compressedBySource.get(frame.sourceFrame);
      if (!compressed) {
        compressed = await compressPngScanlines(createExportRowSource(frame.plan));
        compressedBySource.set(frame.sourceFrame, compressed);
      }
      compressedFrames.push({
        width: frame.plan.width,
        height: frame.plan.height,
        duration: frame.duration,
        compressed,
      });
    }
    artifacts.push({
      name,
      blob: new Blob(encodeApngParts(compressedFrames, loopCount), { type: "image/apng" }),
    });
  } else {
    const sourceFrames = renderExportAnimationSources(doc, options);
    const frameUseCount = new Map<number, number>();
    for (const frame of sourceFrames) {
      frameUseCount.set(frame.sourceFrame, (frameUseCount.get(frame.sourceFrame) ?? 0) + 1);
    }
    for (let i = 0; i < sourceFrames.length; i++) {
      const frame = sourceFrames[i];
      const transfer = frameUseCount.get(frame.sourceFrame) === 1;
      const blob = ports.raster
        ? await ports.raster.encodePngPlan(frame.plan, { transfer })
        : ports.encodePng
          ? await ports.encodePng(materializeExportRaster(frame.plan))
          : await encodePngRowSource(createExportRowSource(frame.plan));
      artifacts.push({
        name: sequenceFilename(name, i, sourceFrames.length),
        blob,
      });
    }
  }
  for (const artifact of artifacts) await (ports.save ?? downloadExportArtifact)(artifact);
  if (/\.(jpe?g|webp)$/i.test(name))
    writeImageExportPreferences(
      /\.webp$/i.test(name) ? ImageExportFormat.Webp : ImageExportFormat.Jpeg,
      {
        qualityPercent: options.imageQualityPercent ?? DEFAULT_IMAGE_EXPORT_QUALITY,
        jpegMatte: options.jpegMatte ?? DEFAULT_JPEG_MATTE,
        webpCompression: options.webpCompression ?? WebpCompression.Lossless,
      },
      ports.storage,
    );
  return { names: artifacts.map((a) => a.name), artifacts };
}
export async function exportDocumentSpriteSheet(
  doc: EditorDocument,
  options: SpriteSheetOptions,
  ports: ExportExecutionPorts = {},
): Promise<SpriteSheetResult & { names: string[] }> {
  let result: SpriteSheetResult;
  try {
    result = renderSpriteSheet(doc, options);
  } catch (error) {
    throw localizeImageExportError(error);
  }
  const artifacts: ExportArtifact[] = [];
  if (options.imageEnabled) {
    const format = spriteSheetOutputFormat(options.name);
    if (!format) throw new UnsupportedSpriteSheetOutputFormatError();
    const frame = {
      pixels: result.pixels,
      duration: SPRITE_SHEET_FRAME_DURATION_MS,
      sourceFrame: SPRITE_SHEET_SOURCE_FRAME_INDEX,
    };
    let blob: Blob;
    switch (format) {
      case SpriteSheetOutputFormat.Png:
        blob = ports.raster
          ? await ports.raster.encodePngBuffer(result.pixels, { transfer: !options.openGenerated })
          : await (ports.encodePng ?? encodePng)(result.pixels);
        break;
      case SpriteSheetOutputFormat.Jpeg: {
        const qualityPercent = options.imageQualityPercent ?? DEFAULT_IMAGE_EXPORT_QUALITY;
        const matte = options.jpegMatte ? parseJpegMatte(options.jpegMatte) : undefined;
        blob = ports.raster
          ? await ports.raster.encodeJpegBuffer(result.pixels, qualityPercent, {
              transfer: !options.openGenerated,
              matte,
            })
          : await encodeJpegBufferFallback(result.pixels, qualityPercent, matte, ports.encodeImage);
        break;
      }
      case SpriteSheetOutputFormat.Gif:
        blob = new Blob(
          [toArrayBufferBytes(encodeGif([frame], { loopCount: SINGLE_SPRITE_SHEET_PLAY_COUNT }))],
          { type: "image/gif" },
        );
        break;
      case SpriteSheetOutputFormat.Webp: {
        if (!ports.webp) throw new SpriteSheetOutputEncoderUnavailableError(format);
        const losslessAvailable = ports.webp.supportsLossless();
        const compression =
          options.webpCompression ??
          (losslessAvailable ? WebpCompression.Lossless : WebpCompression.Lossy);
        if (compression === WebpCompression.Lossless && !losslessAvailable)
          throw new SpriteSheetOutputEncoderUnavailableError(format);
        if (
          compression === WebpCompression.Lossy &&
          !(await isImageEncodingSupported(ImageEncodingFormat.Webp))
        )
          throw new SpriteSheetOutputEncoderUnavailableError(format);
        const encodedFrame = options.openGenerated
          ? { ...frame, pixels: { ...frame.pixels, data: frame.pixels.data.slice() } }
          : frame;
        blob = await ports.webp.encode([encodedFrame], {
          compression,
          qualityPercent: options.imageQualityPercent ?? DEFAULT_IMAGE_EXPORT_QUALITY,
          animated: false,
          loopCount: SINGLE_SPRITE_SHEET_PLAY_COUNT,
        });
        if (blob.type.toLowerCase() !== ImageEncodingFormat.Webp)
          throw new Error(tUi("ui.webp.export.type.unexpected"));
        break;
      }
      case SpriteSheetOutputFormat.Apng: {
        const compressed = await compressPngScanlines(createPixelBufferRowSource(result.pixels));
        blob = new Blob(
          encodeApngParts(
            [
              {
                width: result.pixels.width,
                height: result.pixels.height,
                duration: SPRITE_SHEET_FRAME_DURATION_MS,
                compressed,
              },
            ],
            SINGLE_SPRITE_SHEET_PLAY_COUNT,
          ),
          { type: "image/apng" },
        );
        break;
      }
      default:
        throw new UnsupportedSpriteSheetOutputFormatError();
    }
    artifacts.push({ name: options.name, blob });
  }
  if (options.dataEnabled)
    artifacts.push({
      name: options.dataName,
      blob: new Blob([JSON.stringify(result.data, null, 2) + "\n"], { type: "application/json" }),
    });
  if (!artifacts.length && !options.openGenerated)
    throw new Error("Enable an output file or Open Sprite Sheet.");
  for (const artifact of artifacts) await (ports.save ?? downloadExportArtifact)(artifact);
  return { ...result, names: artifacts.map((a) => a.name) };
}
