import type { PackedRecentSnapshot, RecentSnapshot } from "$/adapters/workers/recent-snapshot";
import type {
  RecoveryCodecRequest,
  RecoveryCodecResponse,
  SerializedRecoveryCodecError,
} from "$/adapters/workers/recovery-codec-worker";
import type { RecoveryCompression } from "$/adapters/workers/recovery-compression";
import { RecoverySnapshotDeltaSender } from "$/adapters/workers/recovery-snapshot-delta";
import {
  announceWorkerLoadFailure,
  importWithRetry,
  WORKER_LOAD_ATTEMPTS,
  WORKER_LOAD_RETRY_DELAY_MS,
  workerLoadError,
} from "$/adapters/workers/worker-load-failure";
import {
  ManagedWorkerClient,
  WorkerFailureKind,
  type ManagedWorkerTransport,
} from "@xprite/bedrock/browser/managed-worker";
import {
  clonePersistenceSnapshot,
  isCommittedPersistenceSnapshot,
  type EditorPersistenceSnapshot,
} from "@xprite/editor-core";
import { cloneGraph } from "@xprite/editor-core/base";
import { hydratePixelStorage } from "@xprite/editor-core/document";

type CodecResult = Uint8Array | EditorPersistenceSnapshot | PackedRecentSnapshot | RecentSnapshot;
const PIXEL_BATCH_BYTES = 8 * 1024 * 1024;
const MAIN_THREAD_YIELD_MS = 0;
const WORKER_LOAD_DIAGNOSTIC = "The recovery codec worker script could not be loaded";

/** The caller must retain borrowed recent snapshot containers and buffers unchanged
 * until packing resolves. Mutable public inputs use detached copies by default. */
export enum RecoveryCodecSnapshotOwnership {
  Copy = "copy",
  Immutable = "immutable",
}

export interface RecoveryCodecClientOptions {
  /** null selects the in-process fallback for workerless embedded hosts/tests. */
  worker?: ManagedWorkerTransport<RecoveryCodecRequest> | null;
  workerFactory?: () => ManagedWorkerTransport<RecoveryCodecRequest>;
  onFatalError?: (error: Error) => void;
  /** Delay before a worker whose script failed to load is started again. */
  workerLoadRetryDelayMs?: number;
}

function createRecoveryCodecWorker(): Worker {
  return new Worker(new URL("./recovery-codec-worker", import.meta.url), { type: "module" });
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
  private readonly client: ManagedWorkerClient<RecoveryCodecRequest, RecoveryCodecResponse>;
  private readonly workerLoadRetryDelayMs: number;
  private fallbackCodec?: Promise<typeof import("$/adapters/workers/recovery-codec")>;
  private fallbackCompression?: RecoveryCompression;
  private readonly snapshotDelta = new RecoverySnapshotDeltaSender();
  private encodeQueue: Promise<unknown> = Promise.resolve();

  constructor(options: RecoveryCodecClientOptions = {}) {
    if (options.worker !== undefined && options.workerFactory)
      throw new Error("Provide worker or workerFactory, not both");
    this.workerLoadRetryDelayMs = options.workerLoadRetryDelayMs ?? WORKER_LOAD_RETRY_DELAY_MS;
    const workerFactory =
      options.worker !== undefined
        ? undefined
        : (options.workerFactory ??
          (typeof Worker !== "undefined" ? createRecoveryCodecWorker : undefined));

    this.client = new ManagedWorkerClient<RecoveryCodecRequest, RecoveryCodecResponse>({
      worker: options.worker,
      workerFactory,
      lazy: false,
      maxStartupAttempts: WORKER_LOAD_ATTEMPTS,
      retryDelayMs: this.workerLoadRetryDelayMs,
      retryConstructionFailure: false,
      fallbackOnUnavailable: true,
      recreateAfterRuntimeFailure: true,
      closedError: () => new Error("Recovery codec client is closed"),
      formatError: (info) =>
        info.kind === WorkerFailureKind.Startup
          ? workerLoadError(WORKER_LOAD_DIAGNOSTIC)
          : new Error("Recovery codec worker failed"),
      onWorkerReset: () => {
        this.snapshotDelta.clear();
      },
      onStartupFailureExhausted: (error) => announceWorkerLoadFailure(error),
      onFatalError: (error) => options.onFatalError?.(error),
    });
  }

  async encode(snapshot: EditorPersistenceSnapshot): Promise<Uint8Array> {
    this.assertOpen();
    // Capture mutable input before the first import/await. Hashing and deflate both read these
    // bytes later; they must observe the same frozen content. A timeline-less document is
    // cloned as a plain graph.
    const owned = isCommittedPersistenceSnapshot(snapshot)
      ? snapshot
      : snapshot.document.timeline
        ? clonePersistenceSnapshot(snapshot)
        : cloneGraph(snapshot);
    if (this.client.isUsingFallback) return this.encodeInProcess(owned);
    // Preserve delta order while yielding between pixel batches. Other kinds
    // of requests can proceed without invalidating this sender/receiver pair.
    const result = this.encodeQueue.then(() => this.encodeQueued(owned));
    this.encodeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private encodeQueued(owned: EditorPersistenceSnapshot): Promise<Uint8Array> {
    return this.client
      .request<Uint8Array>({
        buildRequest: (id) => {
          const request: RecoveryCodecRequest = isCommittedPersistenceSnapshot(owned)
            ? {
                id,
                operation: "encode-delta",
                delta: this.snapshotDelta.encode(owned),
              }
            : { id, operation: "encode", snapshot: owned };
          if (request.operation !== "encode-delta") return { request };

          const bytes = [...request.delta.additions.values()].reduce(
            (sum, value) =>
              sum + (value instanceof ArrayBuffer ? value.byteLength : value.buffer.byteLength),
            0,
          );
          if (bytes <= PIXEL_BATCH_BYTES) return { request };

          const additions = request.delta.additions;
          const stagedRequest: RecoveryCodecRequest = {
            ...request,
            delta: { ...request.delta, additions: new Map() },
            staged: true,
          };
          return {
            request: stagedRequest,
            beforePost: async (worker) => {
              let batch = new Map<number, ArrayBufferView | ArrayBuffer>();
              let size = 0;
              const flush = async () => {
                this.assertOpen();
                worker.postMessage({
                  id,
                  operation: "stage-delta",
                  additions: batch,
                });
                batch = new Map();
                size = 0;
                await new Promise<void>((resolve) => setTimeout(resolve, MAIN_THREAD_YIELD_MS));
              };
              for (const [entryId, value] of additions) {
                const length =
                  value instanceof ArrayBuffer ? value.byteLength : value.buffer.byteLength;
                if (batch.size && size + length > PIXEL_BATCH_BYTES) await flush();
                batch.set(entryId, value);
                size += length;
              }
              if (batch.size) await flush();
            },
          };
        },
        readResponse: (response) => this.readCodecResponse(response, "encode") as Uint8Array,
        fallback: () => this.encodeInProcess(owned),
      })
      .catch((error: unknown) => {
        this.snapshotDelta.clear();
        throw error;
      });
  }

  private async encodeInProcess(owned: EditorPersistenceSnapshot): Promise<Uint8Array> {
    const codec = await this.getFallbackCodec();
    const { RecoveryCompression } = await this.importFallback(
      () => import("$/adapters/workers/recovery-compression"),
    );
    this.assertOpen();
    this.fallbackCompression ??= new RecoveryCompression();
    return codec.encodeRecoverySnapshot(owned, this.fallbackCompression.deflateImmutable);
  }

  async decode(bytes: Uint8Array): Promise<EditorPersistenceSnapshot> {
    this.assertOpen();
    return this.client
      .request<EditorPersistenceSnapshot>({
        buildRequest: (id) => ({
          request: { id, operation: "decode", bytes },
        }),
        readResponse: (response) =>
          this.readCodecResponse(response, "decode") as EditorPersistenceSnapshot,
        fallback: async () => (await this.getFallbackCodec()).decodeRecoverySnapshot(bytes),
      })
      .catch((error: unknown) => {
        this.snapshotDelta.clear();
        throw error;
      });
  }

  async packRecent(
    snapshot: RecentSnapshot,
    ownership = RecoveryCodecSnapshotOwnership.Copy,
  ): Promise<PackedRecentSnapshot> {
    this.assertOpen();
    const captureOwned = () =>
      ownership === RecoveryCodecSnapshotOwnership.Immutable ? snapshot : cloneGraph(snapshot);
    if (this.client.isUsingFallback) {
      return this.packRecentInProcess(captureOwned());
    }
    const owned = captureOwned();
    return this.client
      .request<PackedRecentSnapshot>({
        buildRequest: (id) => ({
          request: { id, operation: "pack-recent", snapshot: owned },
        }),
        readResponse: (response) =>
          this.readCodecResponse(response, "pack-recent") as PackedRecentSnapshot,
        fallback: () => this.packRecentInProcess(owned),
      })
      .catch((error: unknown) => {
        this.snapshotDelta.clear();
        throw error;
      });
  }

  private async packRecentInProcess(owned: RecentSnapshot): Promise<PackedRecentSnapshot> {
    const { packRecentSnapshot } = await this.importFallback(
      () => import("$/adapters/workers/recent-snapshot"),
    );
    const { RecoveryCompression } = await this.importFallback(
      () => import("$/adapters/workers/recovery-compression"),
    );
    this.assertOpen();
    this.fallbackCompression ??= new RecoveryCompression();
    return packRecentSnapshot(owned, this.fallbackCompression);
  }

  async unpackRecent(snapshot: PackedRecentSnapshot): Promise<RecentSnapshot> {
    this.assertOpen();
    return this.client
      .request<RecentSnapshot>({
        buildRequest: (id) => ({
          request: { id, operation: "unpack-recent", snapshot },
        }),
        readResponse: (response) =>
          this.readCodecResponse(response, "unpack-recent") as RecentSnapshot,
        fallback: async () => {
          const { unpackRecentSnapshot } = await this.importFallback(
            () => import("$/adapters/workers/recent-snapshot"),
          );
          this.assertOpen();
          return unpackRecentSnapshot(snapshot);
        },
      })
      .catch((error: unknown) => {
        this.snapshotDelta.clear();
        throw error;
      });
  }

  private readCodecResponse(
    response: RecoveryCodecResponse,
    operation: RecoveryCodecRequest["operation"],
  ): CodecResult {
    if (!response.ok) {
      this.snapshotDelta.clear();
      throw restoreWorkerError(response.error);
    }
    // Packed recent snapshots require pixel hydration only after decoding.
    return operation === "decode" || operation === "unpack-recent"
      ? hydratePixelStorage(response.result)
      : response.result;
  }

  private importFallback<T>(load: () => Promise<T>): Promise<T> {
    return importWithRetry(load, this.workerLoadRetryDelayMs);
  }

  private getFallbackCodec() {
    // A failed load is not cached: the next operation tries the import again.
    return (this.fallbackCodec ??= this.importFallback(
      () => import("$/adapters/workers/recovery-codec"),
    ).catch((error: unknown) => {
      this.fallbackCodec = undefined;
      throw error;
    }));
  }

  private assertOpen(): void {
    if (this.client.isClosed) throw new Error("Recovery codec client is closed");
  }

  close(): void {
    if (this.client.isClosed) return;
    this.fallbackCompression?.clear();
    this.snapshotDelta.clear();
    this.client.close(new Error("Recovery codec client is closed"));
  }
}
