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
  Checkbox,
  Combobox,
  ControlFlow,
  ControlFlowVariant,
  ScrollArea,
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
          label: "Download QR PNG",
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
            aria-label={snapshot.importedQr ? "Imported design" : "Sprite sheet"}
          >
            <StatusBar placement={StatusBarPlacement.Header}>
              <Text variant={TextVariant.Reading}>
                {snapshot.importedQr ? "Imported design" : "Sprite sheet"}
              </Text>
              <Text
                variant={TextVariant.Reading}
                tone={TextTone.Muted}
              >{`${pixels.width} × ${pixels.height} px`}</Text>
            </StatusBar>
            <div className={styles.previewContent}>
              <ControlFlow variant={ControlFlowVariant.Toolbar} className={styles.previewToolbar}>
                {result && (
                  <>
                    <Button
                      slots={{}}
                      text="Original"
                      selected={preview === AnimalCrossingPreview.Original}
                      onClick={() => setPreview(AnimalCrossingPreview.Original)}
                    />
                    <Button
                      slots={{}}
                      text="Converted"
                      selected={preview === AnimalCrossingPreview.Converted}
                      onClick={() => setPreview(AnimalCrossingPreview.Converted)}
                    />
                  </>
                )}
                <Combobox
                  aria-label="Preview zoom"
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
                  <Checkbox label="Tile grid" checked={showGrid} onCheckedChange={setShowGrid} />
                )}
                {result && (
                  <Button
                    slots={{}}
                    text="Preview"
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
                  label="Pattern preview. Drag to pan, scroll to zoom, double-click to fit."
                  overlay={
                    tiled && showGrid
                      ? (current) => (
                          <div className={styles.gridOverlay} aria-hidden="true">
                            {grid!.cells.map((cell, index) => (
                              <div
                                key={index}
                                className={`${styles.gridCell} ${index === snapshot.selected ? styles.selectedCell : ""}`}
                                style={{
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
              {result && result.patterns.length > FIRST_COORDINATE && (
                <div className={styles.tileSelection}>
                  <Text
                    variant={TextVariant.Reading}
                  >{`${result.columns} × ${result.rows} tiles · select a tile for Preview and QR`}</Text>
                  <ScrollArea className={styles.tileScroll} aria-label="Design tiles">
                    <ControlFlow className={styles.tileButtons}>
                      {result.patterns.map((pattern, index) => (
                        <Button
                          slots={{}}
                          key={index}
                          text={`${pattern.row + FIRST_COORDINATE},${pattern.column + FIRST_COORDINATE}`}
                          aria-label={`Select row ${pattern.row + FIRST_COORDINATE}, column ${pattern.column + FIRST_COORDINATE}`}
                          selected={index === snapshot.selected}
                          disabled={busy}
                          onClick={() => manager.select(index)}
                        />
                      ))}
                    </ControlFlow>
                  </ScrollArea>
                </div>
              )}
              <div className={styles.previewHint}>
                {snapshot.example && (
                  <p className={styles.exampleCredit}>
                    ACNH Winding Cobblestone Path by{" "}
                    <a
                      href="https://aforestlife.com/2021/11/11/winding-cobblestone-path-from-bywater-shire-themed-island/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Amy · A Forest Life
                    </a>
                    {" · MA-0515-5045-1390. Reconstructed from the published preview."}
                  </p>
                )}
                <Text variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
                  {snapshot.importedQr
                    ? "Ready to export the original design."
                    : result
                      ? "QR export uses the New Leaf import palette. Check Converted for the exported colors."
                      : "Set the image layout, then generate designs. The grid shows the source area of each tile."}
                </Text>
              </div>
            </div>
          </Panel>
          <div className={styles.sideColumn} data-ui-desktop-layer>
            {result && snapshot.previewOpen && (
              <Panel
                windowChrome={PanelWindowChrome.Emphasized}
                tone={SurfaceTone.Warning}
                variant={PanelVariant.Window}
                title="Island preview"
                windowKind={PanelWindowKind.Utility}
                collapsible
                className={styles.miniPreviewPanel}
                aria-label="Island preview"
              >
                <StatusBar placement={StatusBarPlacement.Header}>
                  <Text
                    variant={TextVariant.Reading}
                    tone={TextTone.Muted}
                  >{`Tile ${result.patterns[snapshot.selected].row + FIRST_COORDINATE},${result.patterns[snapshot.selected].column + FIRST_COORDINATE}`}</Text>
                </StatusBar>
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
