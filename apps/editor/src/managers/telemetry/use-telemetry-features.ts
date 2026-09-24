import { useEffect, useRef } from "react";

import { TelemetryFeature, TelemetryFeatureAction } from "$/managers/ports/telemetry";
import { useTelemetry } from "$/managers/telemetry/telemetry-context";

/** Tracks real dialog transitions, including keyboard commands; StrictMode replay is inert. */
export function useTelemetryFeatures(settingsOpen: boolean, aboutOpen: boolean) {
  const telemetry = useTelemetry();
  const previous = useRef({ settingsOpen: false, aboutOpen: false });
  useEffect(() => {
    if (settingsOpen && !previous.current.settingsOpen)
      telemetry.featureUsed(TelemetryFeature.Settings, TelemetryFeatureAction.Open);
    if (aboutOpen && !previous.current.aboutOpen)
      telemetry.featureUsed(TelemetryFeature.About, TelemetryFeatureAction.Open);
    previous.current = { settingsOpen, aboutOpen };
  }, [telemetry, settingsOpen, aboutOpen]);
  return telemetry;
}
