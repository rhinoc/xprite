import { useEffect, useState, useSyncExternalStore } from "react";

import { AnimalCrossingGroundView } from "$/components/animal-crossing/animal-crossing-ground";
import { AnimalCrossingOutput } from "$/components/animal-crossing/animal-crossing-output";
import { AnimalCrossingSettingsPanel } from "$/components/animal-crossing/animal-crossing-settings";
import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolHelp } from "$/components/shared/tool-help";
import {
  AnimalCrossingLayout,
  type AnimalCrossingManager,
} from "$/managers/animal-crossing/animal-crossing-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { ANIMAL_CROSSING_TOOL } from "$/managers/tools/tool-catalog";
import { AnimalCrossingGridOverlay } from "@xprite/editor-ui/animal-crossing";
import { ANIMAL_CROSSING_HELP, AnimalCrossingHelpSection } from "@xprite/growth-content/tools";
import {
  ContentLayout,
  Disclosure,
  StatusBar,
  Text,
  TextVariant,
  TextTone,
  Panel,
  PanelVariant,
  Button,
  Checkbox,
  Combobox,
  ControlFlow,
} from "@xprite/ui";

import styles from "$/components/animal-crossing/animal-crossing.module.css";
const ZOOM_WIDTH = 70;
const ZOOM_VALUES = [0, 1, 2, 4, 8, 12, 16];
const FIT = 0;
const PERCENT = 100;
const GRID_HANDLE_PADDING = 32;
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
  const [editingGrid, setEditingGrid] = useState(false);
  const { source, result } = snapshot;
  useEffect(() => {
    if (result) setPreview(AnimalCrossingPreview.Converted);
  }, [result]);
  const groundOpen = !!result && snapshot.previewOpen;
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
      help={<ToolHelp id={AnimalCrossingHelpSection.Overview} content={ANIMAL_CROSSING_HELP} />}
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
        ...(result && result.patterns.length > 1
          ? [
              {
                label: t(`Download all ${result.patterns.length} designs`),
                disabled: busy,
                onSelect: () => void manager.download(),
              },
            ]
          : []),
      ]}
    >
      {source && pixels && (
        <div
          className={`${styles.layout} ${snapshot.layout === AnimalCrossingLayout.Single ? styles.singleLayout : ""}`}
          data-ground-preview-open={groundOpen || undefined}
        >
          <AnimalCrossingSettingsPanel
            key={snapshot.identity}
            manager={manager}
            snapshot={snapshot}
          />
          <Panel
            emphasized
            contentLayout={ContentLayout.Fill}
            variant={PanelVariant.Document}
            title={snapshot.name}
            className={styles.previewPanel}
            data-ui-window-priority="primary"
            aria-label={t(snapshot.importedQr ? "Imported design" : "Sprite sheet")}
          >
            <div className={styles.previewContent}>
              {result && (
                <Disclosure
                  className={styles.groundDisclosure}
                  title={t("3D preview")}
                  open={groundOpen}
                  onToggle={(event) => {
                    if (event.currentTarget.open !== groundOpen)
                      manager.setPreviewOpen(event.currentTarget.open);
                  }}
                >
                  {groundOpen && <AnimalCrossingGroundView manager={manager.ground} />}
                </Disclosure>
              )}
              {!groundOpen && (
                <>
                  <ControlFlow toolbar className={styles.previewToolbar}>
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
                  </ControlFlow>
                  <div className={styles.previewStage}>
                    <ToolCanvasPreview
                      navigation={manager.viewport}
                      navigationEnabled={!editingGrid}
                      viewportPadding={tiled && !converted ? GRID_HANDLE_PADDING : 0}
                      identity={snapshot.identity}
                      pixels={pixels}
                      label={t(
                        "Pattern preview. Drag to pan, scroll to zoom, double-click to fit.",
                      )}
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
                        tiled && showGrid
                          ? (current) => (
                              <AnimalCrossingGridOverlay
                                source={pixels}
                                settings={snapshot.settings}
                                grid={grid}
                                selected={snapshot.selected}
                                view={current}
                                size={current.size}
                                disabled={busy || (converted && snapshot.pending)}
                                editable={!converted && !snapshot.importedQr}
                                navigating={current.pinching}
                                onSettingsChange={manager.changeSettings}
                                onSelect={manager.select}
                                onBeginEdit={() => {
                                  setEditingGrid(true);
                                  manager.beginGridEdit();
                                }}
                                onEndEdit={(cancel) => {
                                  setEditingGrid(false);
                                  manager.endGridEdit(cancel);
                                }}
                              />
                            )
                          : undefined
                      }
                    />
                  </div>
                </>
              )}
            </div>
            <StatusBar
              aria-label={t("Preview status")}
              trailing={
                <Text variant={TextVariant.Reading} tone={TextTone.Muted}>
                  {t(`${pixels.width} × ${pixels.height} px`)}
                </Text>
              }
            />
          </Panel>
          <div className={styles.sideColumn} data-ui-desktop-layer>
            <AnimalCrossingOutput manager={manager} snapshot={snapshot} />
          </div>
        </div>
      )}
    </FileToolShell>
  );
}
