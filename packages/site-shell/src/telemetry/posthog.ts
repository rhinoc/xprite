import type { CaptureResult, PostHog } from "posthog-js";

import { SiteTelemetryEvent, type SiteTelemetryProperties } from "../managers/ports/telemetry";
import {
  browserPageContext,
  internalTraffic,
  watchPageNavigation,
  watchSiteLinks,
} from "./browser-context";

export interface BrowserTelemetryOptions {
  production: boolean;
  token: string;
  region: string;
  version: string;
  release: string;
  allowedEvents?: readonly string[];
  visitContext?: SiteTelemetryProperties;
  captureLinks?: boolean;
}

interface ReportedException {
  name: string;
  message: string;
  stack?: string;
}

const POSTHOG_API_HOSTS = {
  us: "https://us.i.posthog.com",
  eu: "https://eu.i.posthog.com",
};
const MAX_PENDING_REPORTS = 64;
const OLDEST_PENDING_ACTION_INDEX = 1;
const MAX_EXCEPTION_STEPS_BYTES = 4_096;
const MAX_LOGS_PER_INTERVAL = 20;
const EVENTS_PER_SECOND = 5;
const EVENT_BURST_LIMIT = 25;
const RANDOM_ID_START = 2;
const EXCEPTION_EVENT = "$exception";
const CHECKPOINT_EVENT = "visit_checkpoint";
const TELEMETRY_DEFAULTS = "2026-05-30";
const TELEMETRY_SCHEMA_VERSION = 3;
const FEEDBACK_REQUEST_TIMEOUT_MS = 15_000;
const TELEMETRY_IDLE_TIMEOUT_MS = 2_000;
const POSTHOG_CAPTURE_PATH = "/i/v0/e";
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
  | { event: string; properties: SiteTelemetryProperties }
  | { exception: ReportedException; properties: SiteTelemetryProperties };

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

function sanitizeSdkEvent(
  event: CaptureResult | null,
  allowedEvents: ReadonlySet<string>,
): CaptureResult | null {
  if (!event || !allowedEvents.has(event.event)) return null;
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

/** Shared anonymous transport. A single instance belongs to one document load, outside React hydration. */
export class BrowserTelemetry {
  readonly enabled: boolean;
  private sdk: PostHog | null = null;
  private pending: PendingReport[] = [];
  private failed = false;
  private readonly visitId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(RANDOM_ID_START)}`;
  private readonly token: string;
  private readonly region: "us" | "eu";
  private readonly allowedEvents: ReadonlySet<string>;
  private readonly commonProperties: SiteTelemetryProperties;
  private readonly initialization: Promise<void>;
  private resumeInitialization?: () => void;

  constructor(options: BrowserTelemetryOptions) {
    this.token = options.token.trim();
    this.region = options.region === "EU" ? "eu" : "us";
    this.allowedEvents = new Set([
      ...Object.values(SiteTelemetryEvent),
      EXCEPTION_EVENT,
      ...(options.allowedEvents ?? []),
    ]);
    this.enabled =
      options.production && this.token.startsWith("phc_") && navigator.doNotTrack !== "1";
    this.commonProperties = {
      ...options.visitContext,
      app_version: options.version,
      release: options.release,
      environment: "production",
      visit_id: this.visitId,
      telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
      supports_structured_clone: typeof globalThis.structuredClone === "function",
      supports_indexeddb: "indexedDB" in globalThis,
      supports_save_file_picker: "showSaveFilePicker" in globalThis,
      secure_context: window.isSecureContext,
    };
    this.initialization = this.enabled ? this.initialize() : Promise.resolve();
    if (this.enabled) {
      watchPageNavigation(() => this.capture(SiteTelemetryEvent.Pageview, {}));
      if (options.captureLinks)
        watchSiteLinks((properties, page) =>
          this.report({ event: SiteTelemetryEvent.CtaClick, properties }, page),
        );
    }
  }

  capture(event: string, properties: SiteTelemetryProperties): void {
    this.report({ event, properties });
  }
  captureException(exception: ReportedException, properties: SiteTelemetryProperties): void {
    this.report({ exception, properties });
  }

  async submitFeedback(eventName: string, properties: SiteTelemetryProperties): Promise<void> {
    this.resumeInitialization?.();
    await this.initialization;
    const sdk = this.sdk;
    if (!this.enabled || !sdk || sdk.has_opted_out_capturing())
      throw new Error("Feedback transport is unavailable");
    const event = this.sanitize({
      uuid: crypto.randomUUID(),
      event: eventName,
      properties: sdk.calculateEventProperties(eventName, {
        ...properties,
        ...this.context(),
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

  private context(): SiteTelemetryProperties {
    return {
      ...this.commonProperties,
      ...browserPageContext(),
      internal_traffic: internalTraffic(),
    };
  }

  private sanitize(event: CaptureResult | null): CaptureResult | null {
    if (navigator.doNotTrack === "1") return null;
    return sanitizeSdkEvent(event, this.allowedEvents);
  }

  private async initialize(): Promise<void> {
    try {
      // Collect early events in the existing queue while rendering takes priority over the SDK.
      await new Promise<void>((resolve) => {
        let request: number | undefined;
        const resume = () => {
          clearTimeout(timeout);
          if (request !== undefined) window.cancelIdleCallback(request);
          window.removeEventListener("load", idle);
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("keydown", resume);
          this.resumeInitialization = undefined;
          resolve();
        };
        const idle = () => {
          if (typeof window.requestIdleCallback === "function")
            request = window.requestIdleCallback(resume, { timeout: TELEMETRY_IDLE_TIMEOUT_MS });
        };
        const timeout = setTimeout(resume, TELEMETRY_IDLE_TIMEOUT_MS);
        this.resumeInitialization = resume;
        window.addEventListener("pointerdown", resume, { once: true, passive: true });
        window.addEventListener("keydown", resume, { once: true });
        if (document.readyState === "complete") idle();
        else window.addEventListener("load", idle, { once: true });
      });
      const { PostHog } = await import("posthog-js/full/no-external");
      const sdk = new PostHog();
      sdk.init(this.token, {
        api_host: POSTHOG_API_HOSTS[this.region],
        ui_host: `https://${this.region}.posthog.com`,
        defaults: TELEMETRY_DEFAULTS,
        person_profiles: "never",
        persistence: "localStorage",
        save_campaign_params: false,
        save_referrer: false,
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
        before_send: (event) => this.sanitize(event),
      });
      this.sdk = sdk;
      const pending = this.pending;
      this.pending = [];
      for (const report of pending) this.send(report);
    } catch {
      this.failed = true;
      this.pending = [];
      // Reporting failures never affect application startup or local diagnostics.
    }
  }

  private report(report: PendingReport, page: SiteTelemetryProperties = {}): void {
    if (!this.enabled || this.failed || navigator.doNotTrack === "1") return;
    try {
      report = { ...report, properties: { ...report.properties, ...this.context(), ...page } };
      if (this.sdk) this.send(report);
      else {
        if (this.pending.length >= MAX_PENDING_REPORTS)
          // Keep the initial pageview even when slow SDK startup fills the action queue.
          this.pending.splice(OLDEST_PENDING_ACTION_INDEX, 1);
        this.pending.push(report);
        if (
          "exception" in report ||
          report.event === SiteTelemetryEvent.CtaClick ||
          report.event === SiteTelemetryEvent.OutputHandedOff ||
          report.event === CHECKPOINT_EVENT
        )
          this.resumeInitialization?.();
      }
    } catch {
      /* Reporting cannot throw into application workflows. */
    }
  }

  private send(report: PendingReport): void {
    const sdk = this.sdk;
    if (!sdk) return;
    const properties = report.properties;
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
        report.event === CHECKPOINT_EVENT ||
          report.event === SiteTelemetryEvent.CtaClick ||
          report.event === SiteTelemetryEvent.OutputHandedOff
          ? { transport: "sendBeacon", send_instantly: true }
          : undefined,
      );
      sdk.addExceptionStep(report.event, properties);
    }
  }
}

let telemetry: BrowserTelemetry | undefined;

/** Repeated bootstrap/hydration calls share the transport and its one pageview listener. */
export function createBrowserSiteTelemetry(options: BrowserTelemetryOptions): BrowserTelemetry {
  return (telemetry ??= new BrowserTelemetry(options));
}
