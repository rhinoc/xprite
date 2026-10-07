import { EditorDialog } from "$/components/dialogs/overlay";
import { tUiSource, useUiLanguage } from "$/i18n";
import {
  useAnimalCrossingExport,
  type AnimalCrossingExportSource,
  type AnimalCrossingExportPort,
} from "$/managers/files/animal-crossing-export";
import {
  Button,
  CanvasSurface,
  Combobox,
  ControlFlow,
  Input,
  OverlayContentLayout,
  Text,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/dialogs/animal-crossing-dialog/animal-crossing-dialog.module.css";
const NUMBER_SIZE = { width: 44, height: 16 };
const TEXT_SIZE = { width: 100, height: 16 };
const QR_VIEWPORT = { sceneWidth: 3, sceneHeight: 3, width: 1, height: 1 };
const PATTERN_VIEWPORT = { sceneWidth: 1, sceneHeight: 1, width: 4, height: 4 };
const PATTERN_CHECKER = {
  cellSize: 4,
  light: [192, 192, 192] as const,
  dark: [128, 128, 128] as const,
};
const DIALOG_BOUNDS = { x: 0, y: 0, width: 740, height: 620 };
const NUMERIC_FIELDS = [
  ["cellWidth", "Cell width"],
  ["cellHeight", "Cell height"],
  ["offsetX", "Start X"],
  ["offsetY", "Start Y"],
  ["spacingX", "Spacing X"],
  ["spacingY", "Spacing Y"],
] as const;
const TEXT_FIELDS = [
  ["title", "Pattern title"],
  ["creator", "Creator"],
  ["town", "Island / town"],
] as const;
export function AnimalCrossingDialog({
  source,
  port,
  onClose,
}: {
  source: AnimalCrossingExportSource;
  port: AnimalCrossingExportPort;
  onClose(): void;
}) {
  useUiLanguage();
  const manager = useAnimalCrossingExport(source, port);
  const pattern = manager.result?.patterns[manager.selected];
  return (
    <EditorDialog
      open
      modal
      centerOnOpen
      constrainToViewport
      contentLayout={OverlayContentLayout.Flow}
      title={tUiSource("Animal Crossing QR Codes")}
      defaultBounds={DIALOG_BOUNDS}
      onOpenChange={(open) => {
        if (!open && !manager.busy) onClose();
      }}
    >
      <div className={styles.body}>
        <Text variant={TextVariant.Inline} wrap>
          {tUiSource(
            "Set the source cell size, start and spacing before generating. Each cell becomes one 32 × 32 design with a shared 15-color palette and transparency.",
          )}
        </Text>
        <ControlFlow className={styles.fields}>
          {TEXT_FIELDS.map(([key, label]) => (
            <div className={styles.field} key={key}>
              <Text variant={TextVariant.Control} text={tUiSource(label)} />
              <Input
                aria-label={tUiSource(label)}
                pixelSize={TEXT_SIZE}
                value={manager.settings[key]}
                disabled={manager.busy}
                onValueChange={(value) => manager.changeSettings({ [key]: value })}
              />
            </div>
          ))}
          {NUMERIC_FIELDS.map(([key, label]) => (
            <div className={styles.field} key={key}>
              <Text variant={TextVariant.Control} text={tUiSource(label)} />
              <Input
                aria-label={tUiSource(label)}
                pixelSize={NUMBER_SIZE}
                value={String(manager.settings[key])}
                inputMode="numeric"
                min={key.startsWith("cell") ? 1 : 0}
                step={1}
                disabled={manager.busy}
                onCommit={(value) => manager.changeSettings({ [key]: Number(value) })}
              />
            </div>
          ))}
        </ControlFlow>
        <Button
          text={tUiSource("Generate QR codes")}
          disabled={manager.busy}
          onClick={manager.generate}
        />
        {manager.result && pattern && manager.qr && (
          <>
            <Combobox
              aria-label={tUiSource("Design to scan")}
              pixelSize={TEXT_SIZE}
              value={String(manager.selected)}
              options={manager.result.patterns.map((pattern, index) => ({
                value: String(index),
                label: `${pattern.row + 1}, ${pattern.column + 1} · ${pattern.title}`,
              }))}
              onValueChange={(value) => manager.select(Number(value))}
            />
            <div className={styles.preview}>
              <CanvasSurface
                bounds={{ x: 0, y: 0, width: pattern.pixels.width, height: pattern.pixels.height }}
                viewport={PATTERN_VIEWPORT}
                pixels={pattern.pixels}
                checker={PATTERN_CHECKER}
                aria-label={tUiSource("Design preview")}
              />
              <CanvasSurface
                bounds={{ x: 0, y: 0, width: manager.qr.width, height: manager.qr.height }}
                viewport={QR_VIEWPORT}
                pixels={manager.qr}
                aria-label={tUiSource("Design QR code")}
              />
            </div>
            <Text
              variant={TextVariant.Inline}
              wrap
            >{`${manager.result.columns} × ${manager.result.rows} · ${tUiSource("Row, column")}: ${pattern.row + 1}, ${pattern.column + 1}`}</Text>
          </>
        )}
        <Text variant={TextVariant.Inline} wrap>
          {tUiSource(
            "Scan in Nintendo Switch App → NookLink → Designs, then download in the game's Custom Designs app before scanning the next tile. ZIP includes QR images, .acnl files and tile coordinates.",
          )}
        </Text>
        {manager.error && (
          <div role="alert">
            <Text variant={TextVariant.Inline} wrap>
              {tUiSource(manager.error)}
            </Text>
          </div>
        )}
        <ControlFlow className={styles.actions}>
          <Button
            text={tUiSource("Download current QR")}
            disabled={!manager.qr || manager.busy}
            onClick={() => void manager.downloadQr()}
          />
          <Button
            text={tUiSource(manager.busy ? "Exporting…" : "Download ZIP")}
            disabled={!manager.result || manager.busy}
            onClick={() => void manager.download()}
          />
          <Button text={tUiSource("Close")} disabled={manager.busy} onClick={onClose} />
        </ControlFlow>
      </div>
    </EditorDialog>
  );
}
