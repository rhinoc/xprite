import {
  VideoImportOperation,
  type VideoImportRequest,
  type VideoImportResponse,
  type VideoImportResult,
} from "$/adapters/workers/video-import-protocol";
import {
  announceWorkerLoadFailure,
  WORKER_LOAD_ATTEMPTS,
  WORKER_LOAD_RETRY_DELAY_MS,
  workerLoadError,
} from "$/adapters/workers/worker-load-failure";
import { tUi } from "$/i18n";
import {
  VideoImportFailure,
  type VideoImportHandle,
  type VideoImportProgress,
  type VideoImportPreview,
} from "$/managers/ports/video-import";
import {
  ManagedWorkerClient,
  WorkerFailureKind,
  type ManagedWorkerTransport,
} from "@xprite/bedrock/browser/managed-worker";

const PREVIEW_MIME_TYPE = "image/png";
const OPEN_TIMEOUT_MS = 60_000;
const PREVIEW_TIMEOUT_MS = 30_000;
const IMPORT_STALL_TIMEOUT_MS = 60_000;
const WORKER_LOAD_DIAGNOSTIC = "The video import worker script could not be loaded";

export interface VideoImportOptions {
  workerFactory?: () => ManagedWorkerTransport<VideoImportRequest>;
  retryDelayMs?: number;
}

function createVideoImportWorker(): Worker {
  return new Worker(new URL("../workers/video-import-worker.ts", import.meta.url), {
    type: "module",
  });
}

function decodeFailedError(): Error {
  return Object.assign(new Error(tUi("video.import.decode.failed")), {
    code: VideoImportFailure.Decode,
  });
}

export async function openVideoImport(
  file: File,
  signal: AbortSignal,
  onProgress: (progress: VideoImportProgress) => void,
  options: VideoImportOptions = {},
): Promise<VideoImportHandle> {
  if (signal.aborted) throw new DOMException("Video import cancelled", "AbortError");
  if (!options.workerFactory && typeof Worker !== "function")
    throw Object.assign(new Error(tUi("video.import.browser.unsupported")), {
      code: VideoImportFailure.Browser,
    });
  const urls = new Set<string>();
  let closed = false;
  const revokeUrls = () => {
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  };
  const client = new ManagedWorkerClient<VideoImportRequest, VideoImportResponse>({
    workerFactory: options.workerFactory ?? createVideoImportWorker,
    lazy: true,
    maxStartupAttempts: WORKER_LOAD_ATTEMPTS,
    retryDelayMs: options.retryDelayMs ?? WORKER_LOAD_RETRY_DELAY_MS,
    closedError: () => new DOMException("Video source is closed", "AbortError"),
    formatError: (info) =>
      info.kind === WorkerFailureKind.Startup
        ? workerLoadError(WORKER_LOAD_DIAGNOSTIC)
        : decodeFailedError(),
    onStartupFailureExhausted: (error) =>
      Object.assign(announceWorkerLoadFailure(error), { code: VideoImportFailure.Decode }),
    onFatalError: () => {
      revokeUrls();
    },
  });
  const dispose = (reason: unknown = new DOMException("Video import cancelled", "AbortError")) => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", cancel);
    client.close(reason);
    revokeUrls();
  };
  const cancel = () => dispose();
  signal.addEventListener("abort", cancel, { once: true });
  const retainPreview = (blob: Blob): VideoImportPreview => {
    const url = URL.createObjectURL(blob);
    urls.add(url);
    return {
      url,
      release() {
        if (urls.delete(url)) URL.revokeObjectURL(url);
      },
    };
  };

  const run = (
    request:
      | Omit<Extract<VideoImportRequest, { operation: VideoImportOperation.Open }>, "id">
      | Omit<Extract<VideoImportRequest, { operation: VideoImportOperation.Analyze }>, "id">
      | Omit<Extract<VideoImportRequest, { operation: VideoImportOperation.Preview }>, "id">
      | Omit<Extract<VideoImportRequest, { operation: VideoImportOperation.Decode }>, "id">
      | Omit<Extract<VideoImportRequest, { operation: VideoImportOperation.Thumbnails }>, "id">,
    onRequestProgress?: (progress: VideoImportProgress) => void,
    onThumbnail?: (index: number, preview: VideoImportPreview) => void,
  ): Promise<VideoImportResult> => {
    if (closed) return Promise.reject(new DOMException("Video source is closed", "AbortError"));
    const timeoutMs =
      request.operation === VideoImportOperation.Open
        ? OPEN_TIMEOUT_MS
        : request.operation === VideoImportOperation.Preview
          ? PREVIEW_TIMEOUT_MS
          : IMPORT_STALL_TIMEOUT_MS;
    return client.request<VideoImportResult>({
      buildRequest: (id) => ({
        request: { ...request, id } as VideoImportRequest,
      }),
      onIntermediate: (data) => {
        if ("thumbnail" in data) {
          onThumbnail?.(data.thumbnail.index, retainPreview(data.thumbnail.blob));
          return true;
        }
        if ("progress" in data) {
          onRequestProgress?.(data.progress);
          return true;
        }
        return false;
      },
      readResponse: (data) => {
        if ("ok" in data) {
          if (data.ok) return data.result;
          throw Object.assign(new Error(data.error.message), { code: data.error.code });
        }
        throw decodeFailedError();
      },
      timeoutMs,
      timeoutError: decodeFailedError,
      terminateOnTimeout: true,
      signal,
      retryOnStartupFailure: request.operation === VideoImportOperation.Open,
    });
  };

  try {
    const opened = await run({ operation: VideoImportOperation.Open, file }, onProgress);
    if (opened.operation !== VideoImportOperation.Open)
      throw new Error(tUi("video.import.decode.failed"));
    return {
      metadata: opened.metadata,
      async analyze(algorithm, size, onAnalyzeProgress) {
        const result = await run(
          { operation: VideoImportOperation.Analyze, algorithm, size },
          onAnalyzeProgress,
        );
        if (result.operation !== VideoImportOperation.Analyze)
          throw new Error(tUi("video.import.decode.failed"));
        return result.grid;
      },
      async thumbnails(timestamps, width, height, onFrame) {
        await run(
          { operation: VideoImportOperation.Thumbnails, timestamps, width, height },
          undefined,
          onFrame,
        );
      },
      async preview(timeSeconds, width, height, plan, onPreviewProgress) {
        const result = await run(
          {
            operation: VideoImportOperation.Preview,
            timeSeconds,
            width,
            height,
            plan,
          },
          onPreviewProgress,
        );
        if (result.operation !== VideoImportOperation.Preview)
          throw new Error(tUi("video.import.decode.failed"));
        if (closed) throw new DOMException("Video source is closed", "AbortError");
        return retainPreview(new Blob([result.blob], { type: PREVIEW_MIME_TYPE }));
      },
      async decode(plan, onDecodeProgress) {
        const result = await run(
          { operation: VideoImportOperation.Decode, plan },
          onDecodeProgress,
        );
        if (result.operation !== VideoImportOperation.Decode)
          throw new Error(tUi("video.import.decode.failed"));
        return result.animation;
      },
      dispose,
    };
  } catch (reason) {
    dispose();
    throw reason;
  }
}
