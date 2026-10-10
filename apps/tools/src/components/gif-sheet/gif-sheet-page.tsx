import { useSyncExternalStore } from "react";

import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import {
  GifSheetDownload,
  GifSheetLayout,
  GifSheetStatus,
  type GifSheetManager,
} from "$/managers/gif-sheet/gif-sheet-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { GIF_SHEET_TOOL } from "$/managers/tools/tool-catalog";
import {
  ContentLayout,
  PanelWindowChrome,
  SurfaceTone,
  Field,
  FieldLayout,
  Text,
  TextVariant,
  TextTone,
  Checkbox,
  Combobox,
  ControlFlow,
  ControlFlowVariant,
  Panel,
  PanelVariant,
  PanelWindowKind,
  Input,
} from "@xprite/ui";

import styles from "$/components/gif-sheet/gif-sheet.module.css";
import shell from "$/components/shared/tool-frame.module.css";

const ENTRY_WIDTH = 40;
const LAYOUT_WIDTH = 94;
const ZOOM_WIDTH = 72;
const FIT_ZOOM = 0;
const ZOOM_VALUES = [FIT_ZOOM, 1, 2, 4];
const PERCENT = 100;
const MAX_PADDING = 4096;
const MIN_COUNT = 1;

export function GifSheetPage({ manager }: { manager: GifSheetManager }) {
  const t = useToolTranslation();

  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  const navigation = manager.viewport;
  const view = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  const busy = snapshot.status === GifSheetStatus.Loading;
  const loaded = snapshot.status === GifSheetStatus.Ready;
  const ready = !!snapshot.pixels;
  const settings = snapshot.settings;
  const zoom = view.fit ? FIT_ZOOM : view.zoom;
  const zooms = ZOOM_VALUES.includes(zoom) ? ZOOM_VALUES : [...ZOOM_VALUES, zoom];
  const grid =
    settings.layout === GifSheetLayout.Rows || settings.layout === GifSheetLayout.Columns;
  const numeric = (key: "count" | "borderPadding" | "shapePadding", label: string, max: number) => (
    <Field layout={FieldLayout.Spread} label={t(`${label}:`)}>
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
    </Field>
  );
  return (
    <FileToolShell
      tool={GIF_SHEET_TOOL}
      filename={snapshot.name}
      busy={busy}
      ready={ready}
      error={snapshot.error}
      onOpen={(file) => manager.open(file)}
      onExample={() => manager.openExample()}
      fileItems={[
        {
          label: t("Export sprite sheet (.png)"),
          disabled: !loaded || !ready || busy || snapshot.downloading,
          onSelect: () => void manager.download(GifSheetDownload.Png),
        },
        {
          label: t("Export frame data (.json)"),
          disabled: !loaded || !ready || busy || snapshot.downloading,
          onSelect: () => void manager.download(GifSheetDownload.Json),
        },
      ]}
    >
      {(ready || loaded || (busy && snapshot.name)) && (
        <div className={styles.layout}>
          {ready && (
            <Panel
              windowChrome={PanelWindowChrome.Emphasized}
              contentLayout={ContentLayout.Fill}
              variant={PanelVariant.Window}
              title={snapshot.name}
              className={styles.preview}
              data-ui-window-priority="primary"
            >
              <ControlFlow variant={ControlFlowVariant.Toolbar} className={shell.previewToolbar}>
                <Field layout={FieldLayout.Inline} label={t("Zoom:")}>
                  <Combobox
                    pixelWidth={ZOOM_WIDTH}
                    aria-label={t("Preview zoom")}
                    value={String(zoom)}
                    options={zooms.map((value) => ({
                      value: String(value),
                      label: value === FIT_ZOOM ? "Fit" : `${Math.round(value * PERCENT)}%`,
                      disabled: value !== FIT_ZOOM && !navigation.canZoom(value),
                    }))}
                    onValueChange={(value) =>
                      Number(value) === FIT_ZOOM
                        ? navigation.fit()
                        : navigation.setZoom(Number(value))
                    }
                  />
                </Field>
                <span
                  className={shell.previewDimensions}
                  title={t(`Source: ${snapshot.frameWidth} × ${snapshot.frameHeight} px`)}
                >
                  <Text variant={TextVariant.Reading} tone={TextTone.Muted}>
                    {t(
                      `${snapshot.pixels!.width} × ${snapshot.pixels!.height} px · ${snapshot.frames} frames`,
                    )}
                  </Text>
                </span>
              </ControlFlow>
              <ToolCanvasPreview
                navigation={navigation}
                identity={snapshot.identity}
                pixels={snapshot.pixels!}
                label={t("Sprite sheet preview. Drag to pan, scroll to zoom, double-click to fit.")}
              />
            </Panel>
          )}
          {(loaded || (busy && snapshot.name)) && (
            <aside className={styles.inspector} data-ui-desktop-layer>
              <Panel
                windowChrome={PanelWindowChrome.Emphasized}
                tone={SurfaceTone.Accent}
                variant={PanelVariant.Window}
                title={t("Sheet layout")}
                windowKind={PanelWindowKind.Utility}
                collapsible
              >
                <ControlFlow className={styles.settings} aria-label={t("Sheet settings")}>
                  <Field layout={FieldLayout.Spread} label={t("Layout:")}>
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
                  </Field>
                  {grid &&
                    numeric(
                      "count",
                      settings.layout === GifSheetLayout.Columns ? "Rows" : "Columns",
                      Math.max(MIN_COUNT, snapshot.frames),
                    )}
                  {numeric("borderPadding", "Border padding", MAX_PADDING)}
                  {numeric("shapePadding", "Frame spacing", MAX_PADDING)}
                  <Checkbox
                    label={t("Power of two")}
                    title={t("Round sheet dimensions up without scaling frames")}
                    checked={settings.powerOfTwo}
                    disabled={!loaded}
                    onCheckedChange={(powerOfTwo) => manager.changeSettings({ powerOfTwo })}
                  />
                </ControlFlow>
              </Panel>
            </aside>
          )}
        </div>
      )}
    </FileToolShell>
  );
}
