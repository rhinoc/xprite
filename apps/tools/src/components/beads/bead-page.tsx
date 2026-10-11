import { useSyncExternalStore } from "react";

import { BeadMaterials } from "$/components/beads/bead-materials";
import { BeadSettings } from "$/components/beads/bead-settings";
import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolZoomControl } from "$/components/shared/tool-zoom-control";
import { BeadPreviewMode, type BeadToolManager } from "$/managers/beads/bead-tool-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { BEADS_TOOL } from "$/managers/tools/tool-catalog";
import {
  Panel,
  PanelVariant,
  ContentLayout,
  ContentPadding,
  ControlFlow,
  Field,
  FieldLayout,
  Combobox,
  Button,
  Text,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/beads/beads.module.css";

const PREVIEW_MODE_WIDTH = 124;
const BOARD_SELECT_WIDTH = 160;
const PREVIEW_MODES = [
  { value: BeadPreviewMode.Board, label: "Board preview" },
  { value: BeadPreviewMode.Overview, label: "Pattern overview" },
  { value: BeadPreviewMode.Source, label: "Source image" },
];

export function BeadPage({ manager }: { manager: BeadToolManager }) {
  const t = useToolTranslation();
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const busy = state.loading || state.downloading;
  const outputDisabled = busy || state.pending || !state.grid || !state.outputName.trim();
  const pngDisabled = outputDisabled || !!state.pngError;
  return (
    <FileToolShell
      tool={BEADS_TOOL}
      filename={state.name}
      ready={!!state.source}
      busy={busy}
      processing={busy || state.pending}
      error={state.error}
      onOpen={manager.open}
      onExample={manager.openExample}
      fileItems={[
        {
          label: t("Download PNG"),
          disabled: pngDisabled,
          onSelect: () => void manager.downloadPng(),
        },
        {
          label: t("Download PDF"),
          disabled: outputDisabled,
          onSelect: () => void manager.downloadPdf(),
        },
      ]}
    >
      {state.source && (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <BeadSettings manager={manager} state={state} />
            <BeadMaterials state={state} />
          </aside>
          <Panel
            variant={PanelVariant.Document}
            emphasized
            title={t("Bead chart")}
            contentLayout={ContentLayout.Fill}
            contentPadding={ContentPadding.Compact}
            className={styles.previewPanel}
            data-ui-window-priority="primary"
          >
            <div className={styles.previewContent}>
              <ControlFlow className={styles.toolbar}>
                <Field label={t("Preview")} layout={FieldLayout.Inline}>
                  <Combobox
                    pixelWidth={PREVIEW_MODE_WIDTH}
                    aria-label={t("Preview")}
                    value={state.mode}
                    options={PREVIEW_MODES.map((item) => ({ ...item, label: t(item.label) }))}
                    disabled={busy || state.pending}
                    onValueChange={(value) => manager.setMode(value as BeadPreviewMode)}
                  />
                </Field>
                {state.mode === BeadPreviewMode.Board && (
                  <Field label={t("Board")} layout={FieldLayout.Inline}>
                    <Combobox
                      pixelWidth={BOARD_SELECT_WIDTH}
                      aria-label={t("Preview board")}
                      value={String(state.selected)}
                      disabled={busy || state.pending}
                      options={state.boards.map((board, index) => ({
                        value: String(index),
                        label: t(`Row ${board.row + 1}, column ${board.column + 1}`),
                      }))}
                      onValueChange={(value) => manager.selectBoard(Number(value))}
                    />
                  </Field>
                )}
                <ToolZoomControl navigation={manager.navigation} />
              </ControlFlow>
              <div className={styles.stage}>
                {state.preview && (
                  <ToolCanvasPreview
                    navigation={manager.navigation}
                    identity={state.identity}
                    pixels={state.preview}
                    label="Bead chart preview"
                    onPixelSelect={
                      state.mode === BeadPreviewMode.Overview ? manager.selectAt : undefined
                    }
                  />
                )}
              </div>
              <ControlFlow className={styles.actions}>
                <Text variant={TextVariant.Reading} wrap>
                  {t(
                    state.pending
                      ? "Preparing preview…"
                      : (state.pngError ??
                          (state.mode === BeadPreviewMode.Overview
                            ? "Click the overview to inspect a board."
                            : "PDF includes an overview, separate boards and a material list.")),
                  )}
                </Text>
                <Button
                  slots={{}}
                  text={t("Download PNG")}
                  disabled={pngDisabled}
                  onClick={() => void manager.downloadPng()}
                />
                <Button
                  slots={{}}
                  text={t("Download PDF")}
                  disabled={outputDisabled}
                  onClick={() => void manager.downloadPdf()}
                />
              </ControlFlow>
            </div>
          </Panel>
        </div>
      )}
    </FileToolShell>
  );
}
