import type {
  RecoveryCodecRequest,
  RecoveryCodecResponse,
  SerializedRecoveryCodecError,
} from "$/adapters/workers/recovery-codec-worker";
import type { EditorPersistenceSnapshot } from "@xprite/editor-core";

export interface RecoveryCodecWorkerLike {
  postMessage(request: RecoveryCodecRequest): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  terminate?(): void;
}
export interface RecoveryCodecClientOptions {
  /** null selects the in-process fallback for workerless embedded hosts/tests. */
  worker?: RecoveryCodecWorkerLike | null;
  workerFactory?: () => RecoveryCodecWorkerLike;
  onFatalError?: (error: Error) => void;
}

function restoreWorkerError(value: string | SerializedRecoveryCodecError): Error {
  if (typeof value === "string") return new Error(value);
  const error = new Error(value.message);
  error.name = value.name || "Error";
  if (typeof value.stack === "string") error.stack = value.stack;
  if (value.details) {
    (error as Error & { diagnosticDetails?: Readonly<Record<string, unknown>> }).diagnosticDetails =
      value.details;
  }
  return error;
}

/** Browser infrastructure only: no editor commands, storage or UI concerns. */
export class RecoveryCodecClient {
  private readonly worker: RecoveryCodecWorkerLike | null;
  private readonly onFatalError?: (error: Error) => void;
  private fallbackCodec?: Promise<typeof import("$/adapters/workers/recovery-codec")>;
  private closed = false;
  private failure: Error | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve(value: Uint8Array | EditorPersistenceSnapshot): void; reject(error: unknown): void }
  >();
  private readonly onMessage = (event: Event) => {
    const response = (event as MessageEvent<RecoveryCodecResponse>).data;
    if (!response || !Number.isSafeInteger(response.id)) return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(restoreWorkerError(response.error));
  };
  private readonly onError = () => {
    this.failure = new Error("Recovery codec worker failed");
    this.onFatalError?.(this.failure);
    this.rejectAll(this.failure);
  };
  constructor(options: RecoveryCodecClientOptions = {}) {
    if (options.worker !== undefined && options.workerFactory)
      throw new Error("Provide worker or workerFactory, not both");
    this.onFatalError = options.onFatalError;
    if (options.worker !== undefined) this.worker = options.worker;
    else if (options.workerFactory) this.worker = options.workerFactory();
    else if (typeof Worker === "undefined") this.worker = null;
    else {
      try {
        this.worker = new Worker(new URL("./recovery-codec-worker", import.meta.url), {
          type: "module",
        });
      } catch {
        this.worker = null;
      } // Capability/CSP construction failure: retain autosave.
    }
    this.worker?.addEventListener("message", this.onMessage);
    this.worker?.addEventListener("error", this.onError);
    this.worker?.addEventListener("messageerror", this.onError);
  }
  async encode(snapshot: EditorPersistenceSnapshot): Promise<Uint8Array> {
    this.assertOpen();
    if (!this.worker) return (await this.getFallbackCodec()).encodeRecoverySnapshot(snapshot);
    return this.request({
      id: this.nextId++,
      operation: "encode",
      snapshot,
    }) as Promise<Uint8Array>;
  }
  async decode(bytes: Uint8Array): Promise<EditorPersistenceSnapshot> {
    this.assertOpen();
    if (!this.worker) return (await this.getFallbackCodec()).decodeRecoverySnapshot(bytes);
    return this.request({
      id: this.nextId++,
      operation: "decode",
      bytes,
    }) as Promise<EditorPersistenceSnapshot>;
  }
  private getFallbackCodec() {
    return (this.fallbackCodec ??= import("$/adapters/workers/recovery-codec"));
  }
  private request(request: RecoveryCodecRequest): Promise<Uint8Array | EditorPersistenceSnapshot> {
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      try {
        // Structured cloning preserves shared cel identities; no transfer list can
        // detach live document buffers or the caller's stored snapshot bytes.
        this.worker!.postMessage(request);
      } catch (error) {
        this.pending.delete(request.id);
        reject(error);
      }
    });
  }
  private assertOpen(): void {
    if (this.closed) throw new Error("Recovery codec client is closed");
    if (this.failure) throw this.failure;
  }
  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectAll(new Error("Recovery codec client is closed"));
    this.worker?.removeEventListener("message", this.onMessage);
    this.worker?.removeEventListener("error", this.onError);
    this.worker?.removeEventListener("messageerror", this.onError);
    this.worker?.terminate?.();
  }
}
