import { useEffect, useMemo, useRef } from "react";

import { useEditorFields, useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import {
  normalizeEditorPalette,
  resizeEditorPalette,
  type PaletteColor,
} from "$/managers/palette/palette-operations";
import {
  readDefaultPalette,
  readPaletteFile,
  readPalettePresets,
  saveDefaultPalette,
  savePalettePreset,
} from "$/managers/palette/presets";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { useColorSelectorPreferences } from "$/managers/preferences/use-color-selector-preferences";
import { usePaletteBoxSizePreference } from "$/managers/preferences/use-panel-layout-preferences";
import { ShortcutBindingKind, shortcutIdentity } from "$/managers/shortcuts/shortcut-catalog";
import { useShortcutManager } from "$/managers/shortcuts/use-shortcut-manager";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import {
  ColorSelectorMode,
  PaletteGenerationTarget,
  PaletteHistoryLabel,
  PaletteQuantizationAlgorithm,
  evaluateSizeExpression,
  quantizePalette,
  renderTimelineFrame,
  LAYER_BACKGROUND,
  usedPaletteEntries,
  usedTilesetEntries,
  workingColorProfile,
  type PaletteGenerationOptions,
} from "@xprite/editor-core";
import {
  comparePaletteResourceNames,
  PaletteFileFormat,
  serializePaletteFile,
} from "@xprite/editor-core/import-export";
import { readBundledPalettePresets } from "@xprite/editor-ui/palette-presets";

export const PaletteColorSelectorMode = ColorSelectorMode;
export const PaletteGenerationMode = PaletteGenerationTarget;
export const PaletteGenerationAlgorithm = PaletteQuantizationAlgorithm;
export const PaletteExportFormat = PaletteFileFormat;
export type PaletteExportFormat = PaletteFileFormat;
export type PaletteGenerationDraft = Omit<PaletteGenerationOptions, "count"> & {
  expression: string;
  advanced: boolean;
};
export enum PaletteEntrySize {
  Small = 7,
  Medium = 11,
  Large = 17,
}
export enum PaletteUsageSelection {
  Used = "used",
  Unused = "unused",
}
const GENERATION_PREFERENCES_KEY = "xse.palette.generation.v1";
interface PaletteGenerationPreferences {
  advanced?: boolean;
  alpha?: boolean;
}
const MAX_NATIVE_PALETTE_SIZE = 0x7fffffff;
const OPAQUE_BLACK: PaletteColor = [0, 0, 0, 255];
export const PALETTE_EXPORT_FORMATS = Object.values(PaletteFileFormat).map((extension) => ({
  extension,
  mime:
    extension === PaletteFileFormat.Png
      ? "image/png"
      : extension === PaletteFileFormat.Gif
        ? "image/gif"
        : extension === PaletteFileFormat.Svg
          ? "image/svg+xml"
          : "application/octet-stream",
  description: `${extension.toUpperCase()} (*.${extension})`,
}));
export const comparePaletteResources = comparePaletteResourceNames;
export const listSavedPalettePresets = readPalettePresets;
export const listBundledPalettePresets = readBundledPalettePresets;
export const loadDefaultEditorPalette = readDefaultPalette;

export function paletteSizeValue(expression: string): number | null {
  const result = evaluateSizeExpression(expression);
  return result === null
    ? null
    : Math.max(1, Math.min(MAX_NATIVE_PALETTE_SIZE, Math.trunc(result)));
}

export function usePaletteActionsModel() {
  const editor = useEditorFields([
    "tab",
    "paletteColors",
    "paletteEditable",
    "setPaletteColors",
    "setPaletteEditable",
    "paletteSelection",
    "getPaletteSelection",
    "setPaletteSelection",
  ]);
  const { core, uiStore } = useEditorManagerContext();
  const snapshot = useEditorSnapshot(core);
  const platform = useEditorPlatformPorts();
  const sizePreference = usePaletteBoxSizePreference();
  const selectorPreference = useColorSelectorPreferences();
  const shortcuts = useShortcutManager();
  const runtime = useOptionalEditorRuntimeManagerContext();
  const shortcutOwnerActive = useRef(true);
  shortcutOwnerActive.current = !runtime || runtime.workspace.active.core === core;
  const documentKey = snapshot?.document ? (snapshot.document.id ?? snapshot.document.name) : null;
  const operationOwner = useMemo(() => ({}), [core, documentKey, editor.tab]);
  const colors = normalizeEditorPalette(editor.paletteColors);
  const hasDocument = editor.tab === "document" && Boolean(snapshot?.document);
  useEffect(() => {
    if (!hasDocument && !editor.paletteColors.length) editor.setPaletteColors(readDefaultPalette());
  }, [hasDocument, editor.paletteColors.length, editor.setPaletteColors]);
  const tilemap = snapshot?.document?.timeline;
  const canSelectTiles =
    hasDocument &&
    tilemap?.layers[tilemap.activeLayer]?.kind === "tilemap" &&
    Boolean(
      tilemap.tilesets?.some((set) => set.id === tilemap.layers[tilemap.activeLayer]?.tilesetId),
    );
  const selectedColors = [...new Set(editor.getPaletteSelection())].filter(
    (index) => index >= 0 && index < colors.length,
  );
  const toggleEditable = useRef(() => {});
  toggleEditable.current = () => editor.setPaletteEditable((value) => !value);
  useEffect(
    () =>
      shortcuts?.registerMenuCommand(
        shortcutIdentity(ShortcutBindingKind.Command, "PaletteEditor"),
        { execute: () => toggleEditable.current(), canExecute: () => shortcutOwnerActive.current },
      ),
    [shortcuts],
  );
  const applyPalette = (palette: readonly (readonly number[])[]) =>
    editor.setPaletteColors(normalizeEditorPalette(palette));
  return {
    ...sizePreference,
    colors,
    hasDocument,
    canSelectTiles,
    operationOwner,
    documentKey,
    selectedColors,
    documentName: snapshot?.document?.name ?? "palette",
    paletteEditable: editor.paletteEditable,
    setPaletteEditable: editor.setPaletteEditable,
    editPaletteShortcut: shortcuts?.formatShortcut("PaletteEditor") ?? "",
    selectorMode: selectorPreference.mode,
    setSelectorMode: (mode: ColorSelectorMode) => selectorPreference.setPreferences({ mode }),
    applyPalette,
    saveAsDefault: () =>
      saveDefaultPalette(
        colors,
        workingColorProfile(hasDocument ? snapshot?.document?.timeline : undefined),
      ),
    resizePalette: (expression: string) => {
      const count = paletteSizeValue(expression);
      if (!hasDocument || count === null) return false;
      if (!core) return false;
      core.color.setPalette(resizeEditorPalette(colors, count), {
        label: PaletteHistoryLabel.Size,
      });
      return true;
    },
    selectColors: (selection: PaletteUsageSelection) => {
      const current = core?.getSnapshot();
      if (!current?.document || !hasDocument) return;
      const used = new Set(usedPaletteEntries(current.document, current.palette));
      editor.setPaletteSelection(
        current.palette.flatMap((_, index) =>
          used.has(index) === (selection === PaletteUsageSelection.Used) ? [index] : [],
        ),
      );
    },
    selectTiles: (selection: PaletteUsageSelection) => {
      const current = core?.getSnapshot();
      if (!core || !current?.document || !hasDocument) return;
      const usage = usedTilesetEntries(current.document);
      if (!usage) return;
      const used = new Set(usage.used);
      uiStore.getState().setTilesetSelection({
        owner: core,
        documentKey: current.document.id ?? current.document.name,
        tilesetId: usage.tilesetId,
        indices: Array.from({ length: usage.count }, (_, index) => index).filter(
          (index) => used.has(index) === (selection === PaletteUsageSelection.Used),
        ),
      });
    },
    initialGenerationDraft: (): PaletteGenerationDraft => {
      let saved: PaletteGenerationPreferences | null = null;
      try {
        saved = platform?.preferences.readJson(
          GENERATION_PREFERENCES_KEY,
        ) as PaletteGenerationPreferences | null;
      } catch {
        /* Use dialog defaults when storage is unavailable. */
      }
      return {
        expression: "256",
        target: PaletteGenerationTarget.New,
        alpha: false,
        advanced: saved?.advanced === true,
        algorithm: PaletteQuantizationAlgorithm.Default,
      };
    },
    generatePalette: (options: PaletteGenerationDraft): boolean => {
      const current = core?.getSnapshot();
      if (!core || !current?.document || !hasDocument) return false;
      const document = current.document;
      const selected = [...new Set(editor.getPaletteSelection())]
        .filter((index) => index >= 0 && index < current.palette.length)
        .sort((a, b) => a - b);
      if (options.target === PaletteGenerationTarget.Selected && selected.length < 2) return false;
      const requested = paletteSizeValue(options.expression);
      if (requested === null) return false;
      const count =
        options.target === PaletteGenerationTarget.New
          ? requested
          : options.target === PaletteGenerationTarget.Current
            ? current.palette.length
            : selected.length;
      const timeline = document.timeline;
      function* images() {
        if (!timeline) {
          yield document.layer.pixels;
          return;
        }
        for (let frame = 0; frame < timeline.frames.length; frame++)
          yield renderTimelineFrame(
            timeline,
            document.width,
            document.height,
            frame,
            undefined,
            false,
          );
      }
      const opaque = timeline
        ? timeline.layers.length === 1 && Boolean(timeline.layers[0].flags & LAYER_BACKGROUND)
        : false;
      const mask = opaque ? -1 : (timeline?.transparentIndex ?? 0);
      const generated = quantizePalette(
        images(),
        count,
        options.alpha,
        options.algorithm,
        mask,
        opaque ? 0 : mask,
      );
      const positions = new Map(selected.map((index, position) => [index, position]));
      const next =
        options.target === PaletteGenerationTarget.New
          ? generated
          : current.palette.map((color, index) => {
              const position =
                options.target === PaletteGenerationTarget.Current
                  ? index
                  : (positions.get(index) ?? -1);
              return position < 0 ? color : (generated[position] ?? OPAQUE_BLACK);
            });
      core.color.setPalette(next, { label: PaletteHistoryLabel.Quantization });
      try {
        platform?.preferences.writeJson(GENERATION_PREFERENCES_KEY, {
          advanced: options.advanced,
          alpha: options.alpha,
        });
      } catch {
        /* The document edit remains valid when preference storage is unavailable. */
      }
      return true;
    },
    canSavePalette: Boolean(platform?.files.savePaletteFile),
    savePalette: async (
      name: string,
      format: PaletteFileFormat,
      preset: boolean,
    ): Promise<boolean> => {
      if (!platform?.files.savePaletteFile) return false;
      const palette = colors;
      const profile = workingColorProfile(hasDocument ? snapshot?.document?.timeline : undefined);
      const extension = name.split(".").pop()?.toLowerCase();
      const filename =
        extension &&
        (Object.values(PaletteFileFormat).some((value) => value === extension) ||
          extension === "aseprite")
          ? name
          : name.replace(/\.[^./]+$/, "") + `.${format}`;
      const output = await platform.files.savePaletteFile({
        name: filename,
        formats: PALETTE_EXPORT_FORMATS,
        encode: (extension) =>
          serializePaletteFile(
            palette,
            extension as PaletteFileFormat,
            profile,
            filename.replace(/\.[^.]+$/, ""),
          ),
      });
      if (!output) return false;
      if (preset && !/\.(?:css|svg)$/i.test(output.name)) {
        const savedFile = new File([new Uint8Array(output.bytes).buffer], output.name);
        const loaded = await readPaletteFile(savedFile, {
          decodeAsepriteBlob: platform.files.decodeAsepriteBlob,
          decodeImageBlob: platform.files.decodeImageBlob,
          decodePaletteImageBytes: platform.files.decodePaletteImageBytes,
        });
        savePalettePreset(output.name, loaded);
      }
      return true;
    },
    loadPaletteFromFile: (file: File) =>
      readPaletteFile(file, {
        decodeAsepriteBlob: platform?.files.decodeAsepriteBlob,
        decodeImageBlob: platform?.files.decodeImageBlob,
        decodePaletteImageBytes: platform?.files.decodePaletteImageBytes,
      }),
  };
}
