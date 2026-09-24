import { useEditorFields } from "$/managers/editor/editor-state-manager";
import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { editorSceneForTab } from "$/managers/editor/editor-ui-store";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import {
  createPaletteFromSprite,
  normalizeEditorPalette,
  type PaletteColor,
} from "$/managers/palette/palette-operations";
import {
  comparePaletteResourceNames,
  deletePalettePreset,
  readBundledPalettePresets,
  readDefaultPalette,
  readPaletteFile,
  readPalettePresets,
  saveDefaultPalette,
  savePalettePreset,
  serializeAsePalette,
  serializeGplPalette,
} from "$/managers/palette/presets";
import {
  getPaletteTransparencyModel,
  type PaletteTransparencyModel,
} from "$/managers/palette/transparent-index";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { measuredEditorViewport } from "$/managers/workspace/editor-layout";
import { executeEditorCommand } from "@xprite/editor-core";

export function comparePaletteResources(a: string, b: string): number {
  return comparePaletteResourceNames(a, b);
}

export function listSavedPalettePresets() {
  return readPalettePresets();
}

export function listBundledPalettePresets() {
  return readBundledPalettePresets();
}

export function loadDefaultEditorPalette() {
  return readDefaultPalette();
}

export function saveEditorPaletteAsDefault(colors: readonly PaletteColor[]): void {
  saveDefaultPalette(colors);
}

export function saveEditorPalettePreset(name: string, colors: readonly PaletteColor[]): void {
  savePalettePreset(name, colors);
}

export function removeEditorPalettePreset(name: string): void {
  deletePalettePreset(name);
}

export function serializeEditorPaletteAsAse(colors: readonly PaletteColor[]) {
  return serializeAsePalette(colors);
}

export function serializeEditorPaletteAsGpl(colors: readonly PaletteColor[], name: string) {
  return serializeGplPalette(colors, name);
}

export interface PaletteActionsModel extends PaletteTransparencyModel {
  colors: readonly PaletteColor[];
  hasDocument: boolean;
  documentKey: number | string | null;
  documentName: string;
  paletteEditable: boolean;
  setPaletteEditable(value: boolean | ((current: boolean) => boolean)): void;
  swapColors(): void;
  applyPalette(colors: readonly (readonly number[])[]): void;
  extractSpritePalette(maxColors: number): PaletteColor[];
  loadPaletteFromFile(file: File): Promise<PaletteColor[]>;
}

/** Palette options selector and document-level commands for the palette menu. */
export function usePaletteActionsModel(): PaletteActionsModel {
  const editor = useEditorFields([
    "tab",
    "timelineVisible",
    "paletteColors",
    "paletteEditable",
    "setPaletteColors",
    "setPaletteEditable",
    "setPaletteSelection",
  ]);
  const { core } = useEditorManagerContext();
  const snapshot = useEditorSnapshot(core);
  const platform = useEditorPlatformPorts();
  return {
    ...getPaletteTransparencyModel(core, snapshot),
    colors: normalizeEditorPalette(editor.paletteColors),
    hasDocument: editor.tab === "document" && Boolean(snapshot?.document),
    documentKey: snapshot?.document ? (snapshot.document.id ?? snapshot.document.name) : null,
    documentName: snapshot?.document?.name ?? "palette",
    paletteEditable: editor.paletteEditable,
    setPaletteEditable: editor.setPaletteEditable,
    swapColors: () => {
      if (!core || editor.tab !== "document" || !core.getSnapshot().document) return;
      executeEditorCommand(
        core,
        { type: "swap-colors" },
        {
          scene: editorSceneForTab(editor.tab),
          viewport: measuredEditorViewport(core, editor.timelineVisible),
        },
      );
    },
    applyPalette: (colors) => {
      editor.setPaletteColors(normalizeEditorPalette(colors));
      editor.setPaletteSelection([]);
    },
    extractSpritePalette: (maxColors) => {
      if (!core || !snapshot?.document) return [];
      return createPaletteFromSprite(core.canvas.exportComposite(), maxColors);
    },
    loadPaletteFromFile: (file) =>
      readPaletteFile(file, {
        decodeAsepriteBlob: platform?.files.decodeAsepriteBlob,
        decodeImageBlob: platform?.files.decodeImageBlob,
      }),
  };
}
