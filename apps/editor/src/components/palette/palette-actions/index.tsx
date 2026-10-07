import { useEffect, useRef, useState } from "react";

import { Alert } from "$/components/dialogs/alert";
import { FormDialog } from "$/components/dialogs/form-dialog";
import {
  PalettePresetPopup,
  type PaletteBrowserChoice,
} from "$/components/palette/palette-preset-popup";
import { tUi, useUiLanguage } from "$/i18n";
import {
  comparePaletteResources as comparePaletteResourceNames,
  loadDefaultEditorPalette as readDefaultPalette,
  listBundledPalettePresets as readBundledPalettePresets,
  listSavedPalettePresets as readPalettePresets,
  removeEditorPalettePreset as deletePalettePreset,
  saveEditorPaletteAsDefault as saveDefaultPalette,
  saveEditorPalettePreset as savePalettePreset,
  serializeEditorPaletteAsAse as serializeAsePalette,
  serializeEditorPaletteAsGpl as serializeGplPalette,
  usePaletteActionsModel,
} from "$/managers/palette/palette-actions-model";
import { resizeEditorPalette } from "$/managers/palette/palette-operations";
import { MAX_EDITOR_PALETTE_COLORS } from "$/managers/palette/palette-view";
import { Button, Menu, type MenuItem } from "@xprite/ui";

enum PaletteDialog {
  Preset = "preset",
  Quantize = "quantize",
  Size = "size",
  Transparent = "transparent",
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Palette Presets and Palette Options commands for the palette toolbar. */
export function PaletteActions() {
  const editor = usePaletteActionsModel();
  useUiLanguage();
  const [presets, setPresets] = useState(readPalettePresets);
  const [bundledPresets] = useState(readBundledPalettePresets);
  const [dialog, setDialog] = useState<PaletteDialog | null>(null);
  const [presetName, setPresetName] = useState("");
  const [colorCount, setColorCount] = useState(32);
  const [paletteSize, setPaletteSize] = useState(32);
  const [transparentIndex, setTransparentIndex] = useState(0);
  const [transparentDocumentKey, setTransparentDocumentKey] = useState(editor.documentKey);
  const [error, setError] = useState<string | null>(null);
  const [loadingPalette, setLoadingPalette] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const loadRequest = useRef(0);
  const currentDocumentKey = useRef(editor.documentKey);
  currentDocumentKey.current = editor.documentKey;
  const colors = editor.colors;
  useEffect(() => {
    setDialog((current) => (current === PaletteDialog.Transparent ? null : current));
    loadRequest.current += 1;
    setLoadingPalette(false);
  }, [editor.documentKey]);
  useEffect(
    () => () => {
      loadRequest.current += 1;
    },
    [],
  );
  const apply = (palette: readonly (readonly number[])[]) => {
    try {
      editor.applyPalette(palette);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load palette.");
    }
  };
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Palette operation failed.");
    }
  };
  const loadPaletteFile = async (file: File) => {
    const request = ++loadRequest.current;
    const documentKey = editor.documentKey;
    setLoadingPalette(true);
    try {
      const palette = await editor.loadPaletteFromFile(file);
      if (request !== loadRequest.current || documentKey !== currentDocumentKey.current) return;
      apply(palette);
    } catch (caught) {
      if (request === loadRequest.current && documentKey === currentDocumentKey.current)
        setError(caught instanceof Error ? caught.message : "Unable to load palette file.");
    } finally {
      if (request === loadRequest.current) setLoadingPalette(false);
    }
  };
  const paletteChoices: PaletteBrowserChoice[] = [
    ...bundledPresets.map((preset) => ({
      ...preset,
      id: `builtin:${preset.id}`,
      source: "builtin" as const,
    })),
    ...presets.map((preset) => ({
      id: `saved:${preset.name.toLocaleLowerCase()}`,
      name: preset.name,
      group: "Saved Presets",
      author: null,
      colors: preset.colors,
      source: "saved" as const,
    })),
  ].sort((a, b) => comparePaletteResourceNames(a.name, b.name));
  const savePreset = () =>
    attempt(() => {
      savePalettePreset(presetName, colors);
      setPresets(readPalettePresets());
      setDialog(null);
    });
  const generate = () =>
    attempt(() => {
      if (!editor.hasDocument) return;
      const next = editor.extractSpritePalette(Math.trunc(colorCount));
      if (!next.length) throw new Error("The sprite has no colors to extract.");
      apply(next);
      setDialog(null);
    });
  const saveFile = async (format: "gpl" | "ase") => {
    try {
      const name = editor.documentName.replace(/\.[^.]+$/, "") || "palette";
      if (format === "ase") {
        const bytes = await serializeAsePalette(colors);
        download(
          `${name}.ase`,
          new Blob([new Uint8Array(bytes) as BlobPart], { type: "application/x-aseprite" }),
        );
      } else {
        download(
          `${name}.gpl`,
          new Blob([serializeGplPalette(colors, name)], { type: "text/plain" }),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save palette.");
    }
  };
  const optionsItems: MenuItem[] = [
    {
      label: "Edit Palette",
      checked: editor.paletteEditable,
      onSelect: () => editor.setPaletteEditable((value) => !value),
    },
    {
      label: tUi("ui.touch.swap.colors"),
      disabled: !editor.hasDocument,
      onSelect: editor.swapColors,
    },
    {
      label: "Palette Size...",
      onSelect: () => {
        setPaletteSize(colors.length);
        setDialog(PaletteDialog.Size);
      },
    },
    {
      label: tUi("ui.transparent.index.ellipsis"),
      disabled: !editor.indexedColorMode || editor.maxTransparentPaletteIndex < 0,
      onSelect: () => {
        setTransparentIndex(editor.transparentPaletteIndex);
        setTransparentDocumentKey(editor.documentKey);
        setDialog(PaletteDialog.Transparent);
      },
    },
    {
      label: "Load Palette...",
      separator: true,
      disabled: loadingPalette,
      onSelect: () => picker.current?.click(),
    },
    {
      label: tUi("ui.load.palette.from.image.ellipsis"),
      disabled: loadingPalette,
      onSelect: () => imagePicker.current?.click(),
    },
    { label: "Load Default Palette", onSelect: () => apply(readDefaultPalette()) },
    {
      label: "Save Palette",
      children: [
        { label: "GIMP Palette (.gpl)", onSelect: () => void saveFile("gpl") },
        { label: "Aseprite Palette (.ase)", onSelect: () => void saveFile("ase") },
      ],
    },
    {
      label: "Save Palette as Preset...",
      onSelect: () => {
        setPresetName("");
        setDialog(PaletteDialog.Preset);
      },
    },
    { label: "Save Palette as Default", onSelect: () => attempt(() => saveDefaultPalette(colors)) },
    {
      label: "Delete Preset",
      disabled: !presets.length,
      children: presets.map((preset) => ({
        label: preset.name,
        onSelect: () =>
          attempt(() => {
            deletePalettePreset(preset.name);
            setPresets(readPalettePresets());
          }),
      })),
    },
    {
      label: "Create Palette from Current Sprite...",
      separator: true,
      disabled: !editor.hasDocument,
      onSelect: () => {
        setColorCount(Math.min(256, Math.max(1, colors.length)));
        setDialog(PaletteDialog.Quantize);
      },
    },
  ];
  return (
    <>
      <PalettePresetPopup
        choices={paletteChoices}
        activePalette={colors}
        hasDocument={editor.hasDocument}
        onLoad={apply}
        onRefresh={() => setPresets(readPalettePresets())}
        onOpenFolder={(choice) =>
          setError(
            tUi("ui.is.bundled.with.this.web.app.and.has.no.local.folder.to.open", {
              value1: choice.name,
            }),
          )
        }
      />
      <Menu
        label="Palette options"
        items={optionsItems}
        renderTrigger={(props) => (
          <Button
            tintDisabledIcon
            {...props}
            pixelSize={{ width: 15, height: 16 }}
            icon="pal_options"
            aria-label="Palette options"
          />
        )}
      />
      <input
        ref={picker}
        type="file"
        accept=".gpl,.pal,.ase,.aseprite,image/*"
        hidden
        disabled={loadingPalette}
        aria-label={tUi("ui.load.palette.file")}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void loadPaletteFile(file);
        }}
      />
      <input
        ref={imagePicker}
        type="file"
        accept="image/*"
        hidden
        disabled={loadingPalette}
        aria-label={tUi("ui.load.palette.from.image.ellipsis")}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void loadPaletteFile(file);
        }}
      />
      <FormDialog
        open={dialog === PaletteDialog.Preset}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title="Save Palette as Preset"
        fields={[
          { key: "name", label: "Name:", type: "text", value: presetName, onChange: setPresetName },
        ]}
        actions={[
          { label: "Save", disabled: !presetName.trim(), onClick: savePreset },
          { label: "Cancel", onClick: () => setDialog(null) },
        ]}
        width={320}
      />
      <FormDialog
        open={dialog === PaletteDialog.Quantize}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title="Palette from Sprite"
        fields={[
          {
            key: "count",
            label: "Number of colors:",
            type: "number",
            value: colorCount,
            min: 1,
            max: 256,
            onChange: setColorCount,
          },
        ]}
        actions={[
          {
            label: "OK",
            disabled: !Number.isInteger(colorCount) || colorCount < 1 || colorCount > 256,
            onClick: generate,
          },
          { label: "Cancel", onClick: () => setDialog(null) },
        ]}
        width={320}
      />
      <FormDialog
        open={dialog === PaletteDialog.Size}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title="Palette Size"
        fields={[
          {
            key: "size",
            label: "Colors:",
            type: "number",
            value: paletteSize,
            min: 1,
            max: MAX_EDITOR_PALETTE_COLORS,
            onChange: setPaletteSize,
          },
        ]}
        actions={[
          {
            label: "OK",
            disabled:
              !Number.isInteger(paletteSize) ||
              paletteSize < 1 ||
              paletteSize > MAX_EDITOR_PALETTE_COLORS,
            onClick: () => {
              apply(resizeEditorPalette(colors, paletteSize));
              setDialog(null);
            },
          },
          { label: "Cancel", onClick: () => setDialog(null) },
        ]}
        width={280}
      />
      <FormDialog
        open={dialog === PaletteDialog.Transparent && editor.documentKey === transparentDocumentKey}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={tUi("ui.transparent.index")}
        fields={[
          {
            key: "transparentIndex",
            label: tUi("ui.palette.index.colon"),
            type: "number",
            value: transparentIndex,
            min: 0,
            max: editor.maxTransparentPaletteIndex,
            onChange: setTransparentIndex,
          },
        ]}
        actions={[
          {
            label: "OK",
            disabled:
              !editor.indexedColorMode ||
              !Number.isInteger(transparentIndex) ||
              transparentIndex < 0 ||
              transparentIndex > editor.maxTransparentPaletteIndex,
            onClick: () => {
              if (editor.setTransparentPaletteIndex(transparentIndex)) setDialog(null);
            },
          },
          { label: "Cancel", onClick: () => setDialog(null) },
        ]}
        width={280}
      />
      <Alert
        open={!!error}
        onOpenChange={(open) => {
          if (!open) setError(null);
        }}
        title="Palette Error"
        messageLines={error ? [error] : []}
        actions={[{ label: "OK", onClick: () => setError(null) }]}
      />
    </>
  );
}
