import type { ImportAction } from "$/managers/preferences/file-preferences";
import type { Rgba } from "@xprite/editor-core/base";
import type { RasterAnimation } from "@xprite/editor-core/import-export";
import type {
  PixelGridAnalysis,
  PixelationAlgorithm,
  PixelationSettings,
  PixelationSize,
} from "@xprite/pixelate";

export enum VideoImportFailure {
  Browser = "browser",
  Format = "format",
  Codec = "codec",
  Track = "track",
  Metadata = "metadata",
  Frame = "frame",
  Decode = "decode",
}

export interface VideoImportMetadata {
  width: number;
  height: number;
  durationSeconds: number;
  frameRate: number;
  codec: string;
  grid: PixelGridAnalysis;
}

export interface VideoImportSettings {
  startSeconds: number;
  endSeconds: number;
  frameRate: number;
  action: ImportAction;
  algorithm: PixelationAlgorithm;
  pixelation: PixelationSettings;
}

export interface VideoImportPlan {
  width: number;
  height: number;
  pixelate: boolean;
  pixelation: PixelationSettings;
  grid: PixelGridAnalysis;
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
  /** Completed work in this operation, including preparation, from zero to one. */
  fraction: number;
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
  analyze(
    algorithm: PixelationAlgorithm,
    size: PixelationSize | undefined,
    onProgress: (progress: VideoImportProgress) => void,
  ): Promise<PixelGridAnalysis>;
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
