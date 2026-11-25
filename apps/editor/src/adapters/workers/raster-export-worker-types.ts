import type { Rect } from "@xprite/editor-core/base";
import type { RgbChannels } from "@xprite/editor-core/import-export";

export enum RasterWorkerFormat {
  Png = "png",
  Jpeg = "jpeg",
}

interface RasterWorkerPlan {
  readonly bounds: Rect;
  readonly width: number;
  readonly height: number;
  readonly jpegMatte?: RgbChannels;
  readonly forTwitterOpaqueTweak?: boolean;
}

export interface RasterWorkerRequest {
  readonly format: RasterWorkerFormat;
  readonly source: {
    readonly width: number;
    readonly height: number;
    readonly data: ArrayBuffer;
    readonly byteOffset: number;
    readonly length: number;
  };
  readonly plan?: RasterWorkerPlan;
  readonly qualityPercent?: number;
  readonly matte?: RgbChannels;
}

export type RasterWorkerResponse = { ok: true; blob: Blob } | { ok: false; message: string };
