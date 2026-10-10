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
const TELEMETRY_SCHEMA_VERSION = 2;
const FEEDBACK_REQUEST_TIMEOUT_MS = 15_000;
const POSTHOG_CAPTURE_PATH = "/i/v0/e";
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
const SDK_CAMPAIGN_PROPERTIES = new Set([
  "gad_source",
  "mc_cid",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "igshid",
  "ttclid",
  "rdt_cid",
  "epik",
  "qclid",
  "sccid",
  "oppref",
  "irclid",
  "_kx",
  "ph_keyword",
]);

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

function referringDomain(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.host : null;
  } catch {
    return null;
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
  for (const key of Object.keys(properties)) {
    const campaignKey = key.replace(/^(?:\$initial_|\$session_entry_)/u, "");
    if (campaignKey.startsWith("utm_") || SDK_CAMPAIGN_PROPERTIES.has(campaignKey))
      delete properties[key];
  }
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
  private readonly initialization: Promise<void>;

  constructor(visitContext: TelemetryProperties = {}) {
    this.enabled =
      import.meta.env.PROD && this.token.startsWith("phc_") && navigator.doNotTrack !== "1";
    this.commonProperties = {
      ...visitContext,
      app_version: __XPRITE_VERSION__,
      release: __XPRITE_RELEASE__,
      environment: "production",
      visit_id: this.visitId,
      telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
      entry_referrer_present: Boolean(document.referrer),
      entry_referring_domain: referringDomain(document.referrer),
      supports_structured_clone: typeof globalThis.structuredClone === "function",
      supports_indexeddb: "indexedDB" in globalThis,
      supports_save_file_picker: "showSaveFilePicker" in globalThis,
      secure_context: window.isSecureContext,
    };
    this.initialization = this.enabled ? this.initialize() : Promise.resolve();
  }

  capture(event: TelemetryEvent, properties: TelemetryProperties): void {
    this.report({ event, properties });
  }
  captureException(exception: TelemetryException, properties: TelemetryProperties): void {
    this.report({ exception, properties });
  }

  async submitFeedback(properties: TelemetryProperties): Promise<void> {
    await this.initialization;
    const sdk = this.sdk;
    if (!this.enabled || !sdk || sdk.has_opted_out_capturing())
      throw new Error("Feedback transport is unavailable");
    const event = sanitizeSdkEvent({
      uuid: crypto.randomUUID(),
      event: TelemetryEvent.FeedbackSubmitted,
      properties: sdk.calculateEventProperties(TelemetryEvent.FeedbackSubmitted, {
        ...this.commonProperties,
        ...properties,
      }),
    });
    if (!event) throw new Error("Feedback event was not accepted");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEEDBACK_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${POSTHOG_API_HOSTS[this.region]}${POSTHOG_CAPTURE_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.token,
          distinct_id: sdk.get_distinct_id(),
          ...event,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Feedback submission failed: ${response.status}`);
    } finally {
      clearTimeout(timeout);
    }
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
        save_campaign_params: false,
        save_referrer: true,
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
      sdk.capture(
        report.event,
        properties,
        report.event === TelemetryEvent.VisitCheckpoint
          ? { transport: "sendBeacon", send_instantly: true }
          : undefined,
      );
      sdk.addExceptionStep(report.event, properties);
    }
  }
}
