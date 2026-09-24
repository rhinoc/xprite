import { collectDiagnosticEnvironment } from "$/adapters/diagnostics/diagnostic-environment";
import { getDebugInputHistory } from "$/adapters/input/debug-input-log";
import { IndexedDbDiagnosticStore } from "$/adapters/storage/diagnostics/indexeddb-diagnostic-store";
import {
  DIAGNOSTIC_RETENTION_DAYS,
  MAX_DIAGNOSTIC_RECORDS,
  DiagnosticSource,
  type DiagnosticCaptureDetails,
  type DiagnosticRecord,
  type DiagnosticsPort,
  type RuntimeCapabilitySnapshot,
  type WorkspaceDiagnosticEvent,
  type WorkspaceDiagnosticSnapshot,
} from "$/managers/ports/diagnostics";
import { canPickOpenFiles, canPickSaveFile } from "@xprite/bedrock/browser/file-system";
import { supportsOpfs } from "@xprite/bedrock/browser/opfs";

const MAX_PENDING_DIAGNOSTICS = 64;
const DIAGNOSTIC_BATCH_SIZE = 32;
const MAX_HIDE_FLUSH_BATCHES = Math.ceil(MAX_PENDING_DIAGNOSTICS / DIAGNOSTIC_BATCH_SIZE);
const IDLE_FLUSH_TIMEOUT_MS = 1500;
const FALLBACK_FLUSH_DELAY_MS = 500;
const RANDOM_ID_SLICE_START = 2;
const RANDOM_ID_SLICE_END = 8;
const DIAGNOSTIC_EXPORT_FORMAT = "xprite-diagnostics-v4";
const DIAGNOSTIC_EXPORT_FILENAME_PREFIX = "xprite-diagnostics";
const DEVELOPMENT_DIAGNOSTICS_ENDPOINT = "/__debug/diagnostics";
const JSON_EXPORT_INDENTATION_SPACES = 2;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const DIAGNOSTIC_RETENTION_MS = DIAGNOSTIC_RETENTION_DAYS * MILLISECONDS_PER_DAY;

type IdleCallback = () => void;
type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleCallback, options?: { timeout: number }) => number;
};

function structuredErrorDetails(reason: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!reason || typeof reason !== "object") return undefined;
  const value = reason as { issues?: unknown; diagnosticDetails?: unknown };
  const details: Record<string, unknown> = {};
  if (
    value.diagnosticDetails &&
    typeof value.diagnosticDetails === "object" &&
    !Array.isArray(value.diagnosticDetails)
  )
    Object.assign(details, value.diagnosticDetails);
  if (Array.isArray(value.issues)) details.codecIssues = value.issues;
  return Object.keys(details).length ? details : undefined;
}

function errorFields(reason: unknown): {
  name: string;
  message: string;
  stack?: string;
  details?: Readonly<Record<string, unknown>>;
} {
  try {
    const details = structuredErrorDetails(reason);
    if (reason instanceof Error)
      return {
        name: reason.name || "Error",
        message: reason.message || reason.name || "Unknown error",
        ...(typeof reason.stack === "string" ? { stack: reason.stack } : {}),
        ...(details ? { details } : {}),
      };
    if (typeof reason === "string") return { name: "Error", message: reason };
    if (reason && typeof reason === "object") {
      const value = reason as { name?: unknown; message?: unknown; stack?: unknown };
      const name = typeof value.name === "string" ? value.name : "Error";
      const message =
        typeof value.message === "string" ? value.message : "An unknown error was reported";
      return {
        name,
        message,
        ...(typeof value.stack === "string" ? { stack: value.stack } : {}),
        ...(details ? { details } : {}),
      };
    }
    return { name: "Error", message: String(reason) };
  } catch {
    return { name: "Error", message: "An error could not be described" };
  }
}

function recordId(timestamp: number, serial: number): string {
  const random = Math.random().toString(36).slice(RANDOM_ID_SLICE_START, RANDOM_ID_SLICE_END);
  return `${timestamp}-${serial}-${random}`;
}

function detectCapability(probe: () => boolean): boolean {
  try {
    return probe();
  } catch {
    return false;
  }
}

/** Persists diagnostics in browser storage and mirrors development records to Vite. */
export class BrowserDiagnostics implements DiagnosticsPort {
  private readonly store: IndexedDbDiagnosticStore;
  private pending: DiagnosticRecord[] = [];
  private memory: DiagnosticRecord[] = [];
  private serial = 0;
  private scheduled = false;
  private flushing: Promise<void> | null = null;
  private storageUnavailable = false;
  private workspaceSnapshotProvider: (() => Promise<WorkspaceDiagnosticSnapshot>) | null = null;
  private readonly onRecord?: (record: DiagnosticRecord) => void;

  constructor(
    options: { factory?: IDBFactory; onRecord?: (record: DiagnosticRecord) => void } = {},
  ) {
    this.store = new IndexedDbDiagnosticStore(options);
    this.onRecord = options.onRecord;
  }

  capture(reason: unknown, source: DiagnosticSource, details: DiagnosticCaptureDetails = {}): void {
    try {
      const timestamp = Date.now();
      const { details: errorDetails, ...fields } = errorFields(reason);
      const record: DiagnosticRecord = {
        id: recordId(timestamp, ++this.serial),
        timestamp,
        source,
        ...fields,
        ...(details.context ? { context: details.context } : {}),
        ...(details.componentStack ? { componentStack: details.componentStack } : {}),
        ...(errorDetails || details.details
          ? { details: { ...errorDetails, ...details.details } }
          : {}),
      };
      this.queueRecord(record);
    } catch {
      // Diagnostics must never affect the editor or recursively report failures.
    }
  }

  recordWorkspaceEvent(event: WorkspaceDiagnosticEvent): void {
    try {
      const timestamp = Date.now();
      const record: DiagnosticRecord = {
        id: recordId(timestamp, ++this.serial),
        timestamp,
        source: DiagnosticSource.Workspace,
        name: event.action,
        message: `${event.action}${event.documentName ? `: ${event.documentName}` : ""}`,
        context: JSON.stringify(event),
        workspaceEvent: { ...event },
      };
      this.queueRecord(record);
    } catch {
      // Workspace diagnostics must never affect editing or persistence.
    }
  }

  setWorkspaceSnapshotProvider(
    provider: (() => Promise<WorkspaceDiagnosticSnapshot>) | null,
  ): void {
    this.workspaceSnapshotProvider = provider;
  }

  async syncRecentToDevelopmentLog(): Promise<void> {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    try {
      const records = await this.getRecent();
      for (let offset = 0; offset < records.length; offset += DIAGNOSTIC_BATCH_SIZE) {
        const response = await fetch(DEVELOPMENT_DIAGNOSTICS_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ records: records.slice(offset, offset + DIAGNOSTIC_BATCH_SIZE) }),
        });
        if (!response.ok) return;
      }
    } catch {
      // Startup log synchronization must never affect editor startup.
    }
  }

  getRuntimeCapabilities(): RuntimeCapabilitySnapshot {
    return {
      openFilePicker: detectCapability(canPickOpenFiles),
      saveFilePicker: detectCapability(canPickSaveFile),
      opfs: detectCapability(supportsOpfs),
      indexedDb: detectCapability(() => typeof globalThis.indexedDB !== "undefined"),
      workers: detectCapability(() => typeof globalThis.Worker === "function"),
      compressionStream: detectCapability(() => {
        const runtime = globalThis as typeof globalThis & { CompressionStream?: unknown };
        return typeof runtime.CompressionStream === "function";
      }),
      offscreenCanvas: detectCapability(() => typeof globalThis.OffscreenCanvas === "function"),
      imageBitmap: detectCapability(() => typeof globalThis.createImageBitmap === "function"),
    };
  }

  installGlobalHandlers(): () => void {
    if (typeof window === "undefined") return () => {};
    const onError = (event: Event) => {
      if (!(event instanceof ErrorEvent)) return;
      const fallback = event.error ?? new Error(event.message || "Uncaught browser error");
      this.capture(fallback, DiagnosticSource.GlobalError, {
        context:
          event.filename && event.lineno
            ? `${event.filename}:${event.lineno}:${event.colno}`
            : undefined,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      this.capture(event.reason, DiagnosticSource.UnhandledRejection);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void this.flushPendingOnHide();
    };
    const onPageHide = () => void this.flushPendingOnHide();
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }

  async getRecent(): Promise<readonly DiagnosticRecord[]> {
    await this.flushPending();
    let persisted: DiagnosticRecord[] = [];
    try {
      persisted = await this.store.getRecent();
    } catch {
      // Return the in-memory ring if browser storage is unavailable.
    }
    const combined = new Map<string, DiagnosticRecord>();
    const retentionCutoff = Date.now() - DIAGNOSTIC_RETENTION_MS;
    for (const record of persisted) combined.set(record.id, record);
    for (const record of this.memory)
      if (record.timestamp >= retentionCutoff) combined.set(record.id, record);
    return [...combined.values()]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, MAX_DIAGNOSTIC_RECORDS);
  }

  async clear(): Promise<void> {
    await this.flushPending();
    this.pending = [];
    this.memory = [];
    await this.store.clear();
    this.storageUnavailable = false;
  }

  async exportLogs(): Promise<number> {
    const records = await this.getRecent();
    const exportedAt = new Date().toISOString();
    let environment: Awaited<ReturnType<typeof collectDiagnosticEnvironment>> | null = null;
    let environmentError: string | undefined;
    try {
      environment = await collectDiagnosticEnvironment();
    } catch (error) {
      environmentError = errorFields(error).message;
    }
    let workspace: WorkspaceDiagnosticSnapshot | null = null;
    let workspaceSnapshotError: string | undefined;
    try {
      workspace = (await this.workspaceSnapshotProvider?.()) ?? null;
    } catch (error) {
      workspaceSnapshotError = errorFields(error).message;
    }
    const exportPayload = {
      format: DIAGNOSTIC_EXPORT_FORMAT,
      exportedAt,
      environment,
      ...(environmentError ? { environmentError } : {}),
      runtimeCapabilities: this.getRuntimeCapabilities(),
      diagnosticStorageUnavailable: this.storageUnavailable,
      workspace,
      ...(workspaceSnapshotError ? { workspaceSnapshotError } : {}),
      records,
      inputTrace: getDebugInputHistory(),
    };
    const exportText = JSON.stringify(exportPayload, null, JSON_EXPORT_INDENTATION_SPACES);
    const blob = new Blob([exportText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const exportDate = exportedAt.slice(0, 10);
    anchor.href = url;
    anchor.download = `${DIAGNOSTIC_EXPORT_FILENAME_PREFIX}-${exportDate}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return records.length;
  }

  private queueRecord(record: DiagnosticRecord): void {
    this.memory.push(record);
    if (this.memory.length > MAX_DIAGNOSTIC_RECORDS)
      this.memory.splice(0, this.memory.length - MAX_DIAGNOSTIC_RECORDS);
    try {
      this.onRecord?.(record);
    } catch {
      // Optional observers must not interrupt local diagnostic persistence.
    }
    if (import.meta.env.DEV && typeof window !== "undefined") {
      try {
        void fetch(DEVELOPMENT_DIAGNOSTICS_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(record),
          keepalive: true,
        }).catch(() => {
          // Local development logging must never affect editor diagnostics.
        });
      } catch {
        // A synchronous transport failure must not prevent IndexedDB capture.
      }
    }
    if (this.storageUnavailable) return;
    if (this.pending.length >= MAX_PENDING_DIAGNOSTICS) this.pending.shift();
    this.pending.push(record);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (
      this.scheduled ||
      this.storageUnavailable ||
      !this.pending.length ||
      typeof window === "undefined"
    )
      return;
    this.scheduled = true;
    const flush = () => {
      this.scheduled = false;
      void this.flushPending();
    };
    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback)
      idleWindow.requestIdleCallback(flush, { timeout: IDLE_FLUSH_TIMEOUT_MS });
    else setTimeout(flush, FALLBACK_FLUSH_DELAY_MS);
  }

  private async flushPendingOnHide(): Promise<void> {
    for (let batch = 0; batch < MAX_HIDE_FLUSH_BATCHES && this.pending.length; batch++)
      await this.flushPending();
  }

  private flushPending(): Promise<void> {
    if (this.flushing) return this.flushing.then(() => this.flushPending());
    if (!this.pending.length) return Promise.resolve();
    const batch = this.pending.splice(0, DIAGNOSTIC_BATCH_SIZE);
    const write = this.store.appendBatch(batch).catch(() => {
      // Keep the bounded in-memory ring available for a manual export.
      this.storageUnavailable = true;
      this.pending = [];
    });
    this.flushing = write;
    return write.then(() => {
      if (this.flushing === write) this.flushing = null;
      if (this.pending.length) this.scheduleFlush();
    });
  }
}
