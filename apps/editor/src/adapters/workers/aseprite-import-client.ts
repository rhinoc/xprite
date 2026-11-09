import type {
  AsepriteImportRequest,
  AsepriteImportResponse,
} from "$/adapters/workers/aseprite-import-protocol";
import {
  announceWorkerLoadFailure,
  isWorkerLoadError,
  waitBeforeWorkerRetry,
  WORKER_LOAD_ATTEMPTS,
  WORKER_LOAD_RETRY_DELAY_MS,
  workerLoadError,
} from "$/adapters/workers/worker-load-failure";
import { runWorkerJob } from "@xprite/bedrock/browser/worker-job";
import { isOpaqueWorkerError } from "@xprite/bedrock/browser/worker-request-channel";
import { markImmutableEditorProject } from "@xprite/editor-core/document";
import { AsepriteCodecError } from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

const IMPORT_TIMEOUT_MS = 120_000;
const WORKER_LOAD_DIAGNOSTIC = "The Aseprite import worker script could not be loaded";

export interface AsepriteImportWorkerOptions {
  /** Defaults to the bundled module worker; null when Worker is unavailable. */
  createWorker?: () => Worker;
  retryDelayMs?: number;
}

function createAsepriteImportWorker(): Worker {
  return new Worker(new URL("./aseprite-import-worker.ts", import.meta.url), { type: "module" });
}

/** null means Worker construction is unavailable: the existing bounded browser
 * decoder remains available. A running worker failure is never retried blindly. */
export function importAsepriteInWorker(
  request: AsepriteImportRequest,
  signal?: AbortSignal,
  options: AsepriteImportWorkerOptions = {},
): Promise<SessionProject> | null {
  if (!options.createWorker && typeof Worker !== "function") return null;
  const createWorker = options.createWorker ?? createAsepriteImportWorker;
  let worker: Worker;
  try {
    worker = createWorker();
  } catch {
    return null;
  }
  return runImport(request, signal, worker, createWorker, options.retryDelayMs);
}

async function runImport(
  request: AsepriteImportRequest,
  signal: AbortSignal | undefined,
  firstWorker: Worker,
  createWorker: () => Worker,
  retryDelayMs = WORKER_LOAD_RETRY_DELAY_MS,
): Promise<SessionProject> {
  let worker = firstWorker;
  for (let attempt = 1; ; attempt++) {
    try {
      return await runImportJob(request, signal, worker);
    } catch (error) {
      if (!isWorkerLoadError(error)) throw error;
      // A script load the browser cancelled succeeds after a pause. After the last attempt,
      // announce the stale build; decodeAsepriteBlob opens the file on the main thread.
      if (attempt >= WORKER_LOAD_ATTEMPTS) throw announceWorkerLoadFailure(error);
      await waitBeforeWorkerRetry(retryDelayMs, signal);
      try {
        worker = createWorker();
      } catch {
        throw announceWorkerLoadFailure(error);
      }
    }
  }
}

function runImportJob(
  request: AsepriteImportRequest,
  signal: AbortSignal | undefined,
  worker: Worker,
): Promise<SessionProject> {
  // Keep original input available for source hashing, retries and failed-file diagnostics.
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
    transportError: (event) =>
      // A bare error Event (no message/file) is the browser's signal that the worker script,
      // or a module it imports, could not be fetched or that the fetch was cancelled.
      isOpaqueWorkerError(event)
        ? workerLoadError(WORKER_LOAD_DIAGNOSTIC)
        : new Error("Unable to open Aseprite project."),
    readResponse(data) {
      if (!data.ok) throw new AsepriteCodecError(data.message, data.issues, data.details);
      return markImmutableEditorProject(data.project);
    },
  });
}
