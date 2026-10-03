import type { CaptureResult, PostHog } from "posthog-js";

import {
  TelemetryEvent,
  type TelemetryException,
  type TelemetryPort,
  type TelemetryProperties,
} from "$/managers/ports/telemetry";

const POSTHOG_API_HOSTS = {
  us: "https://us.i.posthog.com",
  eu: "https://eu.i.posthog.com",
};
const MAX_PENDING_REPORTS = 64;
const MAX_EXCEPTION_STEPS_BYTES = 4_096;
const MAX_LOGS_PER_INTERVAL = 20;
const EVENTS_PER_SECOND = 5;
const EVENT_BURST_LIMIT = 25;
const RANDOM_ID_START = 2;
const EXCEPTION_EVENT = "$exception";
const PAGEVIEW_EVENT = "$pageview";
const TELEMETRY_DEFAULTS = "2026-05-30";
const ALLOWED_EVENTS = new Set<string>([
  ...Object.values(TelemetryEvent),
  EXCEPTION_EVENT,
  PAGEVIEW_EVENT,
]);
const URL_PROPERTIES = [
  "$current_url",
  "$referrer",
  "$initial_referrer",
  "$initial_current_url",
  "$session_entry_url",
  "$session_entry_referrer",
];
const PRIVATE_PROPERTIES = [
  "$set",
  "$set_once",
  "$initial_person_info",
  "$user_id",
  "email",
  "name",
  "search",
  "query",
  "utm_term",
  "$title",
  "$initial_utm_term",
];

type PendingReport =
  | { event: TelemetryEvent; properties: TelemetryProperties }
  | { exception: TelemetryException; properties: TelemetryProperties };

function sanitizedUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? `${url.origin}${url.pathname}`
      : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeSdkEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event || !ALLOWED_EVENTS.has(event.event)) return null;
  const properties = { ...event.properties };
  for (const key of URL_PROPERTIES) {
    const value = sanitizedUrl(properties[key]);
    if (value) properties[key] = value;
    else delete properties[key];
  }
  for (const key of PRIVATE_PROPERTIES) delete properties[key];
  return { ...event, properties };
}

/** Optional PostHog SDK transport. Provider configuration and network I/O stay in this adapter. */
export class PostHogTelemetry implements TelemetryPort {
  readonly enabled: boolean;
  private sdk: PostHog | null = null;
  private pending: PendingReport[] = [];
  private failed = false;
  private readonly visitId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(RANDOM_ID_START)}`;
  private readonly token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim() ?? "";
  private readonly region = import.meta.env.VITE_POSTHOG_REGION === "EU" ? "eu" : "us";
  private readonly commonProperties: TelemetryProperties;

  constructor() {
    this.enabled =
      import.meta.env.PROD && this.token.startsWith("phc_") && navigator.doNotTrack !== "1";
    this.commonProperties = {
      app_version: __XPRITE_VERSION__,
      release: __XPRITE_RELEASE__,
      environment: "production",
      visit_id: this.visitId,
    };
    if (this.enabled) void this.initialize();
  }

  capture(event: TelemetryEvent, properties: TelemetryProperties): void {
    this.report({ event, properties });
  }
  captureException(exception: TelemetryException, properties: TelemetryProperties): void {
    this.report({ exception, properties });
  }

  private async initialize(): Promise<void> {
    try {
      const { PostHog } = await import("posthog-js/full/no-external");
      const sdk = new PostHog();
      sdk.init(this.token, {
        api_host: POSTHOG_API_HOSTS[this.region],
        ui_host: `https://${this.region}.posthog.com`,
        defaults: TELEMETRY_DEFAULTS,
        person_profiles: "never",
        persistence: "localStorage",
        respect_dnt: true,
        disable_capture_url_hashes: true,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        capture_performance: false,
        capture_dead_clicks: false,
        rageclick: false,
        enable_heatmaps: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_external_dependency_loading: true,
        advanced_disable_feature_flags: true,
        error_tracking: {
          exception_steps: { enabled: true, max_bytes: MAX_EXCEPTION_STEPS_BYTES },
        },
        logs: { captureConsoleLogs: false, maxLogsPerInterval: MAX_LOGS_PER_INTERVAL },
        rate_limiting: {
          events_per_second: EVENTS_PER_SECOND,
          events_burst_limit: EVENT_BURST_LIMIT,
        },
        before_send: sanitizeSdkEvent,
      });
      this.sdk = sdk;
      sdk.capture(PAGEVIEW_EVENT, this.commonProperties);
      const pending = this.pending;
      this.pending = [];
      for (const report of pending) this.send(report);
    } catch {
      this.failed = true;
      this.pending = [];
      // Reporting failures never affect editor startup or local diagnostics.
    }
  }

  private report(report: PendingReport): void {
    if (!this.enabled || this.failed) return;
    try {
      if (this.sdk) this.send(report);
      else {
        if (this.pending.length >= MAX_PENDING_REPORTS) this.pending.shift();
        this.pending.push(report);
      }
    } catch {
      /* Reporting cannot throw into application workflows. */
    }
  }

  private send(report: PendingReport): void {
    const sdk = this.sdk;
    if (!sdk) return;
    const properties = { ...this.commonProperties, ...report.properties };
    if ("exception" in report) {
      const error = new Error(report.exception.message);
      error.name = report.exception.name;
      if (report.exception.stack) error.stack = report.exception.stack;
      sdk.captureException(error, properties);
      sdk.captureLog({ body: report.exception.message, level: "error", attributes: properties });
    } else {
      sdk.capture(report.event, properties);
      sdk.addExceptionStep(report.event, properties);
    }
  }
}
