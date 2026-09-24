import type { WebpExportOptions } from "$/managers/ports/webp-export";

export interface WebpWorkerFrame {
  width: number;
  height: number;
  duration: number;
  data: ArrayBuffer;
  byteOffset: number;
  length: number;
}
export interface WebpWorkerRequest {
  frames: readonly WebpWorkerFrame[];
  options: WebpExportOptions;
}
export type WebpWorkerResponse = { ok: true; data: ArrayBuffer } | { ok: false; message: string };
