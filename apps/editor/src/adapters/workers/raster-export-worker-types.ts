import type { Rect, Rgba } from "@xprite/editor-core/base";
import type { GifEncodeOptions, RgbChannels } from "@xprite/editor-core/import-export";

export enum RasterWorkerFormat {
  Png = "png",
  Jpeg = "jpeg",
  Gif = "gif",
}

export interface RasterWorkerPixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayBuffer;
  readonly byteOffset: number;
  readonly length: number;
}

export interface RasterWorkerPlan {
  readonly bounds: Rect;
  readonly width: number;
  readonly height: number;
  readonly jpegMatte?: RgbChannels;
  readonly forTwitterOpaqueTweak?: boolean;
}

export interface RasterWorkerGifFrame {
  readonly sourceIndex: number;
  readonly plan?: RasterWorkerPlan;
  readonly duration: number;
  readonly palette?: readonly Rgba[];
}

export type RasterWorkerRequest =
  | {
      readonly format: RasterWorkerFormat.Png | RasterWorkerFormat.Jpeg;
      readonly source: RasterWorkerPixelBuffer;
      readonly plan?: RasterWorkerPlan;
      readonly qualityPercent?: number;
      readonly matte?: RgbChannels;
    }
  | {
      readonly format: RasterWorkerFormat.Gif;
      readonly sources: readonly RasterWorkerPixelBuffer[];
      readonly frames: readonly RasterWorkerGifFrame[];
      readonly options?: GifEncodeOptions;
    };

export type RasterWorkerResponse = { ok: true; blob: Blob } | { ok: false; message: string };
