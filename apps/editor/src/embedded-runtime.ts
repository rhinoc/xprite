/** Shared application composition for native hosts; website entry remains main.tsx. */
export { default as EditorApplication } from "$/App";
export { AppErrorBoundary } from "$/components/errors/app-error-boundary";
export { DiagnosticsProvider } from "$/managers/diagnostics/diagnostics-context";
export { TelemetryProvider } from "$/managers/telemetry/telemetry-context";
export { WorkspaceLifetime } from "$/managers/workspace/workspace-lifetime";
import "$/i18n";
import "$/styles.css";
import "$/app.css";
