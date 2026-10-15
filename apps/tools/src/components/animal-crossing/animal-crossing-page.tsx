import { useEffect, useState, useSyncExternalStore } from "react";

import { AnimalCrossingGroundView } from "$/components/animal-crossing/animal-crossing-ground";
import { AnimalCrossingQrTab } from "$/components/animal-crossing/animal-crossing-output";
import { AnimalCrossingAdjust } from "$/components/animal-crossing/animal-crossing-settings";
import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolDetails } from "$/components/shared/tool-details";
import { ToolHelp } from "$/components/shared/tool-help";
import {
  ToolCanvasPane,
  ToolListPane,
  ToolResultWindow,
} from "$/components/shared/tool-result-window";
import { ToolZoomControl } from "$/components/shared/tool-zoom-control";
import {
  AnimalCrossingLayout,
  type AnimalCrossingManager,
} from "$/managers/animal-crossing/animal-crossing-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { ANIMAL_CROSSING_TOOL } from "$/managers/tools/tool-catalog";
import { AnimalCrossingGridOverlay } from "@xprite/editor-ui/animal-crossing";
import { ANIMAL_CROSSING_HELP, AnimalCrossingHelpSection } from "@xprite/growth-content/tools";
import { Button, Checkbox, ControlFlow } from "@xprite/ui";

import styles from "$/components/animal-crossing/animal-crossing.module.css";

const GRID_HANDLE_PADDING = 32;
enum AnimalCrossingPreview {
  Original = "original",
  Converted = "converted",
}
enum ResultTab {
  Pattern = "pattern",
  Qr = "qr",
  Ground = "ground",
  Details = "details",
}
export function AnimalCrossingPage({ manager }: { manager: AnimalCrossingManager }) {
  const t = useToolTranslation();
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  const [preview, setPreview] = useState(AnimalCrossingPreview.Original);
  const [showGrid, setShowGrid] = useState(true);
  const [editingGrid, setEditingGrid] = useState(false);
  const [tab, setTab] = useState<string>(ResultTab.Pattern);
  const { source, result } = snapshot;
  useEffect(() => {
    if (result) setPreview(AnimalCrossingPreview.Converted);
  }, [result]);
  useEffect(() => {
    manager.setPreviewOpen(tab === ResultTab.Ground);
  }, [manager, tab]);
  const groundOpen = !!result && tab === ResultTab.Ground;
  const busy = snapshot.loading || snapshot.downloading;
  const converted = !!result && preview === AnimalCrossingPreview.Converted;
  const pixels = converted ? result!.pixels : source;
  const grid = manager.getGrid(converted);
  const tiled = snapshot.layout === AnimalCrossingLayout.Tiles && !!grid;
  const outputDisabled = !result || busy || snapshot.pending;
  const designs = result?.patterns.length ?? 0;
  return (
    <FileToolShell
      tool={ANIMAL_CROSSING_TOOL}
      help={<ToolHelp id={AnimalCrossingHelpSection.Overview} content={ANIMAL_CROSSING_HELP} />}
      filename={snapshot.name}
      ready={!!source}
      busy={busy}
      processing={snapshot.pending}
      error={snapshot.error}
      onOpen={(file) => manager.open(file)}
      onExample={() => manager.openExample()}
      flow={{
        exportDisabled: outputDisabled,
        editMore: { run: () => void manager.edit() },
        adjust: snapshot.importedQr ? undefined : (
          <AnimalCrossingAdjust manager={manager} snapshot={snapshot} />
        ),
        exportFormats: [
          {
            id: "qr",
            label: t("QR code (.png)"),
            disabled: outputDisabled,
            run: () => void manager.downloadQr(),
          },
          ...(designs > 1
            ? [
                {
                  id: "all",
                  label: t("All designs (.zip)"),
                  disabled: outputDisabled,
                  run: () => void manager.download(),
                },
              ]
            : []),
        ],
      }}
    >
      {source && pixels && (
        <ToolResultWindow
          title={snapshot.name}
          tab={tab}
          onTabChange={setTab}
          tabs={[
            {
              id: ResultTab.Pattern,
              label: t("Pattern"),
              content: (
                <>
                  <ControlFlow className={styles.toolbar}>
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
                    {tiled && (
                      <Checkbox
                        label={t("Tile grid")}
                        checked={showGrid}
                        onCheckedChange={setShowGrid}
                      />
                    )}
                  </ControlFlow>
                  <ToolCanvasPane
                    controls={<ToolZoomControl navigation={manager.viewport} />}
                    status={`${pixels.width} × ${pixels.height} px`}
                  >
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
                  </ToolCanvasPane>
                </>
              ),
            },
            {
              id: ResultTab.Qr,
              label: t("QR code"),
              content: <AnimalCrossingQrTab manager={manager} snapshot={snapshot} />,
            },
            ...(result
              ? [
                  {
                    id: ResultTab.Ground,
                    label: t("3D preview"),
                    content: groundOpen ? (
                      <AnimalCrossingGroundView manager={manager.ground} />
                    ) : null,
                  },
                ]
              : []),
            {
              id: ResultTab.Details,
              label: t("Details"),
              content: (
                <ToolListPane>
                  <ToolDetails
                    rows={[
                      ...(snapshot.importedQr
                        ? ([
                            [t("Title"), snapshot.settings.title],
                            [t("Creator"), snapshot.settings.creator],
                            [t("Island / town"), snapshot.settings.town],
                          ] as const)
                        : []),
                      [t("Size"), `${pixels.width} × ${pixels.height} px`],
                      ...(designs > 0 ? ([[t("Designs"), String(designs)]] as const) : []),
                    ]}
                  />
                </ToolListPane>
              ),
            },
          ]}
        />
      )}
    </FileToolShell>
  );
}
