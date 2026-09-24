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
    throw new RangeError("Export dimensions exceed the image limit.");
  return { bounds, width, height };
}

/** Synchronous detached rendering before any browser await. Never modifies the
 * source document, timeline visibility, selection, filename, or dirty/history. */
export function renderExport(document: EditorDocument, options: ExportFileOptions): PixelBuffer {
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
  if (
    bounds.x === 0 &&
    bounds.y === 0 &&
    width === source.width &&
    height === source.height &&
    bounds.width === width &&
    bounds.height === height
  )
    return compositeJpegMatte(source, options);
  const data = new Uint8ClampedArray(width * height * 4);
  // Both buffers are owned, aligned RGBA allocations. Copy whole pixels without
  // creating a temporary typed-array view for every output pixel.
  const input = new Uint32Array(
    source.data.buffer,
    source.data.byteOffset,
    source.data.byteLength / 4,
  );
  const output = new Uint32Array(data.buffer);
  const columns = Int32Array.from(
    { length: width },
    (_, x) => bounds.x + Math.floor((x * bounds.width) / width),
  );
  let previousRow = -1;
  for (let y = 0; y < height; y++) {
    const sy = bounds.y + Math.floor((y * bounds.height) / height);
    if (sy < 0 || sy >= source.height) continue;
    const row = y * width;
    if (y > 0 && sy === previousRow) {
      output.copyWithin(row, row - width, row);
    } else {
      for (let x = 0; x < width; x++) {
        const sx = columns[x];
        if (sx >= 0 && sx < source.width) output[row + x] = input[sy * source.width + sx];
      }
    }
    previousRow = sy;
  }
  return compositeJpegMatte({ width, height, data }, options);
}

const DEFAULT_JPEG_MATTE = "#ffffff";
function compositeJpegMatte(pixels: PixelBuffer, options: ExportFileOptions): PixelBuffer {
  if (!/\.jpe?g$/i.test(options.name.trim())) return pixels;
  const matte = options.jpegMatte ?? DEFAULT_JPEG_MATTE;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(matte.slice(offset, offset + 2), 16));
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const alpha = pixels.data[offset + 3] / UINT8_MAX;
    for (let channel = 0; channel < channels.length; channel++)
      pixels.data[offset + channel] = Math.round(
        pixels.data[offset + channel] * alpha + channels[channel] * (1 - alpha),
      );
    pixels.data[offset + 3] = UINT8_MAX;
  }
  return pixels;
}
