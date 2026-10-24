export enum SaveTarget {
  FileSystem = "file-system",
  Browser = "browser",
}

export type SaveDialogIntent = "save" | "save-as";

/**
 * Whether File → Save / Save As should open the Save As dialog
 * (name / format / Browser vs File Manager) instead of saving in place.
 *
 * Save As always opens the dialog.
 * Save opens it only when no destination preference is stored
 * (`xse.workspace.save-target.v1` via setSaveTarget) AND the browser can
 * offer File Manager (`canPickSaveFile`). Otherwise Save stays on the silent
 * Browser path from getSaveTarget().
 */
export function shouldOpenSaveAsDialog(
  intent: SaveDialogIntent,
  configuredTarget: SaveTarget | null,
  canPickSaveFile: boolean,
): boolean {
  if (intent === "save-as") return true;
  return configuredTarget === null && canPickSaveFile;
}
