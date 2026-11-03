import type {
  VideoImportFailure,
  VideoImportMetadata,
  VideoImportPlan,
  VideoImportProgress,
  VideoImportAnimation,
} from "$/managers/ports/video-import";
import type { PixelGridAnalysis, PixelationAlgorithm, PixelationSize } from "@xprite/pixelate";

export enum VideoImportOperation {
  Open = "open",
  Analyze = "analyze",
  Preview = "preview",
  Thumbnails = "thumbnails",
  Decode = "decode",
}

export type VideoImportRequest = { id: number } & (
  | { operation: VideoImportOperation.Open; file: File }
  | {
      operation: VideoImportOperation.Analyze;
      algorithm: PixelationAlgorithm;
      size?: PixelationSize;
    }
  | {
      operation: VideoImportOperation.Preview;
      timeSeconds: number;
      width: number;
      height: number;
      plan: VideoImportPlan;
    }
  | { operation: VideoImportOperation.Decode; plan: VideoImportPlan }
  | {
      operation: VideoImportOperation.Thumbnails;
      timestamps: readonly number[];
      width: number;
      height: number;
    }
);

export type VideoImportResult =
  | { operation: VideoImportOperation.Open; metadata: VideoImportMetadata }
  | { operation: VideoImportOperation.Analyze; grid: PixelGridAnalysis }
  | { operation: VideoImportOperation.Preview; blob: Blob }
  | { operation: VideoImportOperation.Decode; animation: VideoImportAnimation }
  | { operation: VideoImportOperation.Thumbnails };

export type VideoImportResponse =
  | { id: number; thumbnail: { index: number; blob: Blob } }
  | { id: number; progress: VideoImportProgress }
  | { id: number; ok: true; result: VideoImportResult }
  | { id: number; ok: false; error: { code: VideoImportFailure; message: string } };
