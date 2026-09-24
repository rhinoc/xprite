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

/** Stores opaque byte values in OPFS through a dedicated module worker. */
export class OpfsByteStore implements ByteStore {
  private worker?: Worker;
  private closed = false;
  private failed?: Error;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (bytes?: ArrayBuffer) => void; reject: (error: Error) => void }
  >();

  constructor(
    private readonly namespace = "bedrock-opfs",
    private readonly workerFactory = () =>
      new Worker(new URL("./opfs-worker", import.meta.url), { type: "module" }),
  ) {}

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.onmessage = (event: MessageEvent<OpfsResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.bytes);
      else {
        const error =
          response.name === "NotFoundError"
            ? new BrowserStorageError(BrowserStorageErrorCode.Corrupt, response.message)
            : new Error(response.message);
        if (!(error instanceof BrowserStorageError)) error.name = response.name;
        pending.reject(error);
      }
    };
    const fail = () => {
      this.failed = new BrowserStorageError(BrowserStorageErrorCode.Io, "OPFS worker failed");
      for (const request of this.pending.values()) request.reject(this.failed);
      this.pending.clear();
      worker.terminate();
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    this.worker = worker;
    return worker;
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
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      try {
        const worker = this.getWorker();
        this.pending.set(id, { resolve, reject });
        worker.postMessage(
          { id, operation, key, bytes, namespace: this.namespace } satisfies OpfsRequest,
          bytes ? [bytes] : [],
        );
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    await this.request("write", key, new Uint8Array(bytes).buffer);
  }

  async read(key: string): Promise<Uint8Array> {
    const bytes = await this.request("read", key);
    if (!bytes)
      throw new BrowserStorageError(BrowserStorageErrorCode.Corrupt, `OPFS key ${key} is missing`);
    return new Uint8Array(bytes);
  }

  async remove(key: string): Promise<void> {
    await this.request("remove", key);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.worker?.terminate();
    for (const pending of this.pending.values())
      pending.reject(
        new BrowserStorageError(BrowserStorageErrorCode.Closed, "OPFS store is closed"),
      );
    this.pending.clear();
  }
}
