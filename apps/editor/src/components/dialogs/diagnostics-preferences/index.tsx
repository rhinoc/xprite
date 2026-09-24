import { Fragment, useCallback, useEffect, useState } from "react";

import {
  PreferencesLabel,
  PreferencesCheckbox,
  usePreferencesDialogNarrowLayout,
} from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { currentUiLanguage, tUi, type UiMessageKey } from "$/i18n";
import { useDiagnosticsPort } from "$/managers/diagnostics/diagnostics-context";
import { useDiagnosticsReport } from "$/managers/diagnostics/diagnostics-report-context";
import {
  getTechnicalSupportRows,
  TechnicalCapability,
} from "$/managers/diagnostics/technical-support";
import {
  type DiagnosticRecord,
  type RuntimeCapabilitySnapshot,
} from "$/managers/ports/diagnostics";
import { Button, Divider, type SurfaceBounds } from "@xprite/ui";

const DIAGNOSTICS_PAGE_X = 358;
const DIAGNOSTICS_PAGE_WIDTH = 333;
const DIAGNOSTICS_LABEL_HEIGHT = 14;
const DIAGNOSTICS_BUTTON_HEIGHT = 17;
const TECHNICAL_SUPPORT_DIVIDER_HEIGHT = 11;
const TECHNICAL_SUPPORT_ROW_STEP = 16;
const TECHNICAL_SUPPORT_CHECKBOX_SIZE = 16;
const TECHNICAL_SUPPORT_FEATURE_WIDTH = 126;
const TECHNICAL_SUPPORT_COLUMN_GAP = 8;
const TECHNICAL_SUPPORT_STATUS_X =
  DIAGNOSTICS_PAGE_X + TECHNICAL_SUPPORT_FEATURE_WIDTH + TECHNICAL_SUPPORT_COLUMN_GAP;

const DIAGNOSTICS_LAYOUT = {
  narrow: {
    countY: 121,
    latestY: 141,
    exportY: 165,
    clearX: DIAGNOSTICS_PAGE_X,
    clearY: 185,
    buttonWidth: DIAGNOSTICS_PAGE_WIDTH,
    statusY: 205,
    supportDividerY: 224,
    supportStartY: 241,
    supportRowStep: TECHNICAL_SUPPORT_ROW_STEP,
  },
  desktop: {
    countY: 121,
    latestY: 141,
    exportY: 165,
    clearX: 514,
    clearY: 165,
    buttonWidth: 148,
    statusY: 186,
    supportDividerY: 204,
    supportStartY: 221,
    supportRowStep: TECHNICAL_SUPPORT_ROW_STEP,
  },
} as const;

const TECHNICAL_CAPABILITY_LABELS: Record<TechnicalCapability, UiMessageKey> = {
  [TechnicalCapability.OpenFilePicker]: "ui.diagnostics.support.open-picker",
  [TechnicalCapability.SaveFilePicker]: "ui.diagnostics.support.save-picker",
  [TechnicalCapability.Opfs]: "ui.diagnostics.support.opfs",
  [TechnicalCapability.IndexedDb]: "ui.diagnostics.support.indexeddb",
  [TechnicalCapability.Workers]: "ui.diagnostics.support.workers",
  [TechnicalCapability.CompressionStream]: "ui.diagnostics.support.compression-stream",
  [TechnicalCapability.OffscreenCanvas]: "ui.diagnostics.support.offscreen-canvas",
  [TechnicalCapability.ImageBitmap]: "ui.diagnostics.support.image-bitmap",
};

const EMPTY_RUNTIME_CAPABILITIES: RuntimeCapabilitySnapshot = {
  openFilePicker: false,
  saveFilePicker: false,
  opfs: false,
  indexedDb: false,
  workers: false,
  compressionStream: false,
  offscreenCanvas: false,
  imageBitmap: false,
};

export function DiagnosticsPreferences({
  box,
  client,
}: {
  box: (x: number, y: number, width: number, height: number) => SurfaceBounds;
  client: SurfaceBounds;
}) {
  const narrowLayout = usePreferencesDialogNarrowLayout();
  const diagnostics = useDiagnosticsPort();
  const reportViewer = useDiagnosticsReport();
  const [records, setRecords] = useState<readonly DiagnosticRecord[]>([]);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilitySnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setCapabilities(diagnostics.getRuntimeCapabilities());
      setRecords(await diagnostics.getRecent());
      setStatus("");
    } catch {
      setStatus(tUi("ui.diagnostics.read.failed"));
    } finally {
      setBusy(false);
    }
  }, [diagnostics]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exportLogs = async () => {
    setBusy(true);
    try {
      if (reportViewer) {
        await reportViewer.open();
        setStatus("");
      } else {
        const count = await diagnostics.exportLogs();
        setStatus(tUi("ui.diagnostics.export.complete", { count }));
      }
      setRecords(await diagnostics.getRecent());
    } catch {
      setStatus(tUi(reportViewer ? "ui.diagnostics.read.failed" : "ui.diagnostics.export.failed"));
    } finally {
      setBusy(false);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm(tUi("ui.diagnostics.clear.confirm"))) return;
    setBusy(true);
    try {
      await diagnostics.clear();
      setRecords([]);
      setStatus(tUi("ui.diagnostics.clear.complete"));
    } catch {
      setStatus(tUi("ui.diagnostics.clear.failed"));
    } finally {
      setBusy(false);
    }
  };

  const latest = records[0]
    ? new Intl.DateTimeFormat(currentUiLanguage(), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(records[0].timestamp)
    : tUi("ui.diagnostics.none");
  const layout = narrowLayout ? DIAGNOSTICS_LAYOUT.narrow : DIAGNOSTICS_LAYOUT.desktop;
  const supportRows = getTechnicalSupportRows(capabilities ?? EMPTY_RUNTIME_CAPABILITIES);

  return (
    <>
      <PreferencesLabel
        bounds={box(
          DIAGNOSTICS_PAGE_X,
          layout.countY,
          DIAGNOSTICS_PAGE_WIDTH,
          DIAGNOSTICS_LABEL_HEIGHT,
        )}
        relativeTo={client}
        text={tUi("ui.diagnostics.entry.count", { count: records.length })}
      />
      <PreferencesLabel
        bounds={box(
          DIAGNOSTICS_PAGE_X,
          layout.latestY,
          DIAGNOSTICS_PAGE_WIDTH,
          DIAGNOSTICS_LABEL_HEIGHT,
        )}
        relativeTo={client}
        text={tUi("ui.diagnostics.latest", { time: latest })}
      />
      <Button
        aria-label={tUi(
          reportViewer ? "ui.diagnostics.view.button" : "ui.diagnostics.export.button",
        )}
        text={tUi(reportViewer ? "ui.diagnostics.view.button" : "ui.diagnostics.export.button")}
        title={tUi(
          reportViewer ? "ui.diagnostics.view.description" : "ui.diagnostics.export.description",
        )}
        bounds={box(
          DIAGNOSTICS_PAGE_X,
          layout.exportY,
          layout.buttonWidth,
          DIAGNOSTICS_BUTTON_HEIGHT,
        )}
        relativeTo={client}
        disabled={busy}
        onClick={() => void exportLogs()}
      />
      <Button
        aria-label={tUi("ui.diagnostics.clear.button")}
        text={tUi("ui.diagnostics.clear.button")}
        bounds={box(layout.clearX, layout.clearY, layout.buttonWidth, DIAGNOSTICS_BUTTON_HEIGHT)}
        relativeTo={client}
        disabled={busy || records.length === 0}
        onClick={() => void clearLogs()}
      />
      <PreferencesLabel
        aria-live="polite"
        bounds={box(
          DIAGNOSTICS_PAGE_X,
          layout.statusY,
          DIAGNOSTICS_PAGE_WIDTH,
          DIAGNOSTICS_LABEL_HEIGHT,
        )}
        relativeTo={client}
        text={busy ? tUi("ui.diagnostics.loading") : status}
      />
      <Divider
        bounds={box(
          DIAGNOSTICS_PAGE_X,
          layout.supportDividerY,
          DIAGNOSTICS_PAGE_WIDTH,
          TECHNICAL_SUPPORT_DIVIDER_HEIGHT,
        )}
        relativeTo={client}
        text={tUi("ui.diagnostics.technical-support")}
      />
      {capabilities ? (
        supportRows.map((row, index) => {
          const y = layout.supportStartY + index * layout.supportRowStep;
          const feature = tUi(TECHNICAL_CAPABILITY_LABELS[row.capability]);
          const statusX = narrowLayout
            ? DIAGNOSTICS_PAGE_X + DIAGNOSTICS_PAGE_WIDTH - TECHNICAL_SUPPORT_CHECKBOX_SIZE
            : TECHNICAL_SUPPORT_STATUS_X;
          const featureWidth = statusX - DIAGNOSTICS_PAGE_X - TECHNICAL_SUPPORT_COLUMN_GAP;
          return (
            <Fragment key={row.capability}>
              <PreferencesLabel
                bounds={box(DIAGNOSTICS_PAGE_X, y, featureWidth, DIAGNOSTICS_LABEL_HEIGHT)}
                relativeTo={client}
                text={feature}
              />
              <PreferencesCheckbox
                aria-label={feature}
                bounds={box(
                  statusX,
                  y,
                  TECHNICAL_SUPPORT_CHECKBOX_SIZE,
                  TECHNICAL_SUPPORT_CHECKBOX_SIZE,
                )}
                relativeTo={client}
                label=""
                checked={row.detected}
                disabled
                onCheckedChange={() => {}}
              />
            </Fragment>
          );
        })
      ) : (
        <PreferencesLabel
          bounds={box(
            DIAGNOSTICS_PAGE_X,
            layout.supportStartY,
            DIAGNOSTICS_PAGE_WIDTH,
            DIAGNOSTICS_LABEL_HEIGHT,
          )}
          relativeTo={client}
          text={tUi("ui.diagnostics.support.loading")}
        />
      )}
    </>
  );
}
