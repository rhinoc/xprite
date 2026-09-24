import { ImportWorkerOperation } from "$/adapters/workers/import-worker-types";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  analyzePixelArt,
  pixelateImage,
  type PixelArtAnalysisOptions,
  type PixelateOptions,
} from "@xprite/editor-core/import-export";
export { ImportWorkerOperation } from "$/adapters/workers/import-worker-types";

export interface ImportWorkerImage {
  width: number;
  height: number;
  /** A detached transferable owned by the worker for the duration of a request. */
  data: ArrayBuffer;
}

export interface ImportWorkerRequest {
  id: number;
  operation: ImportWorkerOperation;
  image: ImportWorkerImage;
  options?: PixelArtAnalysisOptions | PixelateOptions;
}

export interface ImportWorkerError {
  name: string;
  message: string;
  stack?: string;
}

export type ImportWorkerResponse =
  | {
      id: number;
      ok: true;
      operation: ImportWorkerOperation.Analyze;
      result: ReturnType<typeof analyzePixelArt>;
    }
  | { id: number; ok: true; operation: ImportWorkerOperation.Pixelate; result: PixelBuffer }
  | {
      id: number;
      ok: false;
      operation: ImportWorkerOperation;
      error: ImportWorkerError;
    };

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ImportWorkerRequest>) => void,
  ): void;
  postMessage(message: ImportWorkerResponse, transfer?: Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  try {
    if (!request || !Number.isSafeInteger(request.id))
      throw new TypeError("Invalid image import worker request");
    const image: PixelBuffer = {
      width: request.image.width,
      height: request.image.height,
      data: new Uint8ClampedArray(request.image.data),
    };
    if (request.operation === ImportWorkerOperation.Analyze) {
      const result = analyzePixelArt(image, request.options as PixelArtAnalysisOptions | undefined);
      workerScope.postMessage({
        id: request.id,
        ok: true,
        operation: ImportWorkerOperation.Analyze,
        result,
      });
      return;
    }
    if (request.operation !== ImportWorkerOperation.Pixelate)
      throw new RangeError("Unknown image import worker operation");
    const result = pixelateImage(image, request.options as PixelateOptions | undefined);
    workerScope.postMessage(
      {
        id: request.id,
        ok: true,
        operation: ImportWorkerOperation.Pixelate,
        result,
      },
      [result.data.buffer],
    );
  } catch (error) {
    const failure =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { name: "Error", message: String(error) };
    workerScope.postMessage({
      id: request?.id ?? -1,
      ok: false,
      operation:
        request?.operation === ImportWorkerOperation.Analyze ||
        request?.operation === ImportWorkerOperation.Pixelate
          ? request.operation
          : ImportWorkerOperation.Analyze,
      error: failure,
    });
  }
});
