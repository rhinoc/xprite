import {
  DiagnosticSource,
  type DiagnosticRecord,
  type DiagnosticsPort,
  type WorkspaceDiagnosticEvent,
  type WorkspaceDiagnosticSnapshot,
} from "$/managers/ports/diagnostics";

const MAX_LOCAL_RECORDS = 30;
const SNAPSHOT_TIMEOUT_MS = 500;

/** Container-only diagnostic ring; report serialization happens when the user requests it. */
export function createMiniToolDiagnostics() {
  const records: DiagnosticRecord[] = [];
  const events: WorkspaceDiagnosticEvent[] = [];
  let sequence = 0;
  let snapshotProvider: (() => Promise<WorkspaceDiagnosticSnapshot>) | null = null;
  const append = (record: DiagnosticRecord) => {
    records.push(record);
    if (records.length > MAX_LOCAL_RECORDS) records.shift();
  };
  const diagnostics: DiagnosticsPort = {
    capture(reason, source, details) {
      const error = reason instanceof Error ? reason : new Error(describeReason(reason));
      append({
        id: String(++sequence),
        timestamp: Date.now(),
        name: error.name,
        message: error.message,
        stack: error.stack,
        source,
        ...details,
      });
      console.error(error);
    },
    recordWorkspaceEvent(event) {
      events.push(event);
      if (events.length > MAX_LOCAL_RECORDS) events.shift();
    },
    setWorkspaceSnapshotProvider(provider) {
      snapshotProvider = provider;
    },
    getRuntimeCapabilities: () => ({
      openFilePicker: false,
      saveFilePicker: false,
      opfs: false,
      indexedDb: false,
      workers: false,
      compressionStream: false,
      offscreenCanvas: typeof OffscreenCanvas === "function",
      imageBitmap: typeof createImageBitmap === "function",
    }),
    getRecent: async () => records.slice().reverse(),
    clear: async () => {
      records.length = 0;
      events.length = 0;
    },
    exportLogs: async () => {
      throw new Error("小红书内不支持下载诊断文件。");
    },
    async readReport() {
      let workspace: WorkspaceDiagnosticSnapshot | null = null;
      let workspaceError: string | undefined;
      // A failed editor must not prevent access to its already captured errors.
      const errors = records.slice().reverse();
      const workspaceEvents = events.slice();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        if (snapshotProvider)
          workspace = await Promise.race([
            snapshotProvider(),
            new Promise<never>((_resolve, reject) => {
              timeout = setTimeout(
                () => reject(new Error("Workspace snapshot timed out")),
                SNAPSHOT_TIMEOUT_MS,
              );
            }),
          ]);
      } catch (error) {
        workspaceError = describeReason(error);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
      const seen = new WeakSet<object>();
      return JSON.stringify(
        {
          version: __XPRITE_VERSION__,
          release: __XPRITE_RELEASE__,
          host: "xiaohongshu",
          generatedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
          language: navigator.language,
          runtime: diagnostics.getRuntimeCapabilities(),
          workspace,
          workspaceError,
          workspaceEvents,
          records: errors,
        },
        (_key, value: unknown) => {
          if (typeof value === "bigint") return String(value);
          if (value && typeof value === "object") {
            if (seen.has(value)) return "[Repeated reference]";
            seen.add(value);
          }
          return value;
        },
        2,
      );
    },
  };
  const onError = (event: ErrorEvent) =>
    diagnostics.capture(
      event.error ?? new Error(event.message || "Uncaught error"),
      DiagnosticSource.GlobalError,
      { context: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined },
    );
  const onUnhandledRejection = (event: PromiseRejectionEvent) =>
    diagnostics.capture(event.reason, DiagnosticSource.UnhandledRejection);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return {
    diagnostics,
    dispose() {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    },
  };
}

function describeReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object") {
    const detail = reason as { errMsg?: unknown; message?: unknown };
    if (typeof detail.errMsg === "string") return detail.errMsg;
    if (typeof detail.message === "string") return detail.message;
    try {
      const serialized = JSON.stringify(reason);
      if (typeof serialized === "string") return serialized;
    } catch {
      /* Fall back to the native string. */
    }
  }
  return String(reason);
}
