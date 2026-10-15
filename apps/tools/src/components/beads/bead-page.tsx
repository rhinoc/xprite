import { useMemo, useSyncExternalStore } from "react";

import { BeadMaterials } from "$/components/beads/bead-materials";
import { BeadPreviewGrid } from "$/components/beads/bead-preview-grid";
import { BeadSettings, BeadSourceSettings } from "$/components/beads/bead-settings";
import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolCanvasPane, ToolResultWindow } from "$/components/shared/tool-result-window";
import { formatBeadFailure } from "$/managers/beads/bead-failure";
import {
  BeadPreviewMode,
  type BeadToolManager,
  type BeadToolSnapshot,
} from "$/managers/beads/bead-tool-manager";
import { beadDocumentLabels } from "$/managers/locale/bead-text";
import { useBeadText } from "$/managers/locale/tool-language";
import { BEADS_TOOL } from "$/managers/tools/tool-catalog";
import { ControlFlow, Button } from "@xprite/ui";

import styles from "$/components/beads/beads.module.css";

enum ResultTab {
  Pattern = "pattern",
  Materials = "materials",
}

const PERCENT = 100;
const ZOOM_STEP = 2;

export function BeadPage({ manager }: { manager: BeadToolManager }) {
  const text = useBeadText();
  const labels = useMemo(() => beadDocumentLabels(text), [text]);
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const busy = state.loading || state.downloading;
  const outputDisabled = busy || state.pending || !state.grid || !state.outputName.trim();
  const board = state.mode === BeadPreviewMode.Board ? state.boards[state.selected] : undefined;
  const status =
    state.progress !== null
      ? text("beads.download.progress", { percent: Math.round(state.progress * PERCENT) })
      : state.pending
        ? text("beads.preview.preparing")
        : (formatBeadFailure(text, state.pdfError ?? state.pngError) ??
          (board
            ? text("beads.board.coordinates", { row: board.row + 1, column: board.column + 1 })
            : ""));
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
      flow={{
        exportDisabled: outputDisabled,
        editMore: { run: () => void manager.edit(), disabled: outputDisabled },
        adjust: (
          <>
            <BeadSettings manager={manager} state={state} />
            <BeadSourceSettings manager={manager} state={state} />
          </>
        ),
        exportFormats: [
          {
            id: "png",
            label: text("beads.png"),
            disabled: outputDisabled || !!state.pngError,
            run: () => void manager.downloadPng(labels),
          },
          {
            id: "pdf",
            label: text("beads.pdf"),
            disabled: outputDisabled || !!state.pdfError,
            run: () => void manager.downloadPdf(labels),
          },
        ],
      }}
    >
      {state.source && <BeadStage manager={manager} state={state} status={status} />}
    </FileToolShell>
  );
}

function BeadStage({
  manager,
  state,
  status,
}: {
  manager: BeadToolManager;
  state: BeadToolSnapshot;
  status: string;
}) {
  const text = useBeadText();
  const view = useSyncExternalStore(
    manager.navigation.subscribe,
    manager.navigation.getSnapshot,
    manager.navigation.getSnapshot,
  );
  const fit = () => {
    // Fit returns from a zoomed board to the whole pattern, as in the editor dialog.
    if (state.mode !== BeadPreviewMode.Overview) manager.setMode(BeadPreviewMode.Overview);
    manager.navigation.fit();
  };
  return (
    <ToolResultWindow
      title={text("beads.pattern")}
      tabs={[
        {
          id: ResultTab.Pattern,
          label: text("beads.pattern"),
          content: (
            <ToolCanvasPane
              status={status}
              controls={
                <ControlFlow className={styles.boardRow}>
                  <Button
                    slots={{}}
                    text="-"
                    aria-label={text("beads.zoom.out")}
                    title={text("beads.zoom.out")}
                    onClick={() => manager.navigation.setZoom(view.zoom / ZOOM_STEP)}
                  />
                  <Button
                    slots={{}}
                    text="+"
                    aria-label={text("beads.zoom.in")}
                    title={text("beads.zoom.in")}
                    onClick={() => manager.navigation.setZoom(view.zoom * ZOOM_STEP)}
                  />
                  <Button slots={{}} text={text("beads.fit")} onClick={fit} />
                </ControlFlow>
              }
            >
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
                      ? (overlay) => (
                          <BeadPreviewGrid layout={state.previewLayout!} view={overlay} />
                        )
                      : undefined
                  }
                />
              )}
            </ToolCanvasPane>
          ),
        },
        {
          id: ResultTab.Materials,
          label: text("beads.materials"),
          content: <BeadMaterials manager={manager} state={state} />,
        },
      ]}
    />
  );
}
