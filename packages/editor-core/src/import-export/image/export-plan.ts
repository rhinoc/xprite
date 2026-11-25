import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rect } from "$/base/primitives";
import { workingColorProfile } from "$/color/icc-profile";
import { convertPixelsToSrgb } from "$/color/icc-profile";
import { ensureTimeline, syncTimeline } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import type { AsepriteTagDirection } from "$/import-export/aseprite/model";
import {
  WebpCompression,
  MAX_WEBP_LOOP_COUNT,
  assertWebpDimensions,
} from "$/import-export/image/webp-container";
import { assertAnimationLoopCount } from "$/timeline/animation-loop";
import { layerSubtree } from "$/timeline/layer-operations";
import { renderTimelineFrame, layerAncestors } from "$/timeline/timeline";
import {
  imageDimensionsWithinLimits,
  type ImageDimensionLimits,
} from "@xprite/bedrock/common/image-dimensions";
import type { RgbaRowSource } from "@xprite/bedrock/common/png-encode";

/** Aseprite Export File settings, shared by raster, animation and sheet output. */
export interface ExportFileOptions {
  name: string;
  scalePercent: number;
  area: "canvas" | "selection";
  layers: "visible" | "selected";
  frame: number;
  frames?: "current" | "all" | "selected" | `tag:${string}`;
  direction?: AsepriteTagDirection;
  playSubtags?: boolean;
  pixelRatio?: boolean;
  ignoreEmpty?: boolean;
  /** Total animation plays; zero means infinite. */
  loopCount?: number;
  forTwitter?: boolean;
  gifInterlaced?: boolean;
  gifPreservePaletteOrder?: boolean;
  /** Browser JPEG/WebP quality, from 0 to 100. */
  imageQualityPercent?: number;
  webpCompression?: WebpCompression;
  /** Opaque sRGB JPEG background, formatted as #rrggbb. */
  jpegMatte?: string;
}

/** A final-output constraint, not a restriction on intermediate sheet samples. */
export class ImageExportLimitError extends RangeError {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    super(
      `Output ${width} × ${height} exceeds the image limit. Reduce Resize (%) or export a smaller area.`,
    );
    this.name = "ImageExportLimitError";
  }
}

const PORTABLE_EXPORT_LIMITS: Readonly<ImageDimensionLimits> = {
  maxWidth: MAX_IMAGE_DIMENSION,
  maxHeight: MAX_IMAGE_DIMENSION,
  maxPixels: MAX_IMAGE_PIXELS,
};

export function assertExportEncodingDimensions(
  width: number,
  height: number,
  name: string,
  compression?: WebpCompression,
): void {
  if (/\.webp$/i.test(name.trim()))
    assertWebpDimensions(width, height, compression === WebpCompression.Lossy);
  // PNG, JPEG, GIF, and APNG all have portable streaming encoders, so they follow
  // editor-core's dimension and pixel budget rather than browser 2D canvas edge caps.
  if (!imageDimensionsWithinLimits(width, height, PORTABLE_EXPORT_LIMITS))
    throw new ImageExportLimitError(width, height);
}

/** Validate final animation/sequence output before any pixel rendering. */
export function inspectExportOutput(
  document: EditorDocument,
  options: ExportFileOptions,
  frameCount: number,
): ReturnType<typeof exportGeometry> {
  const geometry = exportGeometry(document, options);
  assertExportEncodingDimensions(
    geometry.width,
    geometry.height,
    options.name,
    options.webpCompression,
  );
  if (geometry.width * geometry.height * frameCount > MAX_IMAGE_PIXELS)
    throw new ImageExportLimitError(geometry.width, geometry.height);
  return geometry;
}

export function exportGeometry(
  document: EditorDocument,
  options: ExportFileOptions,
): { bounds: Rect; width: number; height: number } {
  if (options.loopCount !== undefined) assertAnimationLoopCount(options.loopCount);
  if (!options.name.trim() || !/\.(png|apng|gif|jpe?g|webp)$/i.test(options.name.trim()))
    throw new Error("Use PNG, APNG, GIF, JPEG, or WebP for export.");
  if (/\.jpe?g$/i.test(options.name.trim()) && options.frames && options.frames !== "current")
    throw new Error("JPEG exports require the current frame.");
  if (/\.webp$/i.test(options.name.trim())) {
    if (
      options.webpCompression !== undefined &&
      !Object.values(WebpCompression).includes(options.webpCompression)
    )
      throw new Error("Unsupported WebP compression mode");
    if (
      options.frames &&
      options.frames !== "current" &&
      (options.loopCount ?? document.timeline?.loopCount ?? 0) > MAX_WEBP_LOOP_COUNT
    )
      throw new RangeError("WebP supports at most 65535 complete plays; use 0 for infinity");
  }
  if (
    options.imageQualityPercent !== undefined &&
    (!Number.isFinite(options.imageQualityPercent) ||
      options.imageQualityPercent < 0 ||
      options.imageQualityPercent > 100)
  )
    throw new RangeError("Export quality must be between 0 and 100.");
  if (options.jpegMatte !== undefined && !/^#[0-9a-f]{6}$/i.test(options.jpegMatte))
    throw new Error("JPEG background must use #rrggbb.");
  if (
    !["canvas", "selection"].includes(options.area) ||
    !["visible", "selected"].includes(options.layers)
  )
    throw new Error("Unsupported export option.");
  if (!Number.isFinite(options.scalePercent) || options.scalePercent <= 0)
    throw new RangeError("Invalid export resize.");
  if (
    !Number.isInteger(options.frame) ||
    options.frame < 0 ||
    options.frame >= (document.timeline?.frames.length ?? 1)
  )
    throw new RangeError("Invalid export frame.");
  if (options.area === "selection" && !document.selection)
    throw new Error("No selection to export.");
  // Aseprite SaveFile uses mask bounds, not the nonrectangular mask pixels.
  const bounds =
    options.area === "selection"
      ? document.selection!
      : { x: 0, y: 0, width: document.width, height: document.height };
  const header = document.timeline?.asepriteSource?.header;
  const ratioX = options.pixelRatio ? header?.pixelWidth || 1 : 1;
  const ratioY = options.pixelRatio ? header?.pixelHeight || 1 : 1;
  const width = Math.max(1, Math.floor((bounds.width * options.scalePercent * ratioX) / 100));
  const height = Math.max(1, Math.floor((bounds.height * options.scalePercent * ratioY) / 100));
  if (/\.webp$/i.test(options.name.trim()))
    assertWebpDimensions(width, height, options.webpCompression === WebpCompression.Lossy);
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) ||
    bounds.width < 1 ||
    bounds.height < 1 ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new ImageExportLimitError(width, height);
  return { bounds, width, height };
}

const DEFAULT_JPEG_MATTE = "#ffffff";
const RGBA_CHANNELS = 4;
const TWITTER_OPAQUE_ALPHA = 254;

export type RgbChannels = readonly [number, number, number];

/** Detached unscaled export frame and target geometry for zero-materialization streaming encoders. */
export interface ExportRasterPlan {
  readonly source: PixelBuffer;
  readonly bounds: Rect;
  readonly width: number;
  readonly height: number;
  readonly jpegMatte?: RgbChannels;
  readonly forTwitterOpaqueTweak?: boolean;
}

export function parseJpegMatte(matte = DEFAULT_JPEG_MATTE): RgbChannels {
  return [
    Number.parseInt(matte.slice(1, 3), 16),
    Number.parseInt(matte.slice(3, 5), 16),
    Number.parseInt(matte.slice(5, 7), 16),
  ];
}

function sampleColumns(bounds: Rect, width: number): Int32Array {
  return Int32Array.from(
    { length: width },
    (_, x) => bounds.x + Math.floor((x * bounds.width) / width),
  );
}

export function hasNonEmptyExportPixels(
  source: PixelBuffer,
  bounds: Rect,
  width: number,
  height: number,
): boolean {
  const columns = sampleColumns(bounds, width);
  let previousSy = -1;
  for (let y = 0; y < height; y++) {
    const sy = bounds.y + Math.floor((y * bounds.height) / height);
    if (sy === previousSy) continue;
    previousSy = sy;
    if (sy < 0 || sy >= source.height) continue;
    const rowOffset = sy * source.width;
    for (let x = 0; x < width; x++) {
      const sx = columns[x];
      if (sx >= 0 && sx < source.width && source.data[(rowOffset + sx) * RGBA_CHANNELS + 3] !== 0)
        return true;
    }
  }
  return false;
}

export function isExportRasterFullyOpaque(
  source: PixelBuffer,
  bounds: Rect,
  width: number,
  height: number,
): boolean {
  const columns = sampleColumns(bounds, width);
  let previousSy = -1;
  for (let y = 0; y < height; y++) {
    const sy = bounds.y + Math.floor((y * bounds.height) / height);
    if (sy === previousSy) continue;
    previousSy = sy;
    if (sy < 0 || sy >= source.height) return false;
    const rowOffset = sy * source.width;
    for (let x = 0; x < width; x++) {
      const sx = columns[x];
      if (
        sx < 0 ||
        sx >= source.width ||
        source.data[(rowOffset + sx) * RGBA_CHANNELS + 3] !== UINT8_MAX
      )
        return false;
    }
  }
  return true;
}

/** Synchronous unscaled composite before any browser await so encoders can stream-scale rows. */
export function renderExportSource(
  document: EditorDocument,
  options: ExportFileOptions,
): ExportRasterPlan {
  const { bounds, width, height } = exportGeometry(document, options);
  const detached = { ...document, layer: { ...document.layer } };
  ensureTimeline(detached);
  syncTimeline(detached);
  let timeline = detached.timeline!;
  if (options.layers === "selected") {
    const roots = timeline.range?.layers.length ? timeline.range.layers : [timeline.activeLayer];
    const selected = new Set(roots.flatMap((index) => layerSubtree(timeline, index)));
    for (const index of selected)
      for (const ancestor of layerAncestors(timeline, index))
        selected.add(timeline.layers.indexOf(ancestor));
    timeline = {
      ...timeline,
      layers: timeline.layers.map((layer, index) => ({ ...layer, visible: selected.has(index) })),
    };
  }
  const source = convertPixelsToSrgb(
    renderTimelineFrame(timeline, document.width, document.height, options.frame, undefined, false),
    workingColorProfile(timeline),
  );
  const jpegMatte = /\.jpe?g$/i.test(options.name.trim())
    ? parseJpegMatte(options.jpegMatte)
    : undefined;
  const forTwitterOpaqueTweak =
    Boolean(options.forTwitter && /\.png$/i.test(options.name.trim())) &&
    isExportRasterFullyOpaque(source, bounds, width, height);
  return {
    source,
    bounds,
    width,
    height,
    ...(jpegMatte ? { jpegMatte } : {}),
    ...(forTwitterOpaqueTweak ? { forTwitterOpaqueTweak } : {}),
  };
}

/** Stream nearest-neighbor cropped/scaled RGBA rows on demand without allocating the full scaled raster. */
export function createExportRowSource(plan: ExportRasterPlan): RgbaRowSource {
  const { source, bounds, width, height, jpegMatte, forTwitterOpaqueTweak } = plan;
  const rowBytes = width * RGBA_CHANNELS;
  const identity =
    bounds.x === 0 &&
    bounds.y === 0 &&
    width === source.width &&
    height === source.height &&
    bounds.width === width &&
    bounds.height === height;
  const columns = identity ? null : sampleColumns(bounds, width);
  const inputWords =
    source.data.byteOffset % RGBA_CHANNELS === 0
      ? new Uint32Array(
          source.data.buffer,
          source.data.byteOffset,
          Math.floor(source.data.byteLength / RGBA_CHANNELS),
        )
      : null;
  const previousRow = new Uint8Array(rowBytes);
  let previousSy = Number.NaN;
  const matteR = jpegMatte?.[0] ?? 0;
  const matteG = jpegMatte?.[1] ?? 0;
  const matteB = jpegMatte?.[2] ?? 0;

  return {
    width,
    height,
    fillRow(y: number, target: Uint8Array): boolean {
      const sy = identity ? y : bounds.y + Math.floor((y * bounds.height) / height);
      const needsTwitterTweak = Boolean(forTwitterOpaqueTweak && y === height - 1);
      if (y > 0 && sy === previousSy) {
        target.set(previousRow, 0);
        if (needsTwitterTweak) {
          target[rowBytes - 1] = TWITTER_OPAQUE_ALPHA;
          return false;
        }
        return true;
      }

      if (sy < 0 || sy >= source.height) {
        if (jpegMatte) {
          for (let offset = 0; offset < rowBytes; offset += RGBA_CHANNELS) {
            target[offset] = matteR;
            target[offset + 1] = matteG;
            target[offset + 2] = matteB;
            target[offset + 3] = UINT8_MAX;
          }
        } else {
          target.fill(0, 0, rowBytes);
        }
      } else if (identity) {
        const sourceOffset = sy * rowBytes;
        target.set(source.data.subarray(sourceOffset, sourceOffset + rowBytes), 0);
      } else if (inputWords && target.byteOffset % RGBA_CHANNELS === 0) {
        const outputWords = new Uint32Array(target.buffer, target.byteOffset, width);
        const sourceRow = sy * source.width;
        for (let x = 0; x < width; x++) {
          const sx = columns![x];
          outputWords[x] = sx >= 0 && sx < source.width ? inputWords[sourceRow + sx] : 0;
        }
      } else {
        const sourceRow = sy * source.width;
        for (let x = 0; x < width; x++) {
          const sx = columns![x];
          const destOffset = x * RGBA_CHANNELS;
          if (sx >= 0 && sx < source.width) {
            const srcOffset = (sourceRow + sx) * RGBA_CHANNELS;
            target[destOffset] = source.data[srcOffset];
            target[destOffset + 1] = source.data[srcOffset + 1];
            target[destOffset + 2] = source.data[srcOffset + 2];
            target[destOffset + 3] = source.data[srcOffset + 3];
          } else {
            target[destOffset] = 0;
            target[destOffset + 1] = 0;
            target[destOffset + 2] = 0;
            target[destOffset + 3] = 0;
          }
        }
      }

      if (jpegMatte && sy >= 0 && sy < source.height) {
        for (let offset = 0; offset < rowBytes; offset += RGBA_CHANNELS) {
          const alphaByte = target[offset + 3];
          if (alphaByte < UINT8_MAX) {
            const alpha = alphaByte / UINT8_MAX;
            const inv = 1 - alpha;
            target[offset] = Math.round(target[offset] * alpha + matteR * inv);
            target[offset + 1] = Math.round(target[offset + 1] * alpha + matteG * inv);
            target[offset + 2] = Math.round(target[offset + 2] * alpha + matteB * inv);
            target[offset + 3] = UINT8_MAX;
          }
        }
      }

      previousRow.set(target.subarray(0, rowBytes), 0);
      previousSy = sy;
      if (needsTwitterTweak) {
        target[rowBytes - 1] = TWITTER_OPAQUE_ALPHA;
      }
      return false;
    },
  };
}

/** Materialize an ExportRasterPlan into a contiguous PixelBuffer when a codec requires one. */
export function materializeExportRaster(plan: ExportRasterPlan): PixelBuffer {
  const { source, bounds, width, height, jpegMatte } = plan;
  if (
    bounds.x === 0 &&
    bounds.y === 0 &&
    width === source.width &&
    height === source.height &&
    bounds.width === width &&
    bounds.height === height &&
    !plan.forTwitterOpaqueTweak
  ) {
    return jpegMatte ? compositeJpegMatteChannels(source, jpegMatte) : source;
  }
  const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  const bytes = new Uint8Array(data.buffer);
  const rowBytes = width * RGBA_CHANNELS;
  const rowSource = createExportRowSource(plan);
  for (let y = 0; y < height; y++) {
    rowSource.fillRow(y, bytes.subarray(y * rowBytes, (y + 1) * rowBytes));
  }
  return { width, height, data };
}

/** Synchronous detached rendering before any browser await. Never modifies the
 * source document, timeline visibility, selection, filename, or dirty/history. */
export function renderExport(document: EditorDocument, options: ExportFileOptions): PixelBuffer {
  const plan = renderExportSource(document, options);
  return materializeExportRaster(
    plan.forTwitterOpaqueTweak ? { ...plan, forTwitterOpaqueTweak: false } : plan,
  );
}

function compositeJpegMatteChannels(pixels: PixelBuffer, channels: RgbChannels): PixelBuffer {
  for (let offset = 0; offset < pixels.data.length; offset += RGBA_CHANNELS) {
    const alphaByte = pixels.data[offset + 3];
    if (alphaByte < UINT8_MAX) {
      const alpha = alphaByte / UINT8_MAX;
      const inv = 1 - alpha;
      pixels.data[offset] = Math.round(pixels.data[offset] * alpha + channels[0] * inv);
      pixels.data[offset + 1] = Math.round(pixels.data[offset + 1] * alpha + channels[1] * inv);
      pixels.data[offset + 2] = Math.round(pixels.data[offset + 2] * alpha + channels[2] * inv);
      pixels.data[offset + 3] = UINT8_MAX;
    }
  }
  return pixels;
}
