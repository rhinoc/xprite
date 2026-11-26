import type { PsdImportRequest, PsdImportResponse } from "$/adapters/workers/psd-import-protocol";
import {
  announceWorkerLoadFailure,
  WORKER_LOAD_ATTEMPTS,
  WORKER_LOAD_RETRY_DELAY_MS,
  workerLoadError,
} from "$/adapters/workers/worker-load-failure";
import {
  runManagedWorkerJob,
  WorkerFailureKind,
  type ManagedWorkerTransport,
} from "@xprite/bedrock/browser/managed-worker";
import { markImmutableEditorProject } from "@xprite/editor-core/document";
import { PsdCodecError, PsdIssueCode } from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

const IMPORT_TIMEOUT_MS = 120_000;
const WORKER_LOAD_DIAGNOSTIC = "The PSD import worker script could not be loaded";

export interface PsdImportWorkerOptions {
  /** Defaults to the bundled module worker; null when Worker is unavailable. */
  createWorker?: () => ManagedWorkerTransport<PsdImportRequest>;
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
  const workerFactory = options.createWorker ?? createPsdImportWorker;
  return runManagedWorkerJob<PsdImportRequest, PsdImportResponse, SessionProject>({
    workerFactory,
    signal,
    timeoutMs: IMPORT_TIMEOUT_MS,
    maxStartupAttempts: WORKER_LOAD_ATTEMPTS,
    retryDelayMs: options.retryDelayMs ?? WORKER_LOAD_RETRY_DELAY_MS,
    retryConstructionFailure: false,
    timeoutError: () => new Error("Opening this project took too long."),
    formatError: (info) =>
      info.kind === WorkerFailureKind.Startup
        ? workerLoadError(WORKER_LOAD_DIAGNOSTIC)
        : new Error("Unable to open PSD file."),
    onStartupFailureExhausted: (error) => announceWorkerLoadFailure(error),
    buildRequest: () => {
      const bytes = request.bytes.slice();
      return {
        request: { ...request, bytes },
        transfer: [bytes.buffer],
      };
    },
    readResponse(data) {
      if (!data.ok) {
        throw new PsdCodecError(data.message, data.code ?? PsdIssueCode.DecodeFailed, data.details);
      }
      return markImmutableEditorProject(data.project);
    },
  });
}
