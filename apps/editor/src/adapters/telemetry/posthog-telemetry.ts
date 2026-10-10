import {
  TelemetryEvent,
  type TelemetryException,
  type TelemetryPort,
  type TelemetryProperties,
} from "$/managers/ports/telemetry";
import { createBrowserSiteTelemetry } from "@xprite/site-shell/telemetry/browser";

/** Editor-specific event contract; identity, privacy and page lifecycle are shared with public pages. */
export class PostHogTelemetry implements TelemetryPort {
  private readonly transport;
  readonly enabled: boolean;
  constructor(visitContext: TelemetryProperties = {}) {
    this.transport = createBrowserSiteTelemetry({
      production: import.meta.env.PROD,
      token: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? "",
      region: import.meta.env.VITE_POSTHOG_REGION ?? "US",
      version: __XPRITE_VERSION__,
      release: __XPRITE_RELEASE__,
      allowedEvents: Object.values(TelemetryEvent),
      visitContext,
    });
    this.enabled = this.transport.enabled;
  }
  capture(event: TelemetryEvent, properties: TelemetryProperties): void {
    this.transport.capture(event, properties);
  }
  captureException(exception: TelemetryException, properties: TelemetryProperties): void {
    this.transport.captureException(exception, properties);
  }
  submitFeedback(properties: TelemetryProperties): Promise<void> {
    return this.transport.submitFeedback(TelemetryEvent.FeedbackSubmitted, properties);
  }
}
