import { useEditor } from "$/managers/editor/editor-state-manager";

type EditorState = ReturnType<typeof useEditor>;

export type PaletteToolbarModel = Pick<
  EditorState,
  | "paletteEditable"
  | "setPaletteEditable"
  | "paletteAscending"
  | "applyPaletteOperation"
  | "setPaletteAscending"
> & { capturePaletteMenuSelection(): void };
