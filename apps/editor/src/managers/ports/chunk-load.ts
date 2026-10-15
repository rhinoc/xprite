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
