import {
  downloadExportArtifact,
  type AnimationExportPorts,
} from "$/managers/files/export-animation";
import { TelemetryDownloadKind, TelemetryOperationOutcome } from "$/managers/ports/telemetry";
import { telemetryFileFormat } from "$/managers/telemetry/document-context";
import type { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import type { EditorDocument } from "@xprite/editor-core/document";

const ABORT_ERROR_NAME = "AbortError";

/** Reports one operation, including partial downloads, rather than one event per exported frame. */
export async function reportingExport<T>(
  telemetry: TelemetryManager,
  document: EditorDocument,
  documentKey: string | undefined,
  exporting: (ports: AnimationExportPorts) => Promise<T>,
): Promise<T> {
  if (!telemetry.enabled) return exporting({});
  const context = telemetry.documentContext(document, documentKey);
  const finish = telemetry.beginExport(context);
  const startedAt = performance.now();
  let bytes = 0;
  let fileCount = 0;
  const formats = new Set<string>();
  let completed = false;
  let outcome = TelemetryOperationOutcome.Success;
  try {
    const result = await exporting({
      save: async (artifact) => {
        await downloadExportArtifact(artifact);
        bytes += artifact.blob.size;
        fileCount++;
        formats.add(telemetryFileFormat(artifact.name));
      },
    });
    completed = true;
    return result;
  } catch (reason) {
    outcome =
      reason instanceof Error && reason.name === ABORT_ERROR_NAME
        ? TelemetryOperationOutcome.Cancelled
        : TelemetryOperationOutcome.Failed;
    throw reason;
  } finally {
    if (fileCount > 0)
      telemetry.recordOutput(TelemetryDownloadKind.Export, "download", {
        ...context,
        file_size_bytes: bytes,
        file_count: fileCount,
        output_format: [...formats].sort().join("+"),
        generation_duration_ms: Math.round(performance.now() - startedAt),
        output_completed: completed,
      });
    finish(outcome, {
      file_count: fileCount,
      file_size_bytes: bytes,
      output_format: [...formats].sort().join("+"),
      output_completed: completed,
    });
  }
}
