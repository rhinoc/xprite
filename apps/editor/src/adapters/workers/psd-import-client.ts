import type { PsdImportRequest, PsdImportResponse } from "$/adapters/workers/psd-import-protocol";
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
import { PsdCodecError, PsdIssueCode } from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

const IMPORT_TIMEOUT_MS = 120_000;
const WORKER_LOAD_DIAGNOSTIC = "The PSD import worker script could not be loaded";

export interface PsdImportWorkerOptions {
  /** Defaults to the bundled module worker; null when Worker is unavailable. */
  createWorker?: () => Worker;
  retryDelayMs?: number;
}

function createPsdImportWorker(): Worker {
  return new Worker(new URL("./psd-import-worker.ts", import.meta.url), { type: "module" });
}

/** Returns null when Worker construction is unavailable so the main-thread fallback can run. */
export function importPsdInWorker(
  request: PsdImportRequest,
  signal?: AbortSignal,
  options: PsdImportWorkerOptions = {},
): Promise<SessionProject> | null {
  if (!options.createWorker && typeof Worker !== "function") return null;
  const createWorker = options.createWorker ?? createPsdImportWorker;
  let worker: Worker;
  try {
    worker = createWorker();
  } catch {
    return null;
  }
  return runImport(request, signal, worker, createWorker, options.retryDelayMs);
}

async function runImport(
  request: PsdImportRequest,
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
  request: PsdImportRequest,
  signal: AbortSignal | undefined,
  worker: Worker,
): Promise<SessionProject> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = request.bytes.slice();
  } catch (reason) {
    worker.terminate();
    return Promise.reject(reason);
  }
  return runWorkerJob<PsdImportRequest, PsdImportResponse, SessionProject>({
    worker,
    request: { ...request, bytes },
    transfer: [bytes.buffer],
    signal,
    timeoutMs: IMPORT_TIMEOUT_MS,
    timeoutError: () => new Error("Opening this project took too long."),
    transportError: (event) =>
      isOpaqueWorkerError(event)
        ? workerLoadError(WORKER_LOAD_DIAGNOSTIC)
        : new Error("Unable to open PSD file."),
    readResponse(data) {
      if (!data.ok) {
        throw new PsdCodecError(data.message, data.code ?? PsdIssueCode.DecodeFailed, data.details);
      }
      return markImmutableEditorProject(data.project);
    },
  });
}
