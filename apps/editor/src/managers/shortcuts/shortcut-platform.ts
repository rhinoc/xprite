import { EditorPrimaryModifier } from "$/managers/ports/platform";
import { ShortcutBindingKind } from "$/managers/ports/shortcut-files";
import type { ShortcutDefinition } from "$/managers/shortcuts/shortcut-catalog";

// Native bindings explicitly mapped to Command. Editing actions and document
// tab navigation keep physical Ctrl even on Apple platforms.
const PRIMARY_MODIFIER_COMMANDS = new Set([
  "NewFile",
  "OpenFile",
  "ReopenClosedFile",
  "SaveFile",
  "SaveFileAs",
  "SaveFileCopyAs",
  "CloseFile",
  "CloseAllFiles",
  "ImportSpriteSheet",
  "ExportSpriteSheet",
  "RepeatLastExport",
  "Exit",
  "Undo",
  "Redo",
  "Cut",
  "Copy",
  "CopyMerged",
  "Paste",
  "HueSaturation",
  "Options",
  "KeyboardShortcuts",
  "SpriteProperties",
  "SpriteSize",
  "NewLayer",
  "MaskAll",
  "MaskContent",
  "DeselectMask",
  "ReselectMask",
  "InvertMask",
  "ShowGrid",
  "ShowPixelGrid",
  "Zoom",
  "FitScreen",
  "NewBrush",
  "NewSpriteFromSelection",
]);

export function defaultShortcutBindings(
  definition: ShortcutDefinition,
  primaryModifier: EditorPrimaryModifier,
): readonly string[] {
  if (primaryModifier !== EditorPrimaryModifier.Command) return definition.defaults;
  if (definition.kind === ShortcutBindingKind.Command && definition.id === "FullscreenMode")
    return ["Ctrl+Cmd+F"];
  const useCommand =
    (definition.kind === ShortcutBindingKind.Command &&
      PRIMARY_MODIFIER_COMMANDS.has(definition.id)) ||
    (definition.kind === ShortcutBindingKind.Action && definition.id === "AutoSelectLayer") ||
    (definition.kind === ShortcutBindingKind.QuickTool && definition.id === "move");
  return useCommand
    ? definition.defaults.map((binding) => binding.replace(/(^|\+)Ctrl(?=\+|$)/g, "$1Cmd"))
    : definition.defaults;
}
