import {
  DEFAULT_WORKER_STARTUP_ATTEMPTS,
  DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS,
  ManagedWorkerClient,
  waitForWorkerRetry,
  WorkerFailureKind,
  type ManagedWorkerTransport,
  type WorkerFailureInfo,
} from "$/managed-worker";
import type { OpfsRequest, OpfsResponse } from "$/opfs-worker";
import { BrowserStorageError, BrowserStorageErrorCode } from "$/storage-error";

export interface ByteStore {
  write(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
  close(): void;
}

export function supportsOpfs(): boolean {
  const prototype =
    typeof FileSystemFileHandle === "undefined"
      ? undefined
      : (FileSystemFileHandle.prototype as FileSystemFileHandle & {
          createSyncAccessHandle?: unknown;
        });
  return (
    typeof Worker !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    !!navigator.locks &&
    (typeof prototype?.createWritable === "function" ||
      typeof prototype?.createSyncAccessHandle === "function")
  );
}

/**
 * Safari Private Browsing (and other ephemeral WebKit contexts) expose the
 * OPFS API surface but reject getDirectory() with UnknownError. API presence
 * alone is therefore not enough to prefer OPFS over IndexedDB.
 */
export function isOpfsUnavailableError(name: string, message: string): boolean {
  if (
    name === "UnknownError" ||
    name === "SecurityError" ||
    name === "NotAllowedError" ||
    name === "NotSupportedError"
  )
    return true;
  return /unknown transient reason|out of memory/i.test(message);
}

/** Probe whether OPFS can actually open a directory in this browsing context. */
export async function probeOpfs(): Promise<boolean> {
  if (!supportsOpfs()) return false;
  try {
    await navigator.storage.getDirectory();
    return true;
  } catch {
    // Safari Private Browsing and other ephemeral contexts reject getDirectory().
    return false;
  }
}

function toOpfsError(name: string, message: string): Error {
  if (name === "NotFoundError")
    return new BrowserStorageError(BrowserStorageErrorCode.Corrupt, message);
  if (isOpfsUnavailableError(name, message))
    return new BrowserStorageError(BrowserStorageErrorCode.Unavailable, message);
  const error = new Error(message);
  error.name = name;
  return error;
}

const OPFS_OPERATION_ATTEMPTS = DEFAULT_WORKER_STARTUP_ATTEMPTS;
const OPFS_RETRY_DELAY_MS = DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS;
const OPFS_NOT_READABLE_ERROR = "NotReadableError";
const OPFS_READ_RESPONSE_STAGE = "read-response";

/** The worker answered, but its newly obtained file snapshot could not be read. */
class OpfsReadFailure extends Error {
  readonly diagnosticDetails: Readonly<Record<string, unknown>>;
  constructor(message: string, requestId: number) {
    super(message);
    this.name = OPFS_NOT_READABLE_ERROR;
    this.diagnosticDetails = {
      opfs: {
        stage: OPFS_READ_RESPONSE_STAGE,
        operation: "read",
        workerAnswered: true,
        requestId,
      },
    };
  }
}

/** A broken worker transport; a worker that never loaded is classified as Unavailable. */
class OpfsWorkerFailure extends BrowserStorageError {
  readonly failureKind: WorkerFailureKind;
  constructor(info: WorkerFailureInfo, operation?: OpfsRequest["operation"], requestId?: number) {
    super(
      info.kind === WorkerFailureKind.Startup
        ? BrowserStorageErrorCode.Unavailable
        : BrowserStorageErrorCode.Io,
      "OPFS worker failed",
      {
        cause: info.cause,
        diagnosticDetails: {
          opfs: {
            stage: info.stage,
            workerAnswered: info.workerAnswered,
            message: info.message,
            filename: info.filename,
            line: info.line,
            column: info.column,
            ...(operation !== undefined ? { operation } : {}),
            ...(requestId !== undefined ? { requestId } : {}),
          },
        },
      },
    );
    this.failureKind = info.kind;
  }
}

function createOpfsWorker(): Worker {
  return new Worker(new URL("./opfs-worker", import.meta.url), { type: "module" });
}

function closedOpfsError(): BrowserStorageError {
  return new BrowserStorageError(BrowserStorageErrorCode.Closed, "OPFS store is closed");
}

/** Stores opaque byte values in OPFS through a dedicated module worker. */
export class OpfsByteStore implements ByteStore {
  private readonly client: ManagedWorkerClient<OpfsRequest, OpfsResponse>;
  private readonly closeController = new AbortController();

  constructor(
    private readonly namespace = "bedrock-opfs",
    workerFactory: () => ManagedWorkerTransport<OpfsRequest> = createOpfsWorker,
  ) {
    this.client = new ManagedWorkerClient<OpfsRequest, OpfsResponse>({
      workerFactory,
      lazy: true,
      maxStartupAttempts: OPFS_OPERATION_ATTEMPTS,
      retryDelayMs: OPFS_RETRY_DELAY_MS,
      retryConstructionFailure: true,
      recreateAfterRuntimeFailure: true,
      closedError: closedOpfsError,
      formatError: (info, requestId) => new OpfsWorkerFailure(info, undefined, requestId),
    });
  }

  private send(
    operation: OpfsRequest["operation"],
    key: string,
    getBytes?: () => ArrayBuffer,
  ): Promise<ArrayBuffer | undefined> {
    return this.client.request<ArrayBuffer | undefined>({
      buildRequest: (id) => {
        const bytes = getBytes?.();
        return {
          request: {
            id,
            operation,
            key,
            bytes,
            namespace: this.namespace,
          } satisfies OpfsRequest,
          transfer: bytes ? [bytes] : [],
        };
      },
      formatError: (info, requestId) => new OpfsWorkerFailure(info, operation, requestId),
      readResponse: (response) => {
        if (response.ok) return response.bytes;
        throw operation === "read" && response.name === OPFS_NOT_READABLE_ERROR
          ? new OpfsReadFailure(response.message, response.id)
          : toOpfsError(response.name, response.message);
      },
    });
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    await this.send("write", key, () => new Uint8Array(bytes).buffer);
  }

  async read(key: string): Promise<Uint8Array> {
    for (let attempt = 0; ; attempt++) {
      try {
        const bytes = await this.send("read", key);
        if (!bytes)
          throw new BrowserStorageError(
            BrowserStorageErrorCode.Corrupt,
            `OPFS key ${key} is missing`,
          );
        return new Uint8Array(bytes);
      } catch (error) {
        if (this.client.isClosed) throw closedOpfsError();
        // Startup failures were already bounded and retried by ManagedWorkerClient.
        if (error instanceof OpfsWorkerFailure && error.failureKind === WorkerFailureKind.Startup) {
          throw error;
        }
        if (
          !(error instanceof OpfsWorkerFailure || error instanceof OpfsReadFailure) ||
          attempt + 1 >= OPFS_OPERATION_ATTEMPTS
        ) {
          throw error;
        }
        if (error instanceof OpfsReadFailure) {
          // Let a transient snapshot read failure settle before reissuing on the same worker.
          try {
            await waitForWorkerRetry(OPFS_RETRY_DELAY_MS, this.closeController.signal);
          } catch {
            throw closedOpfsError();
          }
          if (this.client.isClosed) throw closedOpfsError();
        }
      }
    }
  }

  async remove(key: string): Promise<void> {
    await this.send("remove", key);
  }

  close(): void {
    if (this.client.isClosed) return;
    this.closeController.abort();
    this.client.close(closedOpfsError());
  }
}
