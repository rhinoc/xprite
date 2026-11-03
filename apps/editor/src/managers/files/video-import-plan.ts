import { tUi } from "$/i18n";
import type {
  VideoImportMetadata,
  VideoImportPlan,
  VideoImportSettings,
} from "$/managers/ports/video-import";
import {
  assertRasterAnimationCapacity,
  defaultImportPixelationSettings,
  MAX_IMPORTED_ANIMATION_FRAMES,
  MAX_IMPORTED_ANIMATION_RGBA_BYTES,
} from "@xprite/editor-core/import-export";
import {
  CellColorPicker,
  PixelationAlgorithm,
  PixelationMode,
  type PixelGridAnalysis,
} from "@xprite/pixelate";

const MIN_VIDEO_FRAME_RATE = 1;
const MAX_VIDEO_FRAME_RATE = 60;
const MAX_VIDEO_IMPORT_DIMENSION = 16_384;
const DEFAULT_FRAME_RATE = 12;
const DEFAULT_DURATION_SECONDS = 10;
const MILLISECONDS_PER_SECOND = 1000;
const RGBA_CHANNELS = 4;
const FRAME_COUNT_EPSILON = 1e-9;
const MIN_VIDEO_COLORS = 2;
const MAX_VIDEO_COLORS = 256;

export function defaultVideoImportSettings(
  metadata: VideoImportMetadata,
  picker = CellColorPicker.MostCommon,
): VideoImportSettings {
  return {
    startSeconds: 0,
    endSeconds: Math.min(DEFAULT_DURATION_SECONDS, metadata.durationSeconds),
    frameRate: Math.max(MIN_VIDEO_FRAME_RATE, Math.min(DEFAULT_FRAME_RATE, metadata.frameRate)),
    action: "pixelate",
    algorithm: PixelationAlgorithm.Auto,
    pixelation: defaultImportPixelationSettings(metadata, metadata.grid, picker),
  };
}

export function videoImportPlan(
  metadata: VideoImportMetadata,
  settings: VideoImportSettings,
  grid: PixelGridAnalysis = metadata.grid,
): VideoImportPlan {
  const { startSeconds, endSeconds, frameRate, pixelation } = settings;
  const pixelate = settings.action === "pixelate";
  const size = !pixelate
    ? metadata
    : pixelation.mode === PixelationMode.RecoverGrid && grid.reliable
      ? grid
      : { width: pixelation.targetWidth, height: pixelation.targetHeight };
  const { width, height } = size;
  if (
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    startSeconds < 0 ||
    endSeconds > metadata.durationSeconds ||
    endSeconds <= startSeconds ||
    Math.round((endSeconds - startSeconds) * MILLISECONDS_PER_SECOND) < 1
  )
    throw new RangeError(tUi("video.import.range.invalid"));
  if (
    !Number.isFinite(frameRate) ||
    frameRate < MIN_VIDEO_FRAME_RATE ||
    frameRate > MAX_VIDEO_FRAME_RATE
  )
    throw new RangeError(tUi("video.import.fps.invalid"));
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_VIDEO_IMPORT_DIMENSION ||
    height > MAX_VIDEO_IMPORT_DIMENSION
  )
    throw new RangeError(tUi("video.import.size.invalid"));
  if (settings.action !== "pixelate" && settings.action !== "import-as-is")
    throw new RangeError(tUi("video.import.settings.invalid"));
  if (
    pixelate &&
    pixelation.reduceColors &&
    (!Number.isSafeInteger(pixelation.maxColors) ||
      pixelation.maxColors < MIN_VIDEO_COLORS ||
      pixelation.maxColors > MAX_VIDEO_COLORS)
  )
    throw new RangeError(tUi("video.import.colors.invalid"));
  const durationSeconds = endSeconds - startSeconds;
  const totalMs = Math.round(durationSeconds * MILLISECONDS_PER_SECOND);
  let frameCount = Math.max(1, Math.ceil(durationSeconds * frameRate - FRAME_COUNT_EPSILON));
  if (Math.round(((frameCount - 1) * MILLISECONDS_PER_SECOND) / frameRate) >= totalMs) frameCount--;
  if (
    frameCount > MAX_IMPORTED_ANIMATION_FRAMES ||
    width * height * RGBA_CHANNELS * frameCount > MAX_IMPORTED_ANIMATION_RGBA_BYTES
  )
    throw new RangeError(tUi("video.import.capacity"));
  assertRasterAnimationCapacity(width, height, frameCount);
  return {
    width,
    height,
    pixelate,
    pixelation,
    grid,
    frames: Array.from({ length: frameCount }, (_, index) => ({
      timestampSeconds: startSeconds + index / frameRate,
      durationMs:
        (index === frameCount - 1
          ? totalMs
          : Math.round(((index + 1) * MILLISECONDS_PER_SECOND) / frameRate)) -
        Math.round((index * MILLISECONDS_PER_SECOND) / frameRate),
    })),
  };
}

export function videoProjectFileName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "") || "Video"}.aseprite`;
}
