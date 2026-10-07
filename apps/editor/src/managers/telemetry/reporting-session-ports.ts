import { DocumentOpenMethod, TelemetryDownloadKind } from "$/managers/ports/telemetry";
import type { WorkspaceSessionPorts } from "$/managers/ports/workspace-session";
import { telemetryFileFormat } from "$/managers/telemetry/document-context";
import type { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import {
  SessionSaveIntent,
  type SessionWriteResult,
  type SessionSource,
} from "@xprite/editor-core/session";

/** Decorates the existing file boundary without changing activation, persistence, or editor-core. */
export function reportingSessionPorts(
  ports: WorkspaceSessionPorts,
  telemetry: TelemetryManager,
): WorkspaceSessionPorts {
  if (!telemetry.enabled) return ports;
  const sources = new Map<string, { method: DocumentOpenMethod; format: string }>();
  const remember = (source: SessionSource<string>, method: DocumentOpenMethod) => {
    sources.set(source.source, { method, format: telemetryFileFormat(source.name) });
    return source;
  };
  const write = (
    writing: () => Promise<SessionWriteResult>,
    intent: SessionSaveIntent,
    documentKey?: string,
  ) => {
    const context = telemetry.context(documentKey);
    const startedAt = performance.now();
    // Invoke synchronously: system file pickers require the original user activation.
    return writing().then((result) => {
      if (
        "method" in result &&
        (result.method === "download" || intent !== SessionSaveIntent.Save)
      ) {
        telemetry.recordOutput(
          intent === SessionSaveIntent.Export
            ? TelemetryDownloadKind.Export
            : intent === SessionSaveIntent.SaveAs
              ? TelemetryDownloadKind.SaveAs
              : TelemetryDownloadKind.Save,
          result.method,
          {
            ...context,
            output_format: result.format ?? telemetryFileFormat(result.name),
            generation_duration_ms: Math.round(performance.now() - startedAt),
            file_count: 1,
            output_completed: true,
            ...("byteLength" in result && typeof result.byteLength === "number"
              ? { file_size_bytes: result.byteLength }
              : {}),
          },
        );
      }
      return result;
    });
  };
  return {
    listRecentImages: ports.listRecentImages?.bind(ports),
    readRecentImage: ports.readRecentImage?.bind(ports),
    saveRecentImages: ports.saveRecentImages?.bind(ports),
    identifySource: ports.identifySource?.bind(ports),
    decodeProject: ports.decodeProject?.bind(ports),
    decode: ports.decode.bind(ports),
    analyze: ports.analyze.bind(ports),
    pixelate: ports.pixelate.bind(ports),
    registerFile: (file) => remember(ports.registerFile(file), DocumentOpenMethod.Import),
    registerAsset: (url, name) =>
      remember(ports.registerAsset(url, name), DocumentOpenMethod.Example),
    registerProject: (name, load) =>
      remember(ports.registerProject(name, load), DocumentOpenMethod.Import),
    pickFiles: () => {
      const picking = ports.pickFiles();
      return (
        picking?.then((files) =>
          files.map((source) => remember(source, DocumentOpenMethod.Import)),
        ) ?? null
      );
    },
    bindSourceToDocument: (source, documentKey) => {
      ports.bindSourceToDocument(source, documentKey);
      const metadata = sources.get(source);
      telemetry.prepareOpen(
        documentKey,
        metadata?.method ?? DocumentOpenMethod.Import,
        metadata?.format,
      );
    },
    releaseDocumentHandle: ports.releaseDocumentHandle.bind(ports),
    hydrateDocumentHandles: ports.hydrateDocumentHandles?.bind(ports),
    releaseSource: (source) => {
      sources.delete(source);
      ports.releaseSource?.(source);
    },
    write: (...args) => write(() => ports.write(...args), args[2], args[3]),
    ...(ports.writeProject
      ? {
          writeProject: (...args: Parameters<NonNullable<WorkspaceSessionPorts["writeProject"]>>) =>
            write(() => ports.writeProject!(...args), args[2], args[3]),
        }
      : {}),
    dispose: () => {
      sources.clear();
      ports.dispose?.();
    },
  };
}
