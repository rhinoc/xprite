import { useState, useSyncExternalStore } from "react";

import { AnimalCrossingGroundView } from "$/components/animal-crossing/animal-crossing-ground";
import { AnimalCrossingOutput } from "$/components/animal-crossing/animal-crossing-output";
import { AnimalCrossingSettingsPanel } from "$/components/animal-crossing/animal-crossing-settings";
import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import {
  AnimalCrossingLayout,
  type AnimalCrossingManager,
} from "$/managers/animal-crossing/animal-crossing-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { ANIMAL_CROSSING_TOOL } from "$/managers/tools/tool-catalog";
import {
  ContentLayout,
  PanelWindowChrome,
  SurfaceTone,
  StatusBar,
  StatusBarPlacement,
  Text,
  TextVariant,
  TextTone,
  Panel,
  PanelVariant,
  PanelWindowKind,
  Button,
  ButtonAppearance,
  Checkbox,
  Combobox,
  ControlFlow,
  ControlFlowVariant,
} from "@xprite/ui";

import styles from "$/components/animal-crossing/animal-crossing.module.css";
const ZOOM_WIDTH = 70;
const ZOOM_VALUES = [0, 1, 2, 4, 8, 12, 16];
const FIT = 0;
const PERCENT = 100;
const FIRST_COORDINATE = 1;
enum AnimalCrossingPreview {
  Original = "original",
  Converted = "converted",
}
export function AnimalCrossingPage({ manager }: { manager: AnimalCrossingManager }) {
  const t = useToolTranslation();

  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  const view = useSyncExternalStore(
    manager.viewport.subscribe,
    manager.viewport.getSnapshot,
    manager.viewport.getSnapshot,
  );
  const [preview, setPreview] = useState(AnimalCrossingPreview.Original);
  const [showGrid, setShowGrid] = useState(true);
  const { source, result } = snapshot;
  const busy = snapshot.loading || snapshot.downloading;
  const converted = !!result && preview === AnimalCrossingPreview.Converted;
  const pixels = converted ? result!.pixels : source;
  const grid = manager.getGrid(converted);
  const tiled = snapshot.layout === AnimalCrossingLayout.Tiles && !!grid;
  const zoom = view.fit ? FIT : view.zoom;
  const zooms = ZOOM_VALUES.includes(zoom) ? ZOOM_VALUES : [...ZOOM_VALUES, zoom];
  return (
    <FileToolShell
      tool={ANIMAL_CROSSING_TOOL}
      scrollWorkspace
      filename={snapshot.name}
      ready={!!source}
      busy={busy}
      error={snapshot.error}
      onOpen={(file) => manager.open(file)}
      onExample={() => manager.openExample()}
      fileItems={[
        {
          label: t("Download QR PNG"),
          disabled: !result || busy,
          onSelect: () => void manager.downloadQr(),
        },
      ]}
    >
      {source && pixels && (
        <div
          className={`${styles.layout} ${snapshot.layout === AnimalCrossingLayout.Single ? styles.singleLayout : ""}`}
        >
          <AnimalCrossingSettingsPanel
            key={snapshot.identity}
            manager={manager}
            snapshot={snapshot}
          />
          <Panel
            windowChrome={PanelWindowChrome.Emphasized}
            contentLayout={ContentLayout.Fill}
            variant={PanelVariant.Window}
            title={snapshot.name}
            className={styles.previewPanel}
            data-ui-window-priority="primary"
            aria-label={t(snapshot.importedQr ? "Imported design" : "Sprite sheet")}
          >
            <StatusBar placement={StatusBarPlacement.Header}>
              <Text variant={TextVariant.Reading}>
                {t(snapshot.importedQr ? "Imported design" : "Sprite sheet")}
              </Text>
              <Text variant={TextVariant.Reading} tone={TextTone.Muted}>
                {t(`${pixels.width} × ${pixels.height} px`)}
              </Text>
            </StatusBar>
            <div className={styles.previewContent}>
              <ControlFlow variant={ControlFlowVariant.Toolbar} className={styles.previewToolbar}>
                {result && (
                  <>
                    <Button
                      slots={{}}
                      text={t("Original")}
                      selected={preview === AnimalCrossingPreview.Original}
                      onClick={() => setPreview(AnimalCrossingPreview.Original)}
                    />
                    <Button
                      slots={{}}
                      text={t("Converted")}
                      selected={preview === AnimalCrossingPreview.Converted}
                      onClick={() => setPreview(AnimalCrossingPreview.Converted)}
                    />
                  </>
                )}
                <Combobox
                  aria-label={t("Preview zoom")}
                  pixelWidth={ZOOM_WIDTH}
                  value={String(zoom)}
                  options={zooms.map((value) => ({
                    value: String(value),
                    label: value === FIT ? "Fit" : `${Math.round(value * PERCENT)}%`,
                    disabled: value !== FIT && !manager.viewport.canZoom(value),
                  }))}
                  onValueChange={(value) =>
                    Number(value) === FIT
                      ? manager.viewport.fit()
                      : manager.viewport.setZoom(Number(value))
                  }
                />
                {tiled && (
                  <Checkbox
                    label={t("Tile grid")}
                    checked={showGrid}
                    onCheckedChange={setShowGrid}
                  />
                )}
                {result && (
                  <Button
                    slots={{}}
                    text={t("Preview")}
                    selected={snapshot.previewOpen}
                    aria-expanded={snapshot.previewOpen}
                    onClick={() => manager.setPreviewOpen(!snapshot.previewOpen)}
                  />
                )}
              </ControlFlow>
              <div className={styles.previewStage}>
                <ToolCanvasPreview
                  navigation={manager.viewport}
                  identity={snapshot.identity}
                  pixels={pixels}
                  label={t("Pattern preview. Drag to pan, scroll to zoom, double-click to fit.")}
                  onPixelSelect={
                    tiled && result && !busy
                      ? (point) => {
                          const index = grid!.cells.findIndex(
                            (cell) =>
                              point.x >= cell.x &&
                              point.x < cell.x + cell.width &&
                              point.y >= cell.y &&
                              point.y < cell.y + cell.height,
                          );
                          if (index >= 0) manager.select(index);
                        }
                      : undefined
                  }
                  overlay={
                    tiled && (showGrid || result)
                      ? (current) => (
                          <div className={styles.gridOverlay}>
                            {grid!.cells.map((cell, index) => (
                              <Button
                                slots={{}}
                                appearance={ButtonAppearance.Quiet}
                                key={index}
                                className={`${styles.gridCell} ${showGrid ? styles.cellBorder : ""} ${result && index === snapshot.selected ? styles.selectedCell : ""}`}
                                aria-label={t(
                                  `Select row ${Math.floor(index / grid!.columns) + FIRST_COORDINATE}, column ${(index % grid!.columns) + FIRST_COORDINATE}`,
                                )}
                                aria-pressed={!!result && index === snapshot.selected}
                                disabled={!result || busy}
                                onClick={(event) => {
                                  if (event.detail === 0) manager.select(index);
                                }}
                                style={{
                                  position: "absolute",
                                  left: current.origin.x + cell.x * current.zoom,
                                  top: current.origin.y + cell.y * current.zoom,
                                  width: cell.width * current.zoom,
                                  height: cell.height * current.zoom,
                                }}
                              />
                            ))}
                          </div>
                        )
                      : undefined
                  }
                />
              </div>
            </div>
          </Panel>
          <div className={styles.sideColumn} data-ui-desktop-layer>
            {result && snapshot.previewOpen && (
              <Panel
                windowChrome={PanelWindowChrome.Emphasized}
                tone={SurfaceTone.Warning}
                variant={PanelVariant.Window}
                title={t("Island preview")}
                windowKind={PanelWindowKind.Utility}
                collapsible
                className={styles.miniPreviewPanel}
                aria-label={t("Island preview")}
              >
                <AnimalCrossingGroundView manager={manager.ground} />
              </Panel>
            )}
            <AnimalCrossingOutput manager={manager} snapshot={snapshot} />
          </div>
        </div>
      )}
    </FileToolShell>
  );
}
