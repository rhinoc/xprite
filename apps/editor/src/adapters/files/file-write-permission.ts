import { tUi } from "$/i18n";
import { FILE_WRITE_PERMISSION_ERROR_NAME } from "$/managers/ports/diagnostics";

/**
 * The error for a write permission request on an opened file that did not return `granted`.
 * `prompt` means the user dismissed the browser's permission dialog: like closing a save picker,
 * that cancels the save quietly. `denied` means they refused; the message says so, and it is a
 * user decision, not an editor defect.
 */
export function fileWritePermissionRefused(permission: "denied" | "prompt", name: string): Error {
  if (permission === "prompt") {
    // Never shown or reported: the session treats AbortError as a cancelled save.
    const cancelled = new Error();
    cancelled.name = "AbortError";
    return cancelled;
  }
  const error = new Error(tUi("ui.write.permission.was.not.granted.for", { value1: name }));
  error.name = FILE_WRITE_PERMISSION_ERROR_NAME;
  return error;
}
