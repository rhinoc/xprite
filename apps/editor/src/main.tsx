import "$/adapters/platform/structured-clone-compat";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { BrowserDiagnostics } from "$/adapters/diagnostics/browser-diagnostics";
import { dismissBrowserStartupScreen } from "$/adapters/platform/browser-startup-screen";
import { createBrowserPwaPort } from "$/adapters/pwa/browser-pwa";
import { readBrowserAttribution } from "$/adapters/telemetry/browser-attribution";
import { connectBrowserTelemetryLifecycle } from "$/adapters/telemetry/browser-telemetry-lifecycle";
import { PostHogTelemetry } from "$/adapters/telemetry/posthog-telemetry";
import App from "$/App";
import "$/i18n";
import { AppErrorBoundary } from "$/components/errors/app-error-boundary";
import { DiagnosticsProvider } from "$/managers/diagnostics/diagnostics-context";
import { DiagnosticSource } from "$/managers/ports/diagnostics";
import { TelemetryStartupStage, TelemetryStartupStatus } from "$/managers/ports/telemetry";
import { compareAttributionContext } from "$/managers/telemetry/compare-attribution";
import { TelemetryProvider } from "$/managers/telemetry/telemetry-context";
import { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import { WorkspaceLifetime } from "$/managers/workspace/workspace-lifetime";

import "$/styles.css";
import "$/app.css";

const STARTUP_BOOTSTRAPPED_EVENT = "xse-startup-bootstrapped";
const EMBEDDED_HOST_ENABLED = "true";
const workspaceLifetime: WorkspaceLifetime =
  import.meta.hot?.data.workspaceLifetime ?? new WorkspaceLifetime();

const attribution = compareAttributionContext(readBrowserAttribution());
const telemetry = new TelemetryManager(new PostHogTelemetry(attribution), attribution);
telemetry.startVisit();
const removeTelemetryLifecycle = telemetry.enabled
  ? connectBrowserTelemetryLifecycle(telemetry.observeLifecycle)
  : () => {};
const diagnostics = new BrowserDiagnostics({ onRecord: telemetry.observeDiagnostic });
const removeGlobalHandlers = diagnostics.installGlobalHandlers();
if (import.meta.env.DEV) void diagnostics.syncRecentToDevelopmentLog();

const pwaPort = createBrowserPwaPort({
  enabled: !__XPRITE_ITCH__ && import.meta.env.VITE_EMBEDDED_HOST !== EMBEDDED_HOST_ENABLED,
  offlineEnabled: import.meta.env.PROD,
  baseUrl: import.meta.env.BASE_URL,
  onError: (error) => diagnostics.capture(error, DiagnosticSource.ServiceWorker),
});

function DevelopmentErrorPreview(): ReactNode {
  throw new Error("Development-only error boundary preview");
}

const showDevelopmentErrorPreview =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("mockError") === "1";

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <AppErrorBoundary
      onError={(error, componentStack) => {
        dismissBrowserStartupScreen();
        telemetry.startup(TelemetryStartupStage.Bootstrap, TelemetryStartupStatus.Failed);
        diagnostics.capture(error, DiagnosticSource.ReactBoundary, { componentStack });
      }}
      onExportDiagnostics={() => diagnostics.exportLogs()}
    >
      <DiagnosticsProvider diagnostics={diagnostics}>
        <TelemetryProvider manager={telemetry}>
          {showDevelopmentErrorPreview ? (
            <DevelopmentErrorPreview />
          ) : (
            <App workspaceLifetime={workspaceLifetime} pwaPort={pwaPort} />
          )}
        </TelemetryProvider>
      </DiagnosticsProvider>
    </AppErrorBoundary>
  </StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(async (data) => {
    data.workspaceLifetime = workspaceLifetime;
    root.unmount();
    removeGlobalHandlers();
    removeTelemetryLifecycle();
    telemetry.dispose();
    pwaPort.dispose();
    await workspaceLifetime.retire();
  });
}

// The HTML guard owns failures before this module and its dependencies can execute.
window.dispatchEvent(new Event(STARTUP_BOOTSTRAPPED_EVENT));
