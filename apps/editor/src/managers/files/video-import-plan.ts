import { tUi } from "$/i18n";
import {
  VideoImportSampling,
  type VideoImportMetadata,
  type VideoImportPlan,
  type VideoImportSettings,
} from "$/managers/ports/video-import";
import {
  assertRasterAnimationCapacity,
  MAX_IMPORTED_ANIMATION_FRAMES,
  MAX_IMPORTED_ANIMATION_RGBA_BYTES,
} from "@xprite/editor-core/import-export";

const MIN_VIDEO_FRAME_RATE = 1;
const MAX_VIDEO_FRAME_RATE = 60;
const MAX_VIDEO_IMPORT_DIMENSION = 16_384;
const DEFAULT_FRAME_RATE = 12;
const DEFAULT_MAX_DIMENSION = 256;
const DEFAULT_DURATION_SECONDS = 10;
const MILLISECONDS_PER_SECOND = 1000;
const RGBA_CHANNELS = 4;
const FRAME_COUNT_EPSILON = 1e-9;
const MIN_VIDEO_COLORS = 2;
const MAX_VIDEO_COLORS = 256;
const DEFAULT_VIDEO_COLORS = 32;

export function defaultVideoImportSettings(metadata: VideoImportMetadata): VideoImportSettings {
  const scale = Math.min(1, DEFAULT_MAX_DIMENSION / Math.max(metadata.width, metadata.height));
  return {
    startSeconds: 0,
    endSeconds: Math.min(DEFAULT_DURATION_SECONDS, metadata.durationSeconds),
    frameRate: Math.max(MIN_VIDEO_FRAME_RATE, Math.min(DEFAULT_FRAME_RATE, metadata.frameRate)),
    width: metadata.recovery.reliable
      ? metadata.recovery.width
      : Math.max(1, Math.round(metadata.width * scale)),
    height: metadata.recovery.reliable
      ? metadata.recovery.height
      : Math.max(1, Math.round(metadata.height * scale)),
    keepAspectRatio: true,
    sampling: VideoImportSampling.Nearest,
    recoverGrid: metadata.recovery.reliable,
    reduceColors: true,
    maxColors: DEFAULT_VIDEO_COLORS,
  };
}

export function videoImportPlan(
  metadata: VideoImportMetadata,
  settings: VideoImportSettings,
): VideoImportPlan {
  const { startSeconds, endSeconds, frameRate, width, height, sampling } = settings;
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
  if (sampling !== VideoImportSampling.Smooth && sampling !== VideoImportSampling.Nearest)
    throw new RangeError(tUi("video.import.settings.invalid"));
  if (settings.recoverGrid && !metadata.recovery.reliable)
    throw new RangeError(tUi("video.import.recovery.unavailable"));
  if (
    settings.reduceColors &&
    (!Number.isSafeInteger(settings.maxColors) ||
      settings.maxColors < MIN_VIDEO_COLORS ||
      settings.maxColors > MAX_VIDEO_COLORS)
  )
    throw new RangeError(tUi("video.import.colors.invalid"));

  const durationSeconds = endSeconds - startSeconds;
  const totalMs = Math.round(durationSeconds * MILLISECONDS_PER_SECOND);
  let frameCount = Math.max(1, Math.ceil(durationSeconds * frameRate - FRAME_COUNT_EPSILON));
  // A sub-millisecond tail belongs to the previous frame; never create a zero-duration cel.
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
    sampling,
    recoverGrid: settings.recoverGrid,
    reduceColors: settings.reduceColors,
    maxColors: settings.maxColors,
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
