import { useEffect, useRef, useState } from "react";

import { Alert } from "$/components/dialogs/alert";
import { FormDialog } from "$/components/dialogs/form-dialog";
import { PaletteGenerationDialog } from "$/components/palette/palette-generation-dialog";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import {
  comparePaletteResources,
  loadDefaultEditorPalette,
  listBundledPalettePresets,
  listSavedPalettePresets,
  usePaletteActionsModel,
  PaletteEntrySize,
  PaletteUsageSelection,
  PaletteColorSelectorMode,
  PaletteExportFormat,
  PALETTE_EXPORT_FORMATS,
  paletteSizeValue,
  type PaletteGenerationDraft,
} from "$/managers/palette/palette-actions-model";
import {
  PalettePresetPopup,
  type PaletteBrowserChoice,
  PalettePresetKind,
} from "@xprite/editor-ui";
import { Button, Menu, type MenuItem } from "@xprite/ui";

enum PaletteDialog {
  Generate = "generate",
  Size = "size",
  Save = "save",
  Preset = "preset",
}
export function PaletteActions() {
  const editor = usePaletteActionsModel();
  useUiLanguage();
  const [presets, setPresets] = useState(listSavedPalettePresets);
  const [bundledPresets] = useState(listBundledPalettePresets);
  const [dialog, setDialog] = useState<PaletteDialog | null>(null);
  const [generation, setGeneration] = useState<PaletteGenerationDraft>(
    editor.initialGenerationDraft,
  );
  const [size, setSize] = useState("256");
  const [filename, setFilename] = useState("palette.ase");
  const [format, setFormat] = useState<PaletteExportFormat>(PaletteExportFormat.Aseprite);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const owner = useRef(editor.operationOwner);
  owner.current = editor.operationOwner;
  useEffect(() => {
    setDialog(null);
    request.current++;
    setBusy(false);
  }, [editor.operationOwner]);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tUi("ui.palette.operation.failed"));
    }
  };
  const load = async (file: File) => {
    const id = ++request.current;
    const operationOwner = editor.operationOwner;
    setBusy(true);
    try {
      const colors = await editor.loadPaletteFromFile(file);
      if (id === request.current && operationOwner === owner.current) editor.applyPalette(colors);
    } catch (caught) {
      if (id === request.current && operationOwner === owner.current)
        setError(caught instanceof Error ? caught.message : tUi("ui.palette.operation.failed"));
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  const save = async () => {
    const id = ++request.current;
    setBusy(true);
    try {
      await editor.savePalette(filename, format, dialog === PaletteDialog.Preset);
      setPresets(listSavedPalettePresets());
      if (id === request.current) setDialog(null);
    } catch (caught) {
      if (id === request.current)
        setError(caught instanceof Error ? caught.message : tUi("ui.palette.operation.failed"));
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  const openSave = (preset: boolean) => {
    setFilename(`${editor.documentName.replace(/\.[^.]+$/, "") || "palette"}.ase`);
    setFormat(PaletteExportFormat.Aseprite);
    setDialog(preset ? PaletteDialog.Preset : PaletteDialog.Save);
  };
  const choices: PaletteBrowserChoice[] = [
    ...bundledPresets.map((preset) => ({
      ...preset,
      id: `builtin:${preset.id}`,
      source: PalettePresetKind.Builtin as const,
    })),
    ...presets.map((preset) => ({
      id: `saved:${preset.name.toLocaleLowerCase()}`,
      name: preset.name,
      group: "Saved Presets",
      author: null,
      colors: preset.colors,
      source: PalettePresetKind.Saved as const,
    })),
  ].sort((a, b) => comparePaletteResources(a.name, b.name));
  const items: MenuItem[] = [
    {
      label: tUi("ui.palette.menu.edit"),
      mnemonic: "p",
      checked: editor.paletteEditable,
      shortcut: editor.editPaletteShortcut,
      onSelect: () => editor.setPaletteEditable((value) => !value),
    },
    {
      label: tUi("ui.palette.menu.size"),
      mnemonic: "z",
      disabled: !editor.hasDocument,
      onSelect: () => {
        setSize(String(editor.colors.length));
        setDialog(PaletteDialog.Size);
      },
    },
    {
      label: tUi("ui.palette.menu.select"),
      mnemonic: "e",
      separator: true,
      children: [
        {
          label: tUi("ui.palette.used.colors"),
          disabled: !editor.hasDocument,
          onSelect: () => editor.selectColors(PaletteUsageSelection.Used),
        },
        {
          label: tUi("ui.palette.unused.colors"),
          disabled: !editor.hasDocument,
          onSelect: () => editor.selectColors(PaletteUsageSelection.Unused),
        },
        {
          label: tUi("ui.palette.used.tiles"),
          separator: true,
          disabled: !editor.canSelectTiles,
          onSelect: () => editor.selectTiles(PaletteUsageSelection.Used),
        },
        {
          label: tUi("ui.palette.unused.tiles"),
          disabled: !editor.canSelectTiles,
          onSelect: () => editor.selectTiles(PaletteUsageSelection.Unused),
        },
      ],
    },
    {
      label: tUi("ui.palette.small.size"),
      mnemonic: "s",
      separator: true,
      checked: editor.boxSize === PaletteEntrySize.Small,
      onSelect: () => editor.setBoxSize(PaletteEntrySize.Small),
    },
    {
      label: tUi("ui.palette.medium.size"),
      mnemonic: "m",
      checked: editor.boxSize === PaletteEntrySize.Medium,
      onSelect: () => editor.setBoxSize(PaletteEntrySize.Medium),
    },
    {
      label: tUi("ui.palette.large.size"),
      mnemonic: "l",
      checked: editor.boxSize === PaletteEntrySize.Large,
      onSelect: () => editor.setBoxSize(PaletteEntrySize.Large),
    },
    {
      label: tUi("ui.palette.tint.shade.tone"),
      separator: true,
      checked: editor.selectorMode === PaletteColorSelectorMode.TintShadeTone,
      onSelect: () => editor.setSelectorMode(PaletteColorSelectorMode.TintShadeTone),
    },
    {
      label: tUi("ui.palette.color.spectrum"),
      checked: editor.selectorMode === PaletteColorSelectorMode.Spectrum,
      onSelect: () => editor.setSelectorMode(PaletteColorSelectorMode.Spectrum),
    },
    {
      label: tUi("ui.palette.rgb.color.wheel"),
      checked: editor.selectorMode === PaletteColorSelectorMode.RgbWheel,
      onSelect: () => editor.setSelectorMode(PaletteColorSelectorMode.RgbWheel),
    },
    {
      label: tUi("ui.palette.ryb.color.wheel"),
      checked: editor.selectorMode === PaletteColorSelectorMode.RybWheel,
      onSelect: () => editor.setSelectorMode(PaletteColorSelectorMode.RybWheel),
    },
    {
      label: tUi("ui.palette.normal.map.color.wheel"),
      checked: editor.selectorMode === PaletteColorSelectorMode.NormalMapWheel,
      onSelect: () => editor.setSelectorMode(PaletteColorSelectorMode.NormalMapWheel),
    },
    {
      label: tUi("ui.palette.load"),
      mnemonic: "o",
      separator: true,
      disabled: busy,
      onSelect: () => picker.current?.click(),
    },
    {
      label: "Load Default Palette",
      onSelect: () => attempt(() => editor.applyPalette(loadDefaultEditorPalette())),
    },
    {
      label: tUi("ui.palette.menu.save"),
      mnemonic: "a",
      disabled: !editor.canSavePalette || busy,
      onSelect: () => openSave(false),
    },
    {
      label: "Save Palette as Preset",
      disabled: !editor.canSavePalette || busy,
      onSelect: () => openSave(true),
    },
    {
      label: "Save Palette as Default",
      onSelect: () => attempt(editor.saveAsDefault),
    },
    {
      label: tUi("ui.palette.new.from.sprite"),
      separator: true,
      disabled: !editor.hasDocument,
      onSelect: () => {
        setGeneration(editor.initialGenerationDraft());
        setDialog(PaletteDialog.Generate);
      },
    },
  ];
  return (
    <>
      <PalettePresetPopup
        sceneBounds={sceneBounds}
        translate={tUiSource}
        hasDocument={true}
        choices={choices}
        activePalette={editor.colors}
        onLoad={(colors) => attempt(() => editor.applyPalette(colors))}
        onRefresh={() => setPresets(listSavedPalettePresets())}
      />
      <Menu
        label="Palette options"
        items={items}
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
        accept=".act,.col,.gpl,.hex,.pal,.ase,.aseprite,.bmp,.pcx,.tga,.ico,.fli,.flc,image/*"
        hidden
        disabled={busy}
        aria-label={tUi("ui.load.palette.file")}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void load(file);
        }}
      />
      <PaletteGenerationDialog
        open={dialog === PaletteDialog.Generate}
        value={generation}
        onChange={setGeneration}
        paletteCount={editor.colors.length}
        selectedCount={editor.selectedColors.length}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onGenerate={() =>
          attempt(() => {
            if (editor.generatePalette(generation)) setDialog(null);
          })
        }
      />
      <FormDialog
        open={busy && dialog === null}
        onOpenChange={(open) => {
          if (!open) {
            request.current++;
            setBusy(false);
          }
        }}
        title="Load Palette"
        message={tUi("ui.palette.loading")}
        fields={[]}
        actions={[
          {
            label: "Cancel",
            onClick: () => {
              request.current++;
              setBusy(false);
            },
          },
        ]}
        width={300}
      />
      <FormDialog
        open={dialog === PaletteDialog.Size}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title="Palette Size"
        selectInitialInput
        fields={[
          {
            key: "size",
            label: tUi("ui.palette.number.of.colors"),
            type: "text",
            value: size,
            onChange: setSize,
          },
        ]}
        actions={[
          {
            label: "OK",
            disabled: !editor.hasDocument || paletteSizeValue(size) === null,
            onClick: () =>
              attempt(() => {
                if (editor.resizePalette(size)) setDialog(null);
              }),
          },
          { label: "Cancel", onClick: () => setDialog(null) },
        ]}
        width={320}
      />
      <FormDialog
        open={dialog === PaletteDialog.Save || dialog === PaletteDialog.Preset}
        title={dialog === PaletteDialog.Preset ? "Save Palette as Preset" : "Save Palette"}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
        fields={[
          {
            key: "filename",
            label: "File name:",
            type: "text",
            value: filename,
            disabled: busy,
            onChange: setFilename,
          },
          {
            key: "format",
            label: tUi("ui.save.format"),
            type: "select",
            value: format,
            disabled: busy,
            options: PALETTE_EXPORT_FORMATS.map((item) => ({
              label: item.description,
              value: item.extension,
            })),
            onChange: (value) => {
              setFormat(value as PaletteExportFormat);
              setFilename((name) => name.replace(/\.[^./]+$/, "") + `.${value}`);
            },
          },
        ]}
        actions={[
          { label: "Save", disabled: busy || !filename.trim(), onClick: () => void save() },
          { label: "Cancel", disabled: busy, onClick: () => setDialog(null) },
        ]}
        width={420}
      />
      <Alert
        open={Boolean(error)}
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
