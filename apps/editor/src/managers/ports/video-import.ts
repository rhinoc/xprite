import type { Rgba } from "@xprite/editor-core/base";
import type { RasterAnimation } from "@xprite/editor-core/import-export";

export enum VideoImportSampling {
  Smooth = "smooth",
  Nearest = "nearest",
}

export enum VideoImportFailure {
  Browser = "browser",
  Format = "format",
  Codec = "codec",
  Track = "track",
  Metadata = "metadata",
  Frame = "frame",
  Decode = "decode",
}

export interface VideoImportRecovery {
  reliable: boolean;
  width: number;
  height: number;
}

export interface VideoImportMetadata {
  width: number;
  height: number;
  durationSeconds: number;
  frameRate: number;
  codec: string;
  recovery: VideoImportRecovery;
}

export interface VideoImportSettings {
  startSeconds: number;
  endSeconds: number;
  frameRate: number;
  width: number;
  height: number;
  keepAspectRatio: boolean;
  sampling: VideoImportSampling;
  recoverGrid: boolean;
  reduceColors: boolean;
  maxColors: number;
}

export interface VideoImportPlan {
  width: number;
  height: number;
  sampling: VideoImportSampling;
  recoverGrid: boolean;
  reduceColors: boolean;
  maxColors: number;
  frames: readonly { timestampSeconds: number; durationMs: number }[];
}

export enum VideoImportPhase {
  Reading = "reading",
  Grid = "grid",
  Palette = "palette",
  Preview = "preview",
  Frames = "frames",
}

export interface VideoImportProgress {
  phase: VideoImportPhase;
  completed: number;
  total: number;
}

export interface VideoImportPreview {
  url: string;
  release(): void;
}

export interface VideoImportAnimation extends RasterAnimation {
  palette?: readonly Rgba[];
}

/** One source owns its decoder worker and all temporary preview URLs. */
export interface VideoImportHandle {
  readonly metadata: VideoImportMetadata;
  thumbnails(
    timestamps: readonly number[],
    width: number,
    height: number,
    onFrame: (index: number, preview: VideoImportPreview) => void,
  ): Promise<void>;
  preview(
    timeSeconds: number,
    width: number,
    height: number,
    plan: VideoImportPlan,
    onProgress: (progress: VideoImportProgress) => void,
  ): Promise<VideoImportPreview>;
  decode(
    plan: VideoImportPlan,
    onProgress: (progress: VideoImportProgress) => void,
  ): Promise<VideoImportAnimation>;
  dispose(): void;
}

export interface VideoImportPort {
  isVideoSource(source: string): boolean;
  open(
    source: string,
    signal: AbortSignal,
    onProgress: (progress: VideoImportProgress) => void,
  ): Promise<VideoImportHandle>;
}
