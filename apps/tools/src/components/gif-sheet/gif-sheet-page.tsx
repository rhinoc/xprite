import { useSyncExternalStore } from "react";

import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolDetails } from "$/components/shared/tool-details";
import { ToolField, ToolGroup } from "$/components/shared/tool-group";
import { ToolHelp } from "$/components/shared/tool-help";
import {
  ToolCanvasPane,
  ToolListPane,
  ToolResultWindow,
} from "$/components/shared/tool-result-window";
import { ToolZoomControl } from "$/components/shared/tool-zoom-control";
import {
  GifSheetDownload,
  GifSheetLayout,
  GifSheetStatus,
  type GifSheetManager,
} from "$/managers/gif-sheet/gif-sheet-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { GIF_SHEET_TOOL } from "$/managers/tools/tool-catalog";
import { GIF_SHEET_HELP, GifSheetHelpSection } from "@xprite/growth-content/tools";
import { Checkbox, Combobox, Input } from "@xprite/ui";

const ENTRY_WIDTH = 40;
const LAYOUT_WIDTH = 94;
const MAX_PADDING = 4096;
const MIN_COUNT = 1;

export function GifSheetPage({ manager }: { manager: GifSheetManager }) {
  const t = useToolTranslation();
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  const busy = snapshot.status === GifSheetStatus.Loading || snapshot.openingEditor;
  const loaded = snapshot.status === GifSheetStatus.Ready;
  const pixels = snapshot.pixels;
  const settings = snapshot.settings;
  const grid =
    settings.layout === GifSheetLayout.Rows || settings.layout === GifSheetLayout.Columns;
  const numeric = (key: "count" | "borderPadding" | "shapePadding", label: string, max: number) => (
    <ToolField label={t(`${label}:`)}>
      <Input
        pixelWidth={ENTRY_WIDTH}
        aria-label={t(label)}
        inputMode="numeric"
        min={key === "count" ? MIN_COUNT : 0}
        max={max}
        step={MIN_COUNT}
        key={`${snapshot.identity}:${snapshot.settingsRevision}:${key}`}
        value={String(settings[key])}
        disabled={!loaded}
        onCommit={(value) => manager.changeSettings({ [key]: Number(value) })}
      />
    </ToolField>
  );
  const outputDisabled = !loaded || !pixels || snapshot.downloading || busy;
  return (
    <FileToolShell
      tool={GIF_SHEET_TOOL}
      help={<ToolHelp id={GifSheetHelpSection.Overview} content={GIF_SHEET_HELP} />}
      filename={snapshot.name}
      busy={busy}
      ready={loaded}
      error={snapshot.error}
      onOpen={(file) => manager.open(file)}
      onExample={() => manager.openExample()}
      onReset={() => manager.clear()}
      flow={{
        exportDisabled: outputDisabled,
        editMore: { run: () => void manager.openEditor() },
        adjust: (
          <>
            <ToolGroup title={t("Sheet layout")}>
              <ToolField label={t("Layout:")}>
                <Combobox
                  pixelWidth={LAYOUT_WIDTH}
                  aria-label={t("Sheet type")}
                  value={settings.layout}
                  disabled={!loaded}
                  options={[
                    { value: GifSheetLayout.Rows, label: t("By rows") },
                    { value: GifSheetLayout.Columns, label: t("By columns") },
                    { value: GifSheetLayout.Horizontal, label: t("Horizontal") },
                    { value: GifSheetLayout.Vertical, label: t("Vertical") },
                  ]}
                  onValueChange={(layout) =>
                    manager.changeSettings({ layout: layout as GifSheetLayout })
                  }
                />
              </ToolField>
              {grid &&
                numeric(
                  "count",
                  settings.layout === GifSheetLayout.Columns ? "Rows" : "Columns",
                  Math.max(MIN_COUNT, snapshot.frames),
                )}
            </ToolGroup>
            <ToolGroup title={t("Spacing")}>
              {numeric("borderPadding", "Border padding", MAX_PADDING)}
              {numeric("shapePadding", "Frame spacing", MAX_PADDING)}
              <Checkbox
                label={t("Power of two")}
                title={t("Round sheet dimensions up without scaling frames")}
                checked={settings.powerOfTwo}
                disabled={!loaded}
                onCheckedChange={(powerOfTwo) => manager.changeSettings({ powerOfTwo })}
              />
            </ToolGroup>
          </>
        ),
        exportFormats: [
          {
            id: "png",
            label: t("Export sprite sheet (.png)"),
            disabled: outputDisabled,
            run: () => void manager.download(GifSheetDownload.Png),
          },
          {
            id: "json",
            label: t("Export frame data (.json)"),
            disabled: outputDisabled,
            run: () => void manager.download(GifSheetDownload.Json),
          },
        ],
      }}
    >
      {loaded && (
        <ToolResultWindow
          title={snapshot.name}
          tabs={[
            {
              id: "sheet",
              label: t("Sprite sheet"),
              content: (
                <ToolCanvasPane
                  controls={<ToolZoomControl navigation={manager.viewport} />}
                  status={pixels ? `${pixels.width} × ${pixels.height} px` : undefined}
                >
                  {pixels && (
                    <ToolCanvasPreview
                      navigation={manager.viewport}
                      identity={snapshot.identity}
                      pixels={pixels}
                      label={t(
                        "Sprite sheet preview. Drag to pan, scroll to zoom, double-click to fit.",
                      )}
                    />
                  )}
                </ToolCanvasPane>
              ),
            },
            {
              id: "details",
              label: t("Details"),
              content: (
                <ToolListPane>
                  <ToolDetails
                    rows={[
                      [t("Frames"), String(snapshot.frames)],
                      [t("Frame size"), `${snapshot.frameWidth} × ${snapshot.frameHeight} px`],
                      ...(pixels
                        ? ([[t("Sheet size"), `${pixels.width} × ${pixels.height} px`]] as const)
                        : []),
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
