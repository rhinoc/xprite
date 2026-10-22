import { tUi } from "$/i18n";
import {
  CHUNK_LOAD_FAILED_EVENT,
  WORKER_LOAD_ERROR_NAME,
  type ChunkLoadFailureDetail,
} from "$/managers/ports/chunk-load";

/**
 * A worker that never started: its script, or a module it imports, could not be loaded. The
 * usual cause is a deployment that replaced the release this page loaded. Announce it the way a
 * failed lazy chunk is announced, so the page offers a reload and reports it once with service
 * worker context, and return the error that callers show. It never reloads the page.
 */
export function workerLoadFailed(diagnosticMessage: string): Error {
  const report = new Error(diagnosticMessage);
  report.name = WORKER_LOAD_ERROR_NAME;
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
