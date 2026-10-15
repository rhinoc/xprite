import { CHUNK_LOAD_FAILED_EVENT, type ChunkLoadFailureDetail } from "$/managers/ports/chunk-load";

export const CHUNK_LOAD_RETRY_DELAY_MS = 600;

/**
 * Loads a dynamically imported chunk, retrying once after a short pause. A second failure is
 * announced on `window` for the diagnostics adapter and then rethrown. It never reloads the page:
 * the user may be mid-edit.
 */
export async function loadChunk<T>(importer: () => Promise<T>): Promise<T> {
  try {
    return await importer();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, CHUNK_LOAD_RETRY_DELAY_MS));
  }
  try {
    return await importer();
  } catch (error) {
    if (typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent<ChunkLoadFailureDetail>(CHUNK_LOAD_FAILED_EVENT, { detail: { error } }),
      );
    throw error;
  }
}
