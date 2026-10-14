import { useMemo, useSyncExternalStore } from "react";

import { BeadMaterials } from "$/components/beads/bead-materials";
import { BeadPreviewGrid } from "$/components/beads/bead-preview-grid";
import { BeadSettings } from "$/components/beads/bead-settings";
import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolZoomControl } from "$/components/shared/tool-zoom-control";
import { formatBeadFailure } from "$/managers/beads/bead-failure";
import { BeadPreviewMode, type BeadToolManager } from "$/managers/beads/bead-tool-manager";
import { beadDocumentLabels, type BeadTextKey } from "$/managers/locale/bead-text";
import { useBeadText } from "$/managers/locale/tool-language";
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
const PERCENT = 100;
const PREVIEW_MODES: readonly { value: BeadPreviewMode; label: BeadTextKey }[] = [
  { value: BeadPreviewMode.Board, label: "beads.preview.board" },
  { value: BeadPreviewMode.Overview, label: "beads.preview.overview" },
  { value: BeadPreviewMode.Source, label: "beads.preview.source" },
];

export function BeadPage({ manager }: { manager: BeadToolManager }) {
  const text = useBeadText();
  const labels = useMemo(() => beadDocumentLabels(text), [text]);
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const busy = state.loading || state.downloading;
  const outputDisabled = busy || state.pending || !state.grid || !state.outputName.trim();
  const pngDisabled = outputDisabled || !!state.pngError;
  const pdfDisabled = outputDisabled || !!state.pdfError;
  const downloadPng = () => void manager.downloadPng(labels);
  const downloadPdf = () => void manager.downloadPdf(labels);
  const status =
    state.progress !== null
      ? text("beads.download.progress", {
          percent: Math.round(state.progress * PERCENT),
        })
      : state.pending
        ? text("beads.preview.preparing")
        : (formatBeadFailure(text, state.pdfError ?? state.pngError) ??
          text(
            state.mode === BeadPreviewMode.Overview
              ? "beads.preview.overview.hint"
              : "beads.pdf.hint",
          ));
  return (
    <FileToolShell
      tool={BEADS_TOOL}
      filename={state.name}
      ready={!!state.source}
      busy={busy}
      processing={busy || state.pending}
      error={formatBeadFailure(text, state.error)}
      onOpen={manager.open}
      onExample={manager.openExample}
      fileItems={[
        {
          label: text("beads.download.png"),
          disabled: pngDisabled,
          onSelect: downloadPng,
        },
        {
          label: text("beads.download.pdf"),
          disabled: pdfDisabled,
          onSelect: downloadPdf,
        },
      ]}
    >
      {state.source && (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <BeadSettings manager={manager} state={state} />
            <BeadMaterials manager={manager} state={state} />
          </aside>
          <Panel
            variant={PanelVariant.Document}
            emphasized
            title={text("beads.chart")}
            contentLayout={ContentLayout.Fill}
            contentPadding={ContentPadding.Compact}
            className={styles.previewPanel}
            data-ui-window-priority="primary"
          >
            <div className={styles.previewContent}>
              <ControlFlow className={styles.toolbar}>
                <Field label={text("beads.preview")} layout={FieldLayout.Inline}>
                  <Combobox
                    pixelWidth={PREVIEW_MODE_WIDTH}
                    aria-label={text("beads.preview")}
                    value={state.mode}
                    options={PREVIEW_MODES.map((item) => ({
                      value: item.value,
                      label: text(item.label),
                    }))}
                    disabled={busy || state.pending}
                    onValueChange={(value) => manager.setMode(value as BeadPreviewMode)}
                  />
                </Field>
                {state.mode === BeadPreviewMode.Board && (
                  <Field label={text("beads.board")} layout={FieldLayout.Inline}>
                    <Combobox
                      pixelWidth={BOARD_SELECT_WIDTH}
                      aria-label={text("beads.board.select")}
                      value={String(state.selected)}
                      disabled={busy || state.pending}
                      options={state.boards.map((board, index) => ({
                        value: String(index),
                        label: text("beads.board.coordinates", {
                          row: board.row + 1,
                          column: board.column + 1,
                        }),
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
                    label={text("beads.preview.label")}
                    onPixelSelect={
                      state.mode === BeadPreviewMode.Overview ? manager.selectAt : undefined
                    }
                    overlay={
                      state.previewLayout
                        ? (view) => <BeadPreviewGrid layout={state.previewLayout!} view={view} />
                        : undefined
                    }
                  />
                )}
              </div>
              <ControlFlow className={styles.actions}>
                <Text variant={TextVariant.Reading} wrap>
                  {status}
                </Text>
                <Button
                  slots={{}}
                  text={text("beads.download.png")}
                  disabled={pngDisabled}
                  onClick={downloadPng}
                />
                <Button
                  slots={{}}
                  text={text("beads.download.pdf")}
                  disabled={pdfDisabled}
                  onClick={downloadPdf}
                />
              </ControlFlow>
            </div>
          </Panel>
        </div>
      )}
    </FileToolShell>
  );
}
