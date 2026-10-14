import { useEffect } from "react";

import { AnimalCrossingSourceGrid } from "$/components/dialogs/animal-crossing-dialog/source-grid";
import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { tUiSource, useUiLanguage, tUi } from "$/i18n";
import {
  useAnimalCrossingExport,
  type AnimalCrossingExportSource,
  type AnimalCrossingExportPort,
} from "$/managers/files/animal-crossing-export";
import type { AnimalCrossingExportOptions } from "$/managers/files/animal-crossing-export-options";
import { animalCrossingExportLayout } from "$/managers/files/policies/animal-crossing-export-geometry";
import { CanvasSurface, Text, TextVariant } from "@xprite/ui";

import styles from "$/components/dialogs/animal-crossing-dialog/animal-crossing-dialog.module.css";
const QR_VIEWPORT = { sceneWidth: 3, sceneHeight: 3, width: 1, height: 1 };
const PATTERN_VIEWPORT = { sceneWidth: 1, sceneHeight: 1, width: 4, height: 4 };
const PATTERN_CHECKER = {
  cellSize: 4,
  light: [192, 192, 192] as const,
  dark: [128, 128, 128] as const,
};
const NUMBER_FIELDS = [
  ["cellWidth", "Cell width", "cell"],
  ["cellHeight", "Cell height", "cell"],
  ["offsetX", "Start X", "offset"],
  ["offsetY", "Start Y", "offset"],
  ["spacingX", "Spacing X", "spacing"],
  ["spacingY", "Spacing Y", "spacing"],
] as const;
const TEXT_FIELDS = [
  ["title", "Pattern title"],
  ["creator", "Creator"],
  ["town", "Island / town"],
] as const;

export function AnimalCrossingDialog({
  active,
  source,
  port,
  onClose,
  onBusyChange,
  onExported,
  onLayoutSizeChange,
}: {
  active: boolean;
  source: AnimalCrossingExportSource;
  port: AnimalCrossingExportPort;
  onClose(): void;
  onBusyChange(busy: boolean): void;
  onExported(options: AnimalCrossingExportOptions): void;
  onLayoutSizeChange(size: { width: number; height: number }): void;
}) {
  useUiLanguage();
  const manager = useAnimalCrossingExport(source, port, onExported, active);
  useEffect(() => {
    onBusyChange(manager.busy);
  }, [manager.busy, onBusyChange]);
  const pattern = manager.result?.patterns[manager.selected];
  const ready = !!pattern && !!manager.qr;
  const geometry = animalCrossingExportLayout();
  const fields: FormField[] = [
    ...TEXT_FIELDS.map(([key, label]): FormField => ({
      key,
      label,
      type: "text",
      value: manager.settings[key],
      disabled: manager.busy,
      onChange: (value) => manager.changeSettings({ [key]: value }),
    })),
    ...NUMBER_FIELDS.map(([key, label, row]): FormField => ({
      key,
      label,
      row,
      type: "number",
      value: manager.settings[key],
      min: key.startsWith("cell") ? 1 : 0,
      step: 1,
      disabled: manager.busy,
      onChange: (value) => manager.changeSettings({ [key]: value }),
      onDraftChange: (draft) => {
        const value = Number(draft);
        if (
          draft.trim() &&
          Number.isSafeInteger(value) &&
          value >= (key.startsWith("cell") ? 1 : 0)
        )
          manager.changeSettings({ [key]: value });
      },
    })),
  ];
  return (
    <FormDialog
      open
      embedded
      title="Animal Crossing QR Codes"
      width={geometry.width}
      layout={geometry.layout}
      fields={fields}
      onLayoutSizeChange={onLayoutSizeChange}
      submitOnEnter={false}
      onOpenChange={(open) => {
        if (!open && !manager.busy) onClose();
      }}
      content={(client) => (
        <>
          <AnimalCrossingSourceGrid
            source={source}
            settings={manager.settings}
            grid={manager.grid}
            selected={manager.selected}
            bounds={geometry.grid}
            disabled={manager.busy}
            onSettingsChange={manager.changeSettings}
            onSelect={manager.select}
            onBeginEdit={manager.beginGridEdit}
            onEndEdit={manager.endGridEdit}
          />
          {ready && pattern && manager.qr && (
            <>
              <div
                className={styles.preview}
                style={{
                  visibility: manager.pending ? "hidden" : undefined,
                  left: geometry.preview.x,
                  top: geometry.preview.y,
                  width: geometry.preview.width,
                }}
              >
                <div className={styles.selectedPattern}>
                  <CanvasSurface
                    bounds={{
                      x: 0,
                      y: 0,
                      width: pattern.pixels.width,
                      height: pattern.pixels.height,
                    }}
                    viewport={PATTERN_VIEWPORT}
                    pixels={pattern.pixels}
                    checker={PATTERN_CHECKER}
                    aria-label={tUi("ui.animal.crossing.preview")}
                  />
                </div>
                <div className={styles.selectedQr}>
                  <CanvasSurface
                    bounds={{ x: 0, y: 0, width: manager.qr.width, height: manager.qr.height }}
                    viewport={QR_VIEWPORT}
                    pixels={manager.qr}
                    aria-label={tUi("ui.animal.crossing.qr")}
                  />
                </div>
              </div>
            </>
          )}
          {manager.pending && (
            <Text
              variant={TextVariant.Control}
              wrap
              bounds={{
                x: client.x + geometry.preview.x,
                y: client.y + geometry.preview.y,
                width: geometry.preview.width,
                height: 84,
              }}
              relativeTo={client}
              text={tUi("ui.animal.crossing.preview.updating")}
            />
          )}
          <div
            className={styles.help}
            style={{ left: 0, top: geometry.helpY, width: geometry.settingsWidth }}
          >
            <Text variant={TextVariant.Inline} wrap scale={2} lineHeight={22}>
              {manager.error
                ? tUiSource(manager.error)
                : `${tUi("ui.animal.crossing.grid.hint")}

${tUi("ui.animal.crossing.scan.short")}`}
            </Text>
          </div>
        </>
      )}
      actions={[
        {
          label: "Download current QR",
          disabled: !ready || manager.busy || manager.pending,
          onClick: () => void manager.downloadQr(),
        },
        {
          label: manager.busy ? "Exporting…" : "Download ZIP",
          disabled: !manager.result || manager.busy || manager.pending,
          onClick: () => void manager.download(),
        },
        { label: "Cancel", disabled: manager.busy, onClick: onClose },
      ]}
    />
  );
}
