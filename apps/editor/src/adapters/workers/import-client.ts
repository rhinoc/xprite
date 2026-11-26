import type {
  ImportWorkerError,
  ImportWorkerRequest,
  ImportWorkerResponse,
} from "$/adapters/workers/import-worker";
import { ImportWorkerOperation } from "$/adapters/workers/import-worker-types";
import {
  announceWorkerLoadFailure,
  WORKER_LOAD_ATTEMPTS,
  WORKER_LOAD_RETRY_DELAY_MS,
  workerLoadError,
} from "$/adapters/workers/worker-load-failure";
import {
  ManagedWorkerClient,
  WorkerFailureKind,
  type ManagedWorkerTransport,
} from "@xprite/bedrock/browser/managed-worker";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { PixelArtAnalysis, PixelArtAnalysisOptions, PixelateOptions } from "@xprite/pixelate";

const WORKER_LOAD_DIAGNOSTIC = "The image import worker script could not be loaded";

export interface ImportWorkerClientOptions {
  worker?: ManagedWorkerTransport<ImportWorkerRequest>;
  workerFactory?: () => ManagedWorkerTransport<ImportWorkerRequest>;
  onFatalError?: (error: Error) => void;
  retryDelayMs?: number;
}

function createImportWorker(): Worker {
  return new Worker(new URL("./import-worker", import.meta.url), {
    type: "module",
  });
}

function copyImage(image: PixelBuffer): ImportWorkerRequest["image"] {
  // Never transfer the caller's buffer directly: transfer detaches it. This
  // keeps the source available for preserveDimensions previews and undo.
  const copy = new Uint8ClampedArray(image.data);
  return { width: image.width, height: image.height, data: copy.buffer };
}

function workerError(error: ImportWorkerError): Error {
  const result = new Error(error.message);
  result.name = error.name;
  if (error.stack) result.stack = error.stack;
  return result;
}

/** Promise client for the optional image-import worker; it has no React dependency. */
export class ImageImportWorkerClient {
  private readonly client: ManagedWorkerClient<ImportWorkerRequest, ImportWorkerResponse>;

  get isFailed(): boolean {
    return this.client.isFailed;
  }

  constructor(options: ImportWorkerClientOptions = {}) {
    if (options.worker && options.workerFactory)
      throw new RangeError("Provide worker or workerFactory, not both");
    if (!options.worker && !options.workerFactory && typeof Worker === "undefined") {
      throw new Error("Worker is unavailable; provide workerFactory in this environment");
    }
    this.client = new ManagedWorkerClient<ImportWorkerRequest, ImportWorkerResponse>({
      worker: options.worker,
      workerFactory: options.worker ? undefined : (options.workerFactory ?? createImportWorker),
      lazy: true,
      maxStartupAttempts: WORKER_LOAD_ATTEMPTS,
      retryDelayMs: options.retryDelayMs ?? WORKER_LOAD_RETRY_DELAY_MS,
      closedError: () => new Error("Image import worker client is closed"),
      formatError: (info) => {
        if (info.kind === WorkerFailureKind.Startup) return workerLoadError(WORKER_LOAD_DIAGNOSTIC);
        if (info.kind === WorkerFailureKind.Deserialization)
          return new Error("Image import worker could not deserialize a request");
        return info.cause instanceof Error
          ? info.cause
          : new Error(info.message || "Image import worker failed");
      },
      onStartupFailureExhausted: (error) => announceWorkerLoadFailure(error),
      onFatalError: (error) => options.onFatalError?.(error),
    });
  }

  analyze(image: PixelBuffer, options?: PixelArtAnalysisOptions): Promise<PixelArtAnalysis> {
    return this.request(ImportWorkerOperation.Analyze, image, options) as Promise<PixelArtAnalysis>;
  }

  pixelate(image: PixelBuffer, options?: PixelateOptions): Promise<PixelBuffer> {
    return this.request(ImportWorkerOperation.Pixelate, image, options) as Promise<PixelBuffer>;
  }

  private request(
    operation: ImportWorkerOperation,
    image: PixelBuffer,
    options?: PixelArtAnalysisOptions | PixelateOptions,
  ): Promise<unknown> {
    return this.client.request({
      buildRequest: (id) => {
        const copied = copyImage(image);
        return {
          request: {
            id,
            operation,
            image: copied,
            options,
          },
          transfer: [copied.data],
        };
      },
      readResponse: (response) => {
        if (!response.ok) throw workerError(response.error);
        return response.result;
      },
    });
  }

  cancel(id: number): boolean {
    return this.client.cancel(id, new Error("Image import request cancelled"));
  }

  close(): void {
    this.client.close(new Error("Image import worker client closed"));
  }
}
