export enum MenuCheckKind {
  Radio = "radio",
  Checkbox = "checkbox",
}

/** Read-only defaults for unsupported modes of the basic single-cel editor.
 * Disabled commands retain their checkmarks; this does not enable their actions.
 * Sources: preferences.xml and each command's onChecked (see view-menu-state-findings.md).
 */
const checks: Readonly<Record<string, boolean>> = {
  ShowExtras: true,
  ShowSelectionEdges: true,
  ShowTileNumbers: true,
  ShowPixelGrid: false,
  SnapToGrid: false,
  ShowOnionSkin: false,
  ShowBrushPreviewInPreview: false,
  SymmetryMode: false,
  TogglePreview: false,
  ToggleWorkspaceLayout: false,
};

export function unsupportedMenuCheck(
  command: string,
  params: Readonly<Record<string, string | undefined>> = {},
): { checked: boolean; checkType: MenuCheckKind } | undefined {
  if (Object.prototype.hasOwnProperty.call(checks, command))
    return { checked: checks[command], checkType: MenuCheckKind.Checkbox };
  if (command === "TiledMode" && ["none", "both", "x", "y"].includes(params.axis ?? ""))
    return { checked: params.axis === "none", checkType: MenuCheckKind.Radio };
  if (
    command === "ToggleOtherLayersOpacity" &&
    params.preview === "true" &&
    params.checkedIfZero === "true"
  )
    return { checked: false, checkType: MenuCheckKind.Checkbox };
  return undefined;
}
