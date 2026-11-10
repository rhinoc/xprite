import { tUi } from "$/i18n";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";

/** Dispatch the same encoded copy when the selected file could not be written. */
export function downloadAfterFileWriteFailure(
  blob: Blob,
  name: string,
  reason: unknown,
): { method: "download"; name: string; downloadFallback: true } {
  try {
    downloadBlob(blob, name);
  } catch (downloadError) {
    // A download dispatch failure is a save error, even if it is an AbortError.
    throw new AggregateError([reason, downloadError], tUi("ui.file.write.download.failed"));
  }
  return { method: "download", name, downloadFallback: true };
}
