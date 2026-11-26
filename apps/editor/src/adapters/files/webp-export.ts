import type {
  WebpWorkerFrame,
  WebpWorkerRequest,
  WebpWorkerResponse,
} from "$/adapters/workers/webp-export-worker-types";
import {
  announceWorkerLoadFailure,
  WORKER_LOAD_ATTEMPTS,
  WORKER_LOAD_RETRY_DELAY_MS,
  workerLoadError,
} from "$/adapters/workers/worker-load-failure";
import { tUi, tUiSource } from "$/i18n";
import type { WebpExportPort } from "$/managers/ports/webp-export";
import { encodeImageBlob, ImageEncodingFormat } from "@xprite/bedrock/browser/images";
import {
  runManagedWorkerJob,
  WorkerFailureKind,
  type ManagedWorkerTransport,
} from "@xprite/bedrock/browser/managed-worker";
import { WebpCompression, assembleWebpAnimation } from "@xprite/editor-core/import-export";

const WORKER_LOAD_DIAGNOSTIC = "The WebP export worker script could not be loaded";

export interface BrowserWebpExportOptions {
  createWorker?: () => ManagedWorkerTransport<WebpWorkerRequest>;
  retryDelayMs?: number;
}

function createWebpExportWorker(): Worker {
  return new Worker(new URL("../workers/webp-export-worker.ts", import.meta.url), {
    type: "module",
  });
}

/** A worker exists only for the duration of one export, including all error paths. */
export function createBrowserWebpExportPort(
  portOptions: BrowserWebpExportOptions = {},
): WebpExportPort {
  return {
    supportsLossless: () => Boolean(portOptions.createWorker) || typeof Worker === "function",
    async encode(frames, options) {
      if (!frames.length) throw new Error(tUi("ui.webp.export.frames.required"));
      if (options.compression === WebpCompression.Lossy) {
        const encoded = [];
        for (const frame of frames) {
          const blob = await encodeImageBlob(
            frame.pixels,
            ImageEncodingFormat.Webp,
            options.qualityPercent / 100,
          );
          if (blob.type.toLowerCase() !== "image/webp")
            throw new Error(tUi("ui.webp.export.image.unavailable"));
          encoded.push({
            bytes: new Uint8Array(await blob.arrayBuffer()),
            duration: frame.duration,
          });
        }
        const first = frames[0].pixels;
        const bytes = options.animated
          ? assembleWebpAnimation(encoded, first.width, first.height, options.loopCount)
          : encoded[0].bytes;
        return new Blob([bytes.buffer as ArrayBuffer], { type: "image/webp" });
      }
      if (!portOptions.createWorker && typeof Worker !== "function")
        throw new Error(tUi("ui.webp.export.lossless.unavailable"));
      return runManagedWorkerJob<WebpWorkerRequest, WebpWorkerResponse, Blob>({
        workerFactory: portOptions.createWorker ?? createWebpExportWorker,
        maxStartupAttempts: WORKER_LOAD_ATTEMPTS,
        retryDelayMs: portOptions.retryDelayMs ?? WORKER_LOAD_RETRY_DELAY_MS,
        canRetry: () => frames.every((frame) => frame.pixels.data.buffer.byteLength > 0),
        formatError: (info) => {
          if (info.kind === WorkerFailureKind.Startup)
            return workerLoadError(WORKER_LOAD_DIAGNOSTIC);
          if (info.kind === WorkerFailureKind.Deserialization)
            return new Error(tUi("ui.webp.export.output.unreadable"));
          return new Error(info.message || tUi("ui.webp.export.worker.failed"));
        },
        onStartupFailureExhausted: (error) => announceWorkerLoadFailure(error),
        buildRequest: () => {
          const transfer = new Set<ArrayBuffer>();
          const images: WebpWorkerFrame[] = frames.map((frame) => {
            const { data, width, height } = frame.pixels;
            if (!(data.buffer instanceof ArrayBuffer))
              throw new Error(tUi("ui.webp.export.buffer.required"));
            transfer.add(data.buffer);
            return {
              width,
              height,
              duration: frame.duration,
              data: data.buffer,
              byteOffset: data.byteOffset,
              length: data.length,
            };
          });
          return { request: { frames: images, options }, transfer: [...transfer] };
        },
        readResponse: (data) => {
          if (data.ok) return new Blob([data.data], { type: "image/webp" });
          throw new Error(tUiSource(data.message));
        },
      });
    },
  };
}
