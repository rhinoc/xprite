import type {
  ImportWorkerError,
  ImportWorkerRequest,
  ImportWorkerResponse,
} from "$/adapters/workers/import-worker";
import { ImportWorkerOperation } from "$/adapters/workers/import-worker-types";
import {
  WorkerRequestChannel,
  type WorkerRequestTransport,
} from "@xprite/bedrock/browser/worker-request-channel";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  PixelArtAnalysis,
  PixelArtAnalysisOptions,
  PixelateOptions,
} from "@xprite/editor-core/import-export";

export interface ImportWorkerClientOptions {
  worker?: WorkerRequestTransport<ImportWorkerRequest>;
  workerFactory?: () => WorkerRequestTransport<ImportWorkerRequest>;
  onFatalError?: (error: Error) => void;
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
  private readonly channel: WorkerRequestChannel<ImportWorkerRequest, ImportWorkerResponse>;
  get isFailed(): boolean {
    return this.channel.isFailed;
  }
  constructor(options: ImportWorkerClientOptions = {}) {
    if (options.worker && options.workerFactory)
      throw new RangeError("Provide worker or workerFactory, not both");
    let worker: WorkerRequestTransport<ImportWorkerRequest>;
    if (options.worker) {
      worker = options.worker;
    } else if (options.workerFactory) {
      worker = options.workerFactory();
    } else {
      if (typeof Worker === "undefined")
        throw new Error("Worker is unavailable; provide workerFactory in this environment");
      worker = new Worker(new URL("./import-worker", import.meta.url), {
        type: "module",
      });
    }
    this.channel = new WorkerRequestChannel(worker, {
      closedError: () => new Error("Image import worker client is closed"),
      transportError: (event) => {
        if (event.type === "messageerror")
          return new Error("Image import worker could not deserialize a request");
        const error = event as ErrorEvent;
        return error.error instanceof Error
          ? error.error
          : new Error(error.message || "Image import worker failed");
      },
      onFatalError: options.onFatalError,
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
    if (this.channel.isClosed)
      return Promise.reject(new Error("Image import worker client is closed"));
    const id = this.channel.nextRequestId();
    const request: ImportWorkerRequest = {
      id,
      operation,
      image: copyImage(image),
      options,
    };
    return this.channel.request(
      request,
      (response) => {
        if (!response.ok) throw workerError(response.error);
        return response.result;
      },
      [request.image.data],
    );
  }

  cancel(id: number): boolean {
    return this.channel.cancel(id, new Error("Image import request cancelled"));
  }

  close(): void {
    this.channel.close(new Error("Image import worker client closed"));
  }
}
