import type {
  ImportWorkerError,
  ImportWorkerRequest,
  ImportWorkerResponse,
} from "$/adapters/workers/import-worker";
import { ImportWorkerOperation } from "$/adapters/workers/import-worker-types";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  PixelArtAnalysis,
  PixelArtAnalysisOptions,
  PixelateOptions,
} from "@xprite/editor-core/import-export";

export interface ImportWorkerLike {
  postMessage(message: ImportWorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  terminate?(): void;
}

export interface ImportWorkerClientOptions {
  worker?: ImportWorkerLike;
  workerFactory?: () => ImportWorkerLike;
  onFatalError?: (error: Error) => void;
}

interface PendingRequest<T> {
  operation: ImportWorkerOperation;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
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
  private readonly worker: ImportWorkerLike;
  private readonly onFatalError?: (error: Error) => void;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest<unknown>>();
  private closed = false;

  private readonly onMessage = (event: Event): void => {
    const response = (event as MessageEvent<ImportWorkerResponse>).data;
    if (!response || !Number.isSafeInteger(response.id)) return;
    const request = this.pending.get(response.id);
    if (!request) return;
    this.pending.delete(response.id);
    if (!response.ok) {
      request.reject(workerError(response.error));
      return;
    }
    request.resolve(response.result);
  };

  private readonly onError = (event: Event): void => {
    const errorEvent = event as ErrorEvent;
    const error =
      errorEvent.error instanceof Error
        ? errorEvent.error
        : new Error(errorEvent.message || "Image import worker failed");
    this.onFatalError?.(error);
    this.rejectAll(error);
  };

  private readonly onMessageError = (): void => {
    const error = new Error("Image import worker could not deserialize a request");
    this.onFatalError?.(error);
    this.rejectAll(error);
  };

  constructor(options: ImportWorkerClientOptions = {}) {
    if (options.worker && options.workerFactory)
      throw new RangeError("Provide worker or workerFactory, not both");
    this.onFatalError = options.onFatalError;
    if (options.worker) {
      this.worker = options.worker;
    } else if (options.workerFactory) {
      this.worker = options.workerFactory();
    } else {
      if (typeof Worker === "undefined")
        throw new Error("Worker is unavailable; provide workerFactory in this environment");
      this.worker = new Worker(new URL("./import-worker", import.meta.url), {
        type: "module",
      });
    }
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", this.onError);
    this.worker.addEventListener("messageerror", this.onMessageError);
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
    if (this.closed) return Promise.reject(new Error("Image import worker client is closed"));
    const id = this.nextRequestId++;
    const request: ImportWorkerRequest = {
      id,
      operation,
      image: copyImage(image),
      options,
    };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { operation, resolve, reject });
      try {
        this.worker.postMessage(request, [request.image.data]);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  cancel(id: number): boolean {
    const request = this.pending.get(id);
    if (!request) return false;
    this.pending.delete(id);
    request.reject(new Error("Image import request cancelled"));
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectAll(new Error("Image import worker client closed"));
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.removeEventListener("error", this.onError);
    this.worker.removeEventListener("messageerror", this.onMessageError);
    this.worker.terminate?.();
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}
