import { useMemo, useRef } from "react";

import { useEditor, useEditorFields } from "$/managers/editor/editor-state-manager";
import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { formatPaletteEntry } from "$/managers/palette/palette-operations";
import type { PaletteToolbarModel } from "$/managers/palette/palette-toolbar-model";
import {
  getPaletteTransparencyModel,
  type PaletteTransparencyModel,
} from "$/managers/palette/transparent-index";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import { TilemapDisplayMode, type PaletteOperation } from "@xprite/editor-core";

type EditorState = ReturnType<typeof useEditor>;
type PaletteEditorState = Pick<
  EditorState,
  | "workingColorTarget"
  | "functional"
  | "paletteColors"
  | "setPaletteColors"
  | "paletteSelection"
  | "getPaletteSelection"
  | "setPaletteSelection"
  | "paletteIndex"
  | "setPaletteIndex"
  | "backgroundIndex"
  | "setBackgroundIndex"
  | "foreground"
  | "setForeground"
  | "background"
  | "setBackground"
  | "setSampledColor"
  | "setNotice"
>;

export interface EditorPaletteModel
  extends PaletteEditorState, PaletteToolbarModel, PaletteTransparencyModel {
  hasDocument: boolean;
  gestureOwner: object;
  isGestureOwnerCurrent: (owner: object) => boolean;
  tilemapLayerActive: boolean;
  hasTileset: boolean;
  tilemapDisplayMode: TilemapDisplayMode;
  deleteSelectedPaletteColors: (focusedIndex?: number) => number | null;
}

/** Palette editor selector and commands, including tilemap visibility state. */
export function useEditorPaletteModel(): EditorPaletteModel {
  const editor = useEditorFields([
    "workingColorTarget",
    "applyPaletteOperation",
    "background",
    "backgroundIndex",
    "foreground",
    "functional",
    "getPaletteSelection",
    "paletteAscending",
    "paletteColors",
    "paletteEditable",
    "paletteIndex",
    "paletteSelection",
    "setBackground",
    "setBackgroundIndex",
    "setForeground",
    "setNotice",
    "setPaletteAscending",
    "setPaletteColors",
    "setPaletteEditable",
    "setPaletteIndex",
    "setPaletteSelection",
    "setSampledColor",
  ]);
  const { core } = useEditorManagerContext();
  const runtime = useOptionalEditorRuntimeManagerContext();
  const snapshot = useEditorSnapshot(core);
  const documentKey = snapshot?.document?.id ?? snapshot?.document?.name ?? null;
  const gestureOwner = useMemo(() => ({}), [core, documentKey]);
  const menuSelection = useRef<{ owner: object; indices: number[] } | null>(null);
  const isGestureOwnerCurrent = (owner: object) => {
    if (owner !== gestureOwner || (runtime && runtime.workspace.active.core !== core)) return false;
    const document = core?.getSnapshot().document;
    return (document?.id ?? document?.name ?? null) === documentKey;
  };
  const timeline = snapshot?.document?.timeline;
  const activeLayer = timeline?.layers[timeline.activeLayer];
  const hasTileset =
    activeLayer?.kind === "tilemap" &&
    !!timeline?.tilesets?.some((tileset) => tileset.id === activeLayer.tilesetId);
  const deleteSelectedPaletteColors = (focusedIndex?: number) => {
    const current = core?.getSnapshot();
    const colors = current?.palette ?? editor.paletteColors;
    const workingIndex = (target: "foreground" | "background", fallback: number | null) => {
      if (!current) return fallback;
      const index =
        current.settings[target === "foreground" ? "foregroundIndex" : "backgroundIndex"];
      if (index !== undefined) return index;
      const match = colors.findIndex((color) =>
        color.every((channel, component) => channel === current.settings[target][component]),
      );
      return match < 0 ? null : match;
    };
    const foregroundSourceIndex = workingIndex("foreground", editor.paletteIndex);
    const backgroundSourceIndex = workingIndex("background", editor.backgroundIndex);
    const selected = new Set(
      editor
        .getPaletteSelection()
        .filter((index) => Number.isInteger(index) && index >= 0 && index < colors.length),
    );
    const focusedPaletteIndex =
      focusedIndex !== undefined && focusedIndex >= 0 && focusedIndex < colors.length
        ? focusedIndex
        : null;
    if (selected.size === 0 && focusedPaletteIndex !== null) selected.add(focusedPaletteIndex);

    const retainedIndices = colors.map((_, index) => index).filter((index) => !selected.has(index));
    if (selected.size === 0) return null;
    // Clearing every entry keeps the first color, as a palette cannot be empty.
    if (retainedIndices.length === 0) retainedIndices.push(0);

    const remapIndex = (index: number | null) => {
      if (index === null || index < 0 || index >= colors.length) return null;
      const retainedPosition = retainedIndices.indexOf(index);
      if (retainedPosition >= 0) return retainedPosition;
      const nextPosition = retainedIndices.findIndex((retainedIndex) => retainedIndex > index);
      return nextPosition >= 0 ? nextPosition : retainedIndices.length - 1;
    };

    const nextPalette = retainedIndices.map((index) => colors[index]!);
    const focusSourceIndex = focusedPaletteIndex ?? selected.values().next().value!;
    const nextFocusIndex = remapIndex(focusSourceIndex);
    editor.setPaletteColors(nextPalette);
    editor.setPaletteSelection([]);
    const paletteIndex = remapIndex(foregroundSourceIndex);
    const backgroundIndex = remapIndex(backgroundSourceIndex);
    if (foregroundSourceIndex !== null && paletteIndex !== null) {
      editor.setSampledColor(
        "foreground",
        formatPaletteEntry(nextPalette[paletteIndex]!),
        paletteIndex,
      );
    }
    if (backgroundSourceIndex !== null && backgroundIndex !== null) {
      editor.setSampledColor(
        "background",
        formatPaletteEntry(nextPalette[backgroundIndex]!),
        backgroundIndex,
      );
    }
    return nextFocusIndex;
  };

  return {
    ...getPaletteTransparencyModel(core, snapshot),
    workingColorTarget: editor.workingColorTarget,
    functional: editor.functional,
    paletteColors: editor.paletteColors,
    setPaletteColors: editor.setPaletteColors,
    paletteSelection: editor.paletteSelection,
    getPaletteSelection: editor.getPaletteSelection,
    setPaletteSelection: editor.setPaletteSelection,
    paletteIndex: editor.paletteIndex,
    setPaletteIndex: editor.setPaletteIndex,
    backgroundIndex: editor.backgroundIndex,
    setBackgroundIndex: editor.setBackgroundIndex,
    foreground: editor.foreground,
    setForeground: editor.setForeground,
    background: editor.background,
    setBackground: editor.setBackground,
    setSampledColor: editor.setSampledColor,
    setNotice: editor.setNotice,
    paletteEditable: editor.paletteEditable,
    setPaletteEditable: editor.setPaletteEditable,
    paletteAscending: editor.paletteAscending,
    capturePaletteMenuSelection: () => {
      menuSelection.current = { owner: gestureOwner, indices: [...editor.getPaletteSelection()] };
    },
    applyPaletteOperation: (operation: PaletteOperation) => {
      const captured = menuSelection.current;
      menuSelection.current = null;
      if (captured && !isGestureOwnerCurrent(captured.owner)) return;
      const indices = captured?.indices ?? editor.getPaletteSelection();
      editor.applyPaletteOperation(operation, indices);
      if (!captured || isGestureOwnerCurrent(captured.owner)) editor.setPaletteSelection(indices);
    },
    setPaletteAscending: editor.setPaletteAscending,
    hasDocument: Boolean(snapshot?.document),
    gestureOwner,
    isGestureOwnerCurrent,
    tilemapLayerActive: activeLayer?.kind === "tilemap",
    hasTileset,
    tilemapDisplayMode: snapshot?.settings.tilemapMode ?? TilemapDisplayMode.Tiles,
    deleteSelectedPaletteColors,
  };
}
