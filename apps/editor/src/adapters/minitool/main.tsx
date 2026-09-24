import "$/adapters/minitool/runtime-compat";
import { lazy, StrictMode, Suspense, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

import { createMiniToolDiagnostics } from "$/adapters/minitool/diagnostics";
import { initializeMiniTool } from "$/adapters/minitool/sdk";
import { miniToolWelcomeStorage } from "$/adapters/minitool/welcome";
import App from "$/App";
import { AppErrorBoundary } from "$/components/errors/app-error-boundary";
import { MiniToolStartup } from "$/components/minitool/startup";
import { MiniToolWelcomeDialog } from "$/components/minitool/welcome";
import { tUi } from "$/i18n";
import { DiagnosticsProvider } from "$/managers/diagnostics/diagnostics-context";
import {
  DiagnosticsReportProvider,
  useDiagnosticsReport,
} from "$/managers/diagnostics/diagnostics-report-context";
import { MiniToolWelcomeManager, MiniToolWelcomePhase } from "$/managers/minitool/welcome";
import { DiagnosticSource } from "$/managers/ports/diagnostics";
import type { EditorHostFactory } from "$/managers/ports/editor-host";
import { TelemetryProvider } from "$/managers/telemetry/telemetry-context";
import { TelemetryManager } from "$/managers/telemetry/telemetry-manager";

import "$/styles.css";
import "$/app.css";
import "$/adapters/minitool/minitool.css";

const MOUNTED_EVENT = "xprite-minitool-mounted";
const { diagnostics, dispose: removeDiagnosticHandlers } = createMiniToolDiagnostics();
const DiagnosticsReportView = lazy(() => import("$/components/errors/diagnostics-report-view"));
const telemetry = new TelemetryManager({
  enabled: false,
  capture: () => {},
  captureException: () => {},
});

function MiniToolEditor({
  createHost,
  welcome,
}: {
  createHost: EditorHostFactory;
  welcome: MiniToolWelcomeManager;
}) {
  const reportViewer = useDiagnosticsReport();
  const welcomePhase = useSyncExternalStore(
    welcome.subscribe,
    welcome.getSnapshot,
    welcome.getSnapshot,
  );
  if (welcomePhase !== MiniToolWelcomePhase.Closed)
    return (
      <MiniToolWelcomeDialog
        saving={welcomePhase === MiniToolWelcomePhase.Saving}
        onDismiss={welcome.dismiss}
      />
    );
  return (
    <>
      <AppErrorBoundary
        onError={(error, componentStack) =>
          diagnostics.capture(error, DiagnosticSource.ReactBoundary, { componentStack })
        }
        onExportDiagnostics={diagnostics.exportLogs}
        onViewDiagnostics={reportViewer?.open}
      >
        <TelemetryProvider manager={telemetry}>
          <App createHost={createHost} />
        </TelemetryProvider>
      </AppErrorBoundary>
      {reportViewer?.report !== null && reportViewer && (
        <Suspense fallback={null}>
          <DiagnosticsReportView />
        </Suspense>
      )}
    </>
  );
}

async function start(): Promise<void> {
  const root = createRoot(document.getElementById("root")!);
  root.render(<MiniToolStartup />);
  window.dispatchEvent(new Event(MOUNTED_EVENT));
  try {
    await initializeMiniTool();
    const welcome = new MiniToolWelcomeManager(miniToolWelcomeStorage, (error) =>
      diagnostics.capture(error, DiagnosticSource.GlobalError, {
        context: "minitool-welcome-preference",
      }),
    );
    await welcome.initialize();
    const { createMiniToolEditorHostPorts } = await import("$/adapters/minitool/host");
    root.render(
      <StrictMode>
        <DiagnosticsProvider diagnostics={diagnostics}>
          <DiagnosticsReportProvider>
            <MiniToolEditor createHost={createMiniToolEditorHostPorts} welcome={welcome} />
          </DiagnosticsReportProvider>
        </DiagnosticsProvider>
      </StrictMode>,
    );
    window.dispatchEvent(new Event(MOUNTED_EVENT));
  } catch (error) {
    diagnostics.capture(error, DiagnosticSource.GlobalError, { context: "minitool-startup" });
    const message = error instanceof Error ? error.message : tUi("ui.minitool.startup.retry");
    root.render(<MiniToolStartup message={message} />);
    window.dispatchEvent(new Event(MOUNTED_EVENT));
  }
}
void start();
if (import.meta.hot) import.meta.hot.dispose(removeDiagnosticHandlers);
