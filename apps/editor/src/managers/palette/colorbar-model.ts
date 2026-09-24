import { WorkingColorTarget } from "$/managers/colors/working-color-target";
import { useEditor, useEditorFields } from "$/managers/editor/editor-state-manager";
import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { TilemapDisplayMode } from "@xprite/editor-core";

type EditorState = ReturnType<typeof useEditor>;
type ColorbarState = Pick<
  EditorState,
  | "foreground"
  | "setForeground"
  | "background"
  | "paletteColors"
  | "paletteCapacityAvailable"
  | "functional"
  | "paletteEditable"
  | "setPaletteIndex"
  | "addPaletteColor"
  | "setNotice"
  | "colorHover"
>;

export interface PaletteColorbarModel extends ColorbarState {
  changeSelectorColor(color: string, target: WorkingColorTarget): void;
  hasDocument: boolean;
  tilemapActive: boolean;
  showTileFields: boolean;
}

/** Colorbar selector and state commands without exposing the editor core. */
export function usePaletteColorbarModel(): PaletteColorbarModel {
  const editor = useEditorFields([
    "addPaletteColor",
    "background",
    "colorHover",
    "foreground",
    "functional",
    "paletteCapacityAvailable",
    "paletteColors",
    "paletteEditable",
    "setForeground",
    "setNotice",
    "setPaletteIndex",
    "setSampledColor",
  ]);
  const { core } = useEditorManagerContext();
  const snapshot = useEditorSnapshot(core);
  const timeline = snapshot?.document?.timeline;
  const tilemapActive = timeline?.layers[timeline.activeLayer]?.kind === "tilemap";
  return {
    foreground: editor.foreground,
    setForeground: editor.setForeground,
    background: editor.background,
    paletteColors: editor.paletteColors,
    paletteCapacityAvailable: editor.paletteCapacityAvailable,
    functional: editor.functional,
    paletteEditable: editor.paletteEditable,
    setPaletteIndex: editor.setPaletteIndex,
    changeSelectorColor(color, target) {
      if (core?.getSnapshot().settings.tilemapMode === TilemapDisplayMode.Tiles)
        core.drawing.settings.setSettings({ tilemapMode: TilemapDisplayMode.Pixels });
      if (target === WorkingColorTarget.Background) {
        // Palette edit mode edits entries only through the foreground selector.
        editor.setSampledColor(target, color, null);
      } else {
        editor.setForeground(color);
        if (!editor.paletteEditable) editor.setPaletteIndex(null);
      }
    },
    addPaletteColor: editor.addPaletteColor,
    setNotice: editor.setNotice,
    colorHover: editor.colorHover,
    hasDocument: Boolean(snapshot?.document),
    tilemapActive,
    showTileFields: tilemapActive && snapshot?.settings.tilemapMode === TilemapDisplayMode.Tiles,
  };
}
