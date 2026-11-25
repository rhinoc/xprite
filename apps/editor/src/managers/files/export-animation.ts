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
import type { WebpExportPort } from "$/managers/ports/webp-export";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import {
  encodePngBlob as encodePng,
  encodeImageBlob,
  ImageEncodingFormat,
  isImageEncodingSupported,
} from "@xprite/bedrock/browser/images";
import type { JsonStoragePort } from "@xprite/bedrock/browser/json-storage";
import type { ExportFileOptions } from "@xprite/editor-core";
import { UINT8_MAX } from "@xprite/editor-core/base";
import { workingColorProfile } from "@xprite/editor-core/color";
import { colorProfileToSrgb } from "@xprite/editor-core/color";
import type { EditorDocument } from "@xprite/editor-core/document";
import { WebpCompression } from "@xprite/editor-core/import-export";
import {
  renderExportAnimation,
  sequenceFilename,
  encodeApng,
  encodeGif,
  pngScanlines,
} from "@xprite/editor-core/import-export";
import {
  renderSpriteSheet,
  type SpriteSheetOptions,
  type SpriteSheetResult,
} from "@xprite/editor-core/import-export";
import { animationExportLoopCount } from "@xprite/editor-core/timeline";

export interface ExportExecutionPorts {
  webp?: WebpExportPort;
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
async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes).buffer])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function exportDocumentAnimation(
  doc: EditorDocument,
  options: ExportFileOptions,
  ports: ExportExecutionPorts = {},
): Promise<{ names: string[]; artifacts: ExportArtifact[] }> {
  // Render all source state before the first await; selection/edits/tab switches
  // while encoding cannot mix frames from different document revisions.
  validateImageExport(doc, options);
  const frames = renderExportAnimation(doc, options),
    name = options.name.trim();
  const palette = doc.palette?.map((c) => colorProfileToSrgb(c, workingColorProfile(doc.timeline)));
  if (options.forTwitter && /\.png$/i.test(name))
    for (const frame of frames) {
      if (frame.pixels.data.every((v, i) => i % 4 !== 3 || v === UINT8_MAX))
        frame.pixels.data[frame.pixels.data.length - 1] = 254;
    }
  const artifacts: ExportArtifact[] = [];
  const loopCount = animationExportLoopCount(doc.timeline?.loopCount, options);
  if (/\.webp$/i.test(name)) {
    if (!ports.webp) throw new Error(tUi("ui.webp.export.unavailable"));
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
    const format = ImageEncodingFormat.Jpeg;
    const blob = await (ports.encodeImage ?? encodeImageBlob)(
      frames[0].pixels,
      format,
      (options.imageQualityPercent ?? DEFAULT_IMAGE_EXPORT_QUALITY) / 100,
    );
    if (blob.type.toLowerCase() !== format)
      throw new Error(tUi("ui.image.encoding.unsupported", { format }));
    artifacts.push({ name, blob });
  } else if (/\.gif$/i.test(name))
    artifacts.push({
      name,
      blob: new Blob(
        [
          new Uint8Array(
            encodeGif(frames, {
              loopCount,
              interlaced: options.gifInterlaced,
              forTwitter: options.forTwitter,
              palette: options.gifPreservePaletteOrder ? palette : undefined,
            }),
          ).buffer,
        ],
        { type: "image/gif" },
      ),
    });
  else if (/\.apng$/i.test(name)) {
    const compressed =
      typeof CompressionStream === "function"
        ? await Promise.all(frames.map((frame) => compress(pngScanlines(frame))))
        : undefined;
    artifacts.push({
      name,
      blob: new Blob([new Uint8Array(encodeApng(frames, loopCount, compressed)).buffer], {
        type: "image/apng",
      }),
    });
  } else
    for (let i = 0; i < frames.length; i++)
      artifacts.push({
        name: sequenceFilename(name, i, frames.length),
        blob: await (ports.encodePng ?? encodePng)(frames[i].pixels),
      });
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
        blob = await (ports.encodePng ?? encodePng)(result.pixels);
        break;
      case SpriteSheetOutputFormat.Jpeg:
        if (!(await isImageEncodingSupported(ImageEncodingFormat.Jpeg)))
          throw new SpriteSheetOutputEncoderUnavailableError(format);
        blob = await (ports.encodeImage ?? encodeImageBlob)(
          result.pixels,
          ImageEncodingFormat.Jpeg,
          (options.imageQualityPercent ?? DEFAULT_IMAGE_EXPORT_QUALITY) /
            IMAGE_QUALITY_PERCENT_SCALE,
        );
        break;
      case SpriteSheetOutputFormat.Gif:
        blob = new Blob(
          [
            new Uint8Array(encodeGif([frame], { loopCount: SINGLE_SPRITE_SHEET_PLAY_COUNT }))
              .buffer as ArrayBuffer,
          ],
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
      case SpriteSheetOutputFormat.Apng:
        blob = new Blob(
          [
            new Uint8Array(encodeApng([frame], SINGLE_SPRITE_SHEET_PLAY_COUNT))
              .buffer as ArrayBuffer,
          ],
          { type: "image/apng" },
        );
        break;
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
