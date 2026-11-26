import type {
  AsepriteImportRequest,
  AsepriteImportResponse,
} from "$/adapters/workers/aseprite-import-protocol";
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
import { AsepriteCodecError } from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

const IMPORT_TIMEOUT_MS = 120_000;
const WORKER_LOAD_DIAGNOSTIC = "The Aseprite import worker script could not be loaded";

export interface AsepriteImportWorkerOptions {
  /** Defaults to the bundled module worker; null when Worker is unavailable. */
  createWorker?: () => ManagedWorkerTransport<AsepriteImportRequest>;
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
  const workerFactory = options.createWorker ?? createAsepriteImportWorker;
  return runManagedWorkerJob<AsepriteImportRequest, AsepriteImportResponse, SessionProject>({
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
        : new Error("Unable to open Aseprite project."),
    onStartupFailureExhausted: (error) => announceWorkerLoadFailure(error),
    buildRequest: () => {
      // Keep original input available for source hashing, retries and failed-file diagnostics.
      const bytes = request.bytes.slice();
      return {
        request: { ...request, bytes },
        transfer: [bytes.buffer],
      };
    },
    readResponse(data) {
      if (!data.ok) throw new AsepriteCodecError(data.message, data.issues, data.details);
      return markImmutableEditorProject(data.project);
    },
  });
}
