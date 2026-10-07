import type { TelemetryAttributionInput } from "$/managers/ports/telemetry";

/** Read three candidate fields; the manager policy decides which values may be reported. */
export function readBrowserAttribution(): TelemetryAttributionInput {
  const parameters = new URLSearchParams(window.location.search);
  return {
    source: parameters.get("utm_source"),
    medium: parameters.get("utm_medium"),
    campaign: parameters.get("utm_campaign"),
  };
}
