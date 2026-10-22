/** A lazily loaded build chunk failed twice. Carries the cause for the diagnostics adapter. */
export const CHUNK_LOAD_FAILED_EVENT = "xprite:chunk-load-failed";

export interface ChunkLoadFailureDetail {
  readonly error: unknown;
}

/** Reads the failing module URL from the browser's message, which names the full chunk URL. */
export function failedChunkUrl(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = /(https?:\/\/[^\s"')]+\.(?:m?js|css))/i.exec(message);
  return match ? match[1] : null;
}

/**
 * A worker script, or a module it imports, could not be loaded. Like a failed lazy chunk this
 * usually means the page runs a release whose files were replaced, so it is announced with
 * {@link CHUNK_LOAD_FAILED_EVENT}; that announcement is the one exception report.
 */
export const WORKER_LOAD_ERROR_NAME = "WorkerLoadError";
