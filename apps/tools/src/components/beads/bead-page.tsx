import { useMemo, useSyncExternalStore } from "react";

import { BeadMaterials } from "$/components/beads/bead-materials";
import { BeadPreviewGrid } from "$/components/beads/bead-preview-grid";
import { BeadSettings, BeadSourceSettings } from "$/components/beads/bead-settings";
import { PixelationCompare } from "$/components/pixelation/pixelation-compare";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolResultWindow } from "$/components/shared/tool-result-window";
import { formatBeadFailure } from "$/managers/beads/bead-failure";
import type {
  BeadToolManager,
  BeadToolSettings,
  BeadToolSnapshot,
} from "$/managers/beads/bead-tool-manager";
import { beadDocumentLabels } from "$/managers/locale/bead-text";
import { useBeadText, useToolTranslation } from "$/managers/locale/tool-language";
import { BEADS_TOOL } from "$/managers/tools/tool-catalog";
import { PixelationMode, defaultPixelationSettings } from "@xprite/editor-core/import-export";
import { PixelationBaseControls, PixelationSlot } from "@xprite/editor-ui";

enum ResultTab {
  Pattern = "pattern",
  Materials = "materials",
}

const PERCENT = 100;
/** Beads map to a brand's colours, so the colour-limit controls of the shared panel do not apply. */
const HIDDEN_BASE_SLOTS: ReadonlySet<PixelationSlot> = new Set([
  PixelationSlot.LimitColors,
  PixelationSlot.Colors,
  PixelationSlot.Palette,
  PixelationSlot.SnapPalette,
  PixelationSlot.SnapColors,
]);

export function BeadPage({ manager }: { manager: BeadToolManager }) {
  const text = useBeadText();
  const labels = useMemo(() => beadDocumentLabels(text), [text]);
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const busy = state.loading || state.downloading;
  const outputDisabled = busy || state.pending || !state.grid || !state.outputName.trim();
  const status =
    state.progress !== null
      ? text("beads.download.progress", { percent: Math.round(state.progress * PERCENT) })
      : state.pending
        ? text("beads.preview.preparing")
        : (formatBeadFailure(text, state.pdfError ?? state.pngError) ?? "");
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
      onReset={() => manager.clear()}
      flow={{
        exportDisabled: outputDisabled,
        editMore: { run: () => void manager.edit(), disabled: outputDisabled },
        adjust: state.source && (
          <BeadAdjust manager={manager} state={state} source={state.source} />
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

/** The shared pixelation controls with the bead-specific groups (board, sampling) on top. */
function BeadAdjust({
  manager,
  state,
  source,
}: {
  manager: BeadToolManager;
  state: BeadToolSnapshot;
  source: NonNullable<BeadToolSnapshot["source"]>;
}) {
  const t = useToolTranslation();
  const busy = state.loading || state.downloading;
  const settings = useMemo(
    () => ({
      ...defaultPixelationSettings(source),
      ...state.settings,
      mode: state.detected?.reliable ? PixelationMode.RecoverGrid : PixelationMode.Convert,
    }),
    [source, state.settings, state.detected],
  );
  return (
    <PixelationBaseControls
      algorithm={state.settings.algorithm}
      grid={state.detected ?? undefined}
      settings={settings}
      sourceSize={source}
      busy={busy}
      hidden={HIDDEN_BASE_SLOTS}
      translate={(label, values) =>
        t(label).replace(/\{([^}]+)\}/g, (match, key: string) => String(values?.[key] ?? match))
      }
      onChange={({ colorPicker, prepass, lineGuide }) => {
        const patch: Partial<BeadToolSettings> = {};
        if (colorPicker !== undefined) patch.colorPicker = colorPicker;
        if (prepass !== undefined) patch.prepass = prepass;
        if (lineGuide !== undefined) patch.lineGuide = lineGuide;
        manager.changeSettings(patch);
      }}
      onAlgorithm={manager.changeAlgorithm}
    >
      <BeadSettings manager={manager} state={state} />
      <BeadSourceSettings manager={manager} state={state} />
    </PixelationBaseControls>
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
  const layout = state.previewLayout;
  return (
    <ToolResultWindow
      title={text("beads.pattern")}
      tabs={[
        {
          id: ResultTab.Pattern,
          label: text("beads.pattern"),
          content: state.source && (
            <PixelationCompare
              navigation={manager.navigation}
              identity={state.identity}
              source={state.source}
              result={state.preview}
              preparing={state.loading || state.pending}
              resultName={text("beads.pattern")}
              resultImageLabel={text("beads.preview.label")}
              status={status || undefined}
              resultOverlay={
                layout ? (size) => <BeadPreviewGrid layout={layout} size={size} /> : undefined
              }
            />
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
