import { tUi } from "$/i18n";
import {
  CHUNK_LOAD_FAILED_EVENT,
  WORKER_LOAD_ERROR_NAME,
  type ChunkLoadFailureDetail,
} from "$/managers/ports/chunk-load";

/**
 * Wait before starting a worker again after its script failed to load. Safari cancels loads that
 * a page starts while it hands a file to its download manager or begins to unload, and reports
 * them the same way as a missing script. A retry inside that window fails again.
 */
export const WORKER_LOAD_RETRY_DELAY_MS = 1_000;

/** A worker whose script failed to load is started this many times before the page gives up. */
export const WORKER_LOAD_ATTEMPTS = 2;

/** The diagnostic error for a worker that never started. It is not announced. */
export function workerLoadError(diagnosticMessage: string): Error {
  const error = new Error(diagnosticMessage);
  error.name = WORKER_LOAD_ERROR_NAME;
  return error;
}

export function isWorkerLoadError(error: unknown): error is Error {
  return error instanceof Error && error.name === WORKER_LOAD_ERROR_NAME;
}

/**
 * Announce a worker that still could not load after its retry. The usual cause is a deployment
 * that replaced the release this page loaded. Announce it the way a failed lazy chunk is
 * announced, so the page offers a reload and reports it once with service worker context, and
 * return the error that callers show. It never reloads the page.
 */
export function announceWorkerLoadFailure(report: Error): Error {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function")
    window.dispatchEvent(
      new CustomEvent<ChunkLoadFailureDetail>(CHUNK_LOAD_FAILED_EVENT, {
        detail: { error: report },
      }),
    );
  const error = new Error(tUi("ui.pwa.worker.load.failed"));
  error.name = WORKER_LOAD_ERROR_NAME;
  return error;
}

/** A worker without a retry path: announce the failed load immediately. */
export function workerLoadFailed(diagnosticMessage: string): Error {
  return announceWorkerLoadFailure(workerLoadError(diagnosticMessage));
}

/** Resolve after the retry delay; reject with AbortError when the signal aborts first. */
export function waitBeforeWorkerRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancelled = () => new DOMException("Cancelled", "AbortError");
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Load a module the in-process fallback needs. One failed attempt is retried after the delay,
 * for the same reason as a worker script.
 */
export async function importWithRetry<T>(load: () => Promise<T>, delayMs: number): Promise<T> {
  try {
    return await load();
  } catch {
    await waitBeforeWorkerRetry(delayMs);
    return load();
  }
}
