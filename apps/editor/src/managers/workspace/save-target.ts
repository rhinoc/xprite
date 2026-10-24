export enum SaveTarget {
  FileSystem = "file-system",
  Browser = "browser",
}

export type SaveDialogIntent = "save" | "save-as";

/**
 * Whether File → Save / Save As should open the Save As dialog
 * (name / format / Browser vs File Manager) instead of saving in place.
 *
 * Save opens that dialog until the user has stored a destination preference
 * (`xse.workspace.save-target.v1` via setSaveTarget). Save As always opens it.
 */
export function shouldOpenSaveAsDialog(
  intent: SaveDialogIntent,
  configuredTarget: SaveTarget | null,
): boolean {
  return intent === "save-as" || configuredTarget === null;
}
