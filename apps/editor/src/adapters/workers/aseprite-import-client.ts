import type {
  AsepriteImportRequest,
  AsepriteImportResponse,
} from "$/adapters/workers/aseprite-import-protocol";
import { runWorkerJob } from "@xprite/bedrock/browser/worker-job";
import { markImmutableEditorProject } from "@xprite/editor-core/document";
import { AsepriteCodecError } from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

const IMPORT_TIMEOUT_MS = 120_000;

/** null means Worker construction is unavailable: the existing bounded browser
 * decoder remains available. A running worker failure is never retried blindly. */
export function importAsepriteInWorker(
  request: AsepriteImportRequest,
  signal?: AbortSignal,
): Promise<SessionProject> | null {
  if (typeof Worker !== "function") return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./aseprite-import-worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
  // Keep original input available for source hashing and failed-file diagnostics.
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = request.bytes.slice();
  } catch (reason) {
    worker.terminate();
    return Promise.reject(reason);
  }
  return runWorkerJob<AsepriteImportRequest, AsepriteImportResponse, SessionProject>({
    worker,
    request: { ...request, bytes },
    transfer: [bytes.buffer],
    signal,
    timeoutMs: IMPORT_TIMEOUT_MS,
    timeoutError: () => new Error("Opening this project took too long."),
    transportError: () => new Error("Unable to open Aseprite project."),
    readResponse(data) {
      if (!data.ok) throw new AsepriteCodecError(data.message, data.issues, data.details);
      return markImmutableEditorProject(data.project);
    },
  });
}
