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

const OPFS_OPERATION_ATTEMPTS = 2;
const OPFS_RETRY_DELAY_MS = 1000;
const OPFS_NOT_READABLE_ERROR = "NotReadableError";

enum OpfsWorkerFailureStage {
  Construction = "construction",
  PostMessage = "post-message",
  Error = "error",
  MessageError = "messageerror",
  ReadResponse = "read-response",
}

/** The worker answered, but its newly obtained file snapshot could not be read. */
class OpfsReadFailure extends Error {
  readonly diagnosticDetails: Readonly<Record<string, unknown>>;
  constructor(message: string, requestId: number) {
    super(message);
    this.name = OPFS_NOT_READABLE_ERROR;
    this.diagnosticDetails = {
      opfs: {
        stage: OpfsWorkerFailureStage.ReadResponse,
        operation: "read",
        workerAnswered: true,
        requestId,
      },
    };
  }
}

/**
 * The worker script never started, so the request cannot have run. Construction never
 * creates a worker. An opaque `error` event with no message, file or error object is
 * how browsers report a module worker that never loaded; terminating it drops any
 * queued message. After a worker has answered, or after a script error that names a
 * file, a write may already have reached disk — those stay I/O failures.
 */
function isNeverExecutedWorkerLoad(details: Readonly<Record<string, unknown>>): boolean {
  if (details.stage === OpfsWorkerFailureStage.Construction) return true;
  return (
    details.stage === OpfsWorkerFailureStage.Error &&
    details.workerAnswered === false &&
    !details.message &&
    !details.filename
  );
}

function isNeverExecutedWorkerLoadError(error: unknown): error is OpfsWorkerFailure {
  return (
    error instanceof OpfsWorkerFailure &&
    isNeverExecutedWorkerLoad(
      (error.diagnosticDetails?.opfs ?? {}) as Readonly<Record<string, unknown>>,
    )
  );
}

/** A broken worker transport; a worker that never loaded may be started again. */
class OpfsWorkerFailure extends BrowserStorageError {
  constructor(cause: unknown, details: Readonly<Record<string, unknown>>) {
    super(
      isNeverExecutedWorkerLoad(details)
        ? BrowserStorageErrorCode.Unavailable
        : BrowserStorageErrorCode.Io,
      "OPFS worker failed",
      {
        cause,
        diagnosticDetails: { opfs: details },
      },
    );
  }
}

function waitBeforeRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/** Stores opaque byte values in OPFS through a dedicated module worker. */
export class OpfsByteStore implements ByteStore {
  private worker?: Worker;
  private closed = false;
  private workerAnswered = false;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      operation: OpfsRequest["operation"];
      resolve: (bytes?: ArrayBuffer) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(
    private readonly namespace = "bedrock-opfs",
    private readonly workerFactory = () =>
      new Worker(new URL("./opfs-worker", import.meta.url), { type: "module" }),
  ) {}

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    this.workerAnswered = false;
    worker.onmessage = (event: MessageEvent<OpfsResponse>) => {
      if (this.worker !== worker) return;
      this.workerAnswered = true;
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.bytes);
      else {
        const error =
          pending.operation === "read" && response.name === OPFS_NOT_READABLE_ERROR
            ? new OpfsReadFailure(response.message, response.id)
            : toOpfsError(response.name, response.message);
        pending.reject(error);
      }
    };
    worker.onerror = (event) => this.failWorker(worker, event, OpfsWorkerFailureStage.Error);
    worker.onmessageerror = (event) =>
      this.failWorker(worker, event, OpfsWorkerFailureStage.MessageError);
    this.worker = worker;
    return worker;
  }

  private detachWorker(worker: Worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    if (this.worker === worker) this.worker = undefined;
    worker.terminate();
  }

  private failWorker(worker: Worker, cause: unknown, stage: OpfsWorkerFailureStage) {
    if (this.worker !== worker) return;
    const event = cause as Partial<ErrorEvent> | undefined;
    const details = {
      stage,
      workerAnswered: this.workerAnswered,
      message: typeof event?.message === "string" ? event.message : undefined,
      filename:
        typeof event?.filename === "string" ? event.filename.split(/[?#]/, 1)[0] : undefined,
      line: event?.lineno,
      column: event?.colno,
    };
    const pending = [...this.pending.entries()];
    this.pending.clear();
    this.detachWorker(worker);
    for (const [requestId, request] of pending)
      request.reject(
        new OpfsWorkerFailure(event?.error ?? cause, {
          ...details,
          operation: request.operation,
          requestId,
        }),
      );
  }

  private request(
    operation: OpfsRequest["operation"],
    key: string,
    bytes?: ArrayBuffer,
  ): Promise<ArrayBuffer | undefined> {
    if (this.closed)
      return Promise.reject(
        new BrowserStorageError(BrowserStorageErrorCode.Closed, "OPFS store is closed"),
      );
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      let worker: Worker | undefined;
      try {
        worker = this.getWorker();
        this.pending.set(id, { operation, resolve, reject });
        worker.postMessage(
          { id, operation, key, bytes, namespace: this.namespace } satisfies OpfsRequest,
          bytes ? [bytes] : [],
        );
      } catch (error) {
        if (worker) this.failWorker(worker, error, OpfsWorkerFailureStage.PostMessage);
        else
          reject(
            new OpfsWorkerFailure(error, {
              stage: OpfsWorkerFailureStage.Construction,
              workerAnswered: false,
              operation,
              requestId: id,
            }),
          );
      }
    });
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    await this.requestWithStartupRetry(() =>
      this.request("write", key, new Uint8Array(bytes).buffer),
    );
  }

  async read(key: string): Promise<Uint8Array> {
    for (let attempt = 0; ; attempt++) {
      try {
        const bytes = await this.request("read", key);
        if (!bytes)
          throw new BrowserStorageError(
            BrowserStorageErrorCode.Corrupt,
            `OPFS key ${key} is missing`,
          );
        return new Uint8Array(bytes);
      } catch (error) {
        if (
          !(error instanceof OpfsWorkerFailure || error instanceof OpfsReadFailure) ||
          attempt + 1 >= OPFS_OPERATION_ATTEMPTS ||
          this.closed
        )
          throw error;
        if (error instanceof OpfsReadFailure || isNeverExecutedWorkerLoadError(error)) {
          // Let a cancelled script load or a transient snapshot failure settle.
          // A replacement worker is started only after the previous one is detached.
          await waitBeforeRetry(OPFS_RETRY_DELAY_MS);
        }
      }
    }
  }

  async remove(key: string): Promise<void> {
    await this.requestWithStartupRetry(() => this.request("remove", key));
  }

  /**
   * Retry only when the worker script never ran. Writes and deletes that may already
   * have reached the worker are not replayed.
   */
  private async requestWithStartupRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run();
      } catch (error) {
        if (
          !isNeverExecutedWorkerLoadError(error) ||
          attempt + 1 >= OPFS_OPERATION_ATTEMPTS ||
          this.closed
        )
          throw error;
        await waitBeforeRetry(OPFS_RETRY_DELAY_MS);
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.worker) this.detachWorker(this.worker);
    for (const pending of this.pending.values())
      pending.reject(
        new BrowserStorageError(BrowserStorageErrorCode.Closed, "OPFS store is closed"),
      );
    this.pending.clear();
  }
}
