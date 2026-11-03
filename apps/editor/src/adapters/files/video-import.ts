import {
  VideoImportOperation,
  type VideoImportRequest,
  type VideoImportResponse,
  type VideoImportResult,
} from "$/adapters/workers/video-import-protocol";
import { tUi } from "$/i18n";
import {
  VideoImportFailure,
  type VideoImportHandle,
  type VideoImportProgress,
  type VideoImportPreview,
} from "$/managers/ports/video-import";

const PREVIEW_MIME_TYPE = "image/png";
const OPEN_TIMEOUT_MS = 60_000;
const PREVIEW_TIMEOUT_MS = 30_000;
const IMPORT_STALL_TIMEOUT_MS = 60_000;

interface PendingRequest {
  resolve(result: VideoImportResult): void;
  reject(reason: unknown): void;
  onProgress?: (progress: VideoImportProgress) => void;
  onThumbnail?: (index: number, preview: VideoImportPreview) => void;
  timer: ReturnType<typeof setTimeout>;
  timeoutMs: number;
}

export async function openVideoImport(
  file: File,
  signal: AbortSignal,
  onProgress: (progress: VideoImportProgress) => void,
): Promise<VideoImportHandle> {
  if (signal.aborted) throw new DOMException("Video import cancelled", "AbortError");
  if (typeof Worker !== "function")
    throw Object.assign(new Error(tUi("video.import.browser.unsupported")), {
      code: VideoImportFailure.Browser,
    });
  const worker = new Worker(new URL("../workers/video-import-worker.ts", import.meta.url), {
    type: "module",
  });
  const pending = new Map<number, PendingRequest>();
  const urls = new Set<string>();
  let nextId = 0;
  let closed = false;
  const dispose = (reason: unknown = new DOMException("Video import cancelled", "AbortError")) => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", cancel);
    worker.terminate();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(reason);
    }
    pending.clear();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  };
  const cancel = () => dispose();
  signal.addEventListener("abort", cancel, { once: true });
  const timedOut = () =>
    dispose(
      Object.assign(new Error(tUi("video.import.decode.failed")), {
        code: VideoImportFailure.Decode,
      }),
    );
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
  worker.addEventListener("message", ({ data }: MessageEvent<VideoImportResponse>) => {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    if ("thumbnail" in data) {
      request.timer = setTimeout(timedOut, request.timeoutMs);
      request.onThumbnail?.(data.thumbnail.index, retainPreview(data.thumbnail.blob));
      return;
    }
    if ("progress" in data) {
      request.timer = setTimeout(timedOut, request.timeoutMs);
      request.onProgress?.(data.progress);
      return;
    }
    pending.delete(data.id);
    if (data.ok) request.resolve(data.result);
    else request.reject(Object.assign(new Error(data.error.message), { code: data.error.code }));
  });
  worker.addEventListener("error", () =>
    dispose(
      Object.assign(new Error(tUi("video.import.decode.failed")), {
        code: VideoImportFailure.Decode,
      }),
    ),
  );
  worker.addEventListener("messageerror", () =>
    dispose(
      Object.assign(new Error(tUi("video.import.decode.failed")), {
        code: VideoImportFailure.Decode,
      }),
    ),
  );

  const run = (
    request:
      | Omit<Extract<VideoImportRequest, { operation: VideoImportOperation.Open }>, "id">
      | Omit<Extract<VideoImportRequest, { operation: VideoImportOperation.Preview }>, "id">
      | Omit<Extract<VideoImportRequest, { operation: VideoImportOperation.Decode }>, "id">
      | Omit<Extract<VideoImportRequest, { operation: VideoImportOperation.Thumbnails }>, "id">,
    onProgress?: (progress: VideoImportProgress) => void,
    onThumbnail?: (index: number, preview: VideoImportPreview) => void,
  ): Promise<VideoImportResult> =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new DOMException("Video source is closed", "AbortError"));
        return;
      }
      const id = ++nextId;
      const timeoutMs =
        request.operation === VideoImportOperation.Open
          ? OPEN_TIMEOUT_MS
          : request.operation === VideoImportOperation.Preview
            ? PREVIEW_TIMEOUT_MS
            : IMPORT_STALL_TIMEOUT_MS;
      pending.set(id, {
        resolve,
        reject,
        onProgress,
        onThumbnail,
        timeoutMs,
        timer: setTimeout(timedOut, timeoutMs),
      });
      try {
        worker.postMessage({ ...request, id });
      } catch (reason) {
        dispose(reason);
      }
    });
  try {
    const opened = await run({ operation: VideoImportOperation.Open, file }, onProgress);
    if (opened.operation !== VideoImportOperation.Open)
      throw new Error(tUi("video.import.decode.failed"));
    return {
      metadata: opened.metadata,
      async thumbnails(timestamps, width, height, onFrame) {
        await run(
          { operation: VideoImportOperation.Thumbnails, timestamps, width, height },
          undefined,
          onFrame,
        );
      },
      async preview(timeSeconds, width, height, plan, onProgress) {
        const result = await run(
          {
            operation: VideoImportOperation.Preview,
            timeSeconds,
            width,
            height,
            plan,
          },
          onProgress,
        );
        if (result.operation !== VideoImportOperation.Preview)
          throw new Error(tUi("video.import.decode.failed"));
        if (closed) throw new DOMException("Video source is closed", "AbortError");
        return retainPreview(new Blob([result.blob], { type: PREVIEW_MIME_TYPE }));
      },
      async decode(plan, onProgress) {
        const result = await run({ operation: VideoImportOperation.Decode, plan }, onProgress);
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
