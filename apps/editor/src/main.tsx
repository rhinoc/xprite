import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { BrowserDiagnostics } from "$/adapters/diagnostics/browser-diagnostics";
import { dismissBrowserStartupScreen } from "$/adapters/platform/browser-startup-screen";
import { PostHogTelemetry } from "$/adapters/telemetry/posthog-telemetry";
import App from "$/App";
import "$/i18n";
import { AppErrorBoundary } from "$/components/errors/app-error-boundary";
import { DiagnosticsProvider } from "$/managers/diagnostics/diagnostics-context";
import { DiagnosticSource } from "$/managers/ports/diagnostics";
import { TelemetryProvider } from "$/managers/telemetry/telemetry-context";
import { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import { WorkspaceLifetime } from "$/managers/workspace/workspace-lifetime";

import "$/styles.css";
import "$/app.css";

const STARTUP_BOOTSTRAPPED_EVENT = "xse-startup-bootstrapped";
const workspaceLifetime: WorkspaceLifetime =
  import.meta.hot?.data.workspaceLifetime ?? new WorkspaceLifetime();

if (import.meta.env.PROD && !__XPRITE_ITCH__ && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}

const telemetry = new TelemetryManager(new PostHogTelemetry());
const diagnostics = new BrowserDiagnostics({ onRecord: telemetry.observeDiagnostic });
const removeGlobalHandlers = diagnostics.installGlobalHandlers();
if (import.meta.env.DEV) void diagnostics.syncRecentToDevelopmentLog();

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
        diagnostics.capture(error, DiagnosticSource.ReactBoundary, { componentStack });
      }}
      onExportDiagnostics={() => diagnostics.exportLogs()}
    >
      <DiagnosticsProvider diagnostics={diagnostics}>
        <TelemetryProvider manager={telemetry}>
          {showDevelopmentErrorPreview ? (
            <DevelopmentErrorPreview />
          ) : (
            <App workspaceLifetime={workspaceLifetime} />
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
    await workspaceLifetime.retire();
  });
}

// The HTML guard owns failures before this module and its dependencies can execute.
window.dispatchEvent(new Event(STARTUP_BOOTSTRAPPED_EVENT));
