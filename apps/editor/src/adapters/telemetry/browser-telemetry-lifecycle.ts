import { TelemetryLifecycleKind, type TelemetryLifecycleSignal } from "$/managers/ports/telemetry";

const HIDDEN_VISIBILITY_STATE = "hidden";

/** Visibility checkpoints are observations, not an assertion that a visit ended. */
export function connectBrowserTelemetryLifecycle(
  observe: (signal: TelemetryLifecycleSignal) => void,
): () => void {
  const visibility = (initial = false) =>
    observe({
      kind:
        document.visibilityState === HIDDEN_VISIBILITY_STATE
          ? TelemetryLifecycleKind.Hidden
          : TelemetryLifecycleKind.Visible,
      initial,
      persisted: false,
    });
  const changed = () => visibility();
  const hidden = (event: PageTransitionEvent) =>
    observe({
      kind: TelemetryLifecycleKind.PageHide,
      initial: false,
      persisted: event.persisted,
    });
  document.addEventListener("visibilitychange", changed);
  window.addEventListener("pagehide", hidden);
  window.addEventListener("pageshow", changed);
  visibility(true);
  return () => {
    document.removeEventListener("visibilitychange", changed);
    window.removeEventListener("pagehide", hidden);
    window.removeEventListener("pageshow", changed);
  };
}
