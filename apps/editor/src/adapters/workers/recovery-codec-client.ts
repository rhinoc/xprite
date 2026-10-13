import type { PackedRecentSnapshot, RecentSnapshot } from "$/adapters/workers/recent-snapshot";
import type {
  RecoveryCodecRequest,
  RecoveryCodecResponse,
  SerializedRecoveryCodecError,
} from "$/adapters/workers/recovery-codec-worker";
import type { RecoveryCompression } from "$/adapters/workers/recovery-compression";
import { RecoverySnapshotDeltaSender } from "$/adapters/workers/recovery-snapshot-delta";
import {
  WorkerRequestChannel,
  type WorkerRequestTransport,
} from "@xprite/bedrock/browser/worker-request-channel";
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

/** The caller must retain borrowed recent snapshot containers and buffers unchanged
 * until packing resolves. Mutable public inputs use detached copies by default. */
export enum RecoveryCodecSnapshotOwnership {
  Copy = "copy",
  Immutable = "immutable",
}

export interface RecoveryCodecClientOptions {
  /** null selects the in-process fallback for workerless embedded hosts/tests. */
  worker?: WorkerRequestTransport<RecoveryCodecRequest> | null;
  workerFactory?: () => WorkerRequestTransport<RecoveryCodecRequest>;
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
  private worker: WorkerRequestTransport<RecoveryCodecRequest> | null;
  private readonly workerFactory?: () => WorkerRequestTransport<RecoveryCodecRequest>;
  private readonly onFatalError?: (error: Error) => void;
  private fallbackCodec?: Promise<typeof import("$/adapters/workers/recovery-codec")>;
  private fallbackCompression?: RecoveryCompression;
  private readonly snapshotDelta = new RecoverySnapshotDeltaSender();
  private closed = false;
  private failure: Error | null = null;
  private channel: WorkerRequestChannel<RecoveryCodecRequest, RecoveryCodecResponse> | null = null;
  private encodeQueue: Promise<unknown> = Promise.resolve();
  constructor(options: RecoveryCodecClientOptions = {}) {
    if (options.worker !== undefined && options.workerFactory)
      throw new Error("Provide worker or workerFactory, not both");
    this.onFatalError = options.onFatalError;
    this.workerFactory =
      options.workerFactory ??
      (options.worker === undefined && typeof Worker !== "undefined"
        ? () => new Worker(new URL("./recovery-codec-worker", import.meta.url), { type: "module" })
        : undefined);
    if (options.worker !== undefined) this.worker = options.worker;
    else if (!this.workerFactory) this.worker = null;
    else {
      try {
        this.worker = this.workerFactory();
      } catch {
        this.worker = null;
      } // Capability/CSP construction failure: retain autosave.
    }
    this.attachChannel();
  }
  private attachChannel() {
    const firstRequestId = this.channel?.nextRequestId() ?? 1;
    this.channel = this.worker
      ? new WorkerRequestChannel(this.worker, {
          firstRequestId,
          closedError: () => new Error("Recovery codec client is closed"),
          transportError: () => new Error("Recovery codec worker failed"),
          onFatalError: (error) => {
            this.snapshotDelta.clear();
            this.failure = error;
            this.onFatalError?.(error);
          },
        })
      : null;
  }
  async encode(snapshot: EditorPersistenceSnapshot): Promise<Uint8Array> {
    this.assertOpen();
    if (!this.worker) {
      // Capture mutable input before the first import/await. Hashing and deflate
      // both read these bytes later; they must observe the same frozen content.
      const immutable = isCommittedPersistenceSnapshot(snapshot);
      const owned = immutable
        ? snapshot
        : snapshot.document.timeline
          ? clonePersistenceSnapshot(snapshot)
          : cloneGraph(snapshot);
      const codec = await this.getFallbackCodec();
      const { RecoveryCompression } = await import("$/adapters/workers/recovery-compression");
      this.assertOpen();
      this.fallbackCompression ??= new RecoveryCompression();
      return codec.encodeRecoverySnapshot(owned, this.fallbackCompression.deflateImmutable);
    }
    // Preserve delta order while yielding between pixel batches. Other kinds
    // of requests can proceed without invalidating this sender/receiver pair.
    // Same ownership rule as the in-thread path: a timeline-less document is cloned as a plain graph.
    const owned = isCommittedPersistenceSnapshot(snapshot)
      ? snapshot
      : snapshot.document.timeline
        ? clonePersistenceSnapshot(snapshot)
        : cloneGraph(snapshot);
    const job = this.encodeQueue.then(async () => {
      this.assertOpen();
      const request: RecoveryCodecRequest = isCommittedPersistenceSnapshot(owned)
        ? {
            id: this.channel!.nextRequestId(),
            operation: "encode-delta",
            delta: this.snapshotDelta.encode(owned),
          }
        : { id: this.channel!.nextRequestId(), operation: "encode", snapshot: owned };
      if (request.operation === "encode-delta") {
        const bytes = [...request.delta.additions.values()].reduce(
          (sum, value) =>
            sum + (value instanceof ArrayBuffer ? value.byteLength : value.buffer.byteLength),
          0,
        );
        if (bytes > PIXEL_BATCH_BYTES) {
          let batch = new Map<number, ArrayBufferView | ArrayBuffer>();
          let size = 0;
          const flush = async () => {
            this.assertOpen();
            this.worker!.postMessage({
              id: request.id,
              operation: "stage-delta",
              additions: batch,
            });
            batch = new Map();
            size = 0;
            await new Promise<void>((resolve) => setTimeout(resolve, MAIN_THREAD_YIELD_MS));
          };
          for (const [id, value] of request.delta.additions) {
            const length =
              value instanceof ArrayBuffer ? value.byteLength : value.buffer.byteLength;
            if (batch.size && size + length > PIXEL_BATCH_BYTES) await flush();
            batch.set(id, value);
            size += length;
          }
          if (batch.size) await flush();
          request.delta = { ...request.delta, additions: new Map() };
          request.staged = true;
        }
      }
      return this.request(request) as Promise<Uint8Array>;
    });
    const result = job.catch((reason: unknown) => {
      this.snapshotDelta.clear();
      throw reason;
    });
    this.encodeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async decode(bytes: Uint8Array): Promise<EditorPersistenceSnapshot> {
    this.assertOpen();
    if (!this.worker) return (await this.getFallbackCodec()).decodeRecoverySnapshot(bytes);
    return this.request({
      id: this.channel!.nextRequestId(),
      operation: "decode",
      bytes,
    }) as Promise<EditorPersistenceSnapshot>;
  }
  async packRecent(
    snapshot: RecentSnapshot,
    ownership = RecoveryCodecSnapshotOwnership.Copy,
  ): Promise<PackedRecentSnapshot> {
    this.assertOpen();
    if (!this.worker) {
      const owned =
        ownership === RecoveryCodecSnapshotOwnership.Immutable ? snapshot : cloneGraph(snapshot);
      const { packRecentSnapshot } = await import("$/adapters/workers/recent-snapshot");
      const { RecoveryCompression } = await import("$/adapters/workers/recovery-compression");
      this.assertOpen();
      this.fallbackCompression ??= new RecoveryCompression();
      return packRecentSnapshot(owned, this.fallbackCompression);
    }
    return this.request({
      id: this.channel!.nextRequestId(),
      operation: "pack-recent",
      snapshot,
    }) as Promise<PackedRecentSnapshot>;
  }
  async unpackRecent(snapshot: PackedRecentSnapshot): Promise<RecentSnapshot> {
    this.assertOpen();
    if (!this.worker) {
      const { unpackRecentSnapshot } = await import("$/adapters/workers/recent-snapshot");
      this.assertOpen();
      return unpackRecentSnapshot(snapshot);
    }
    return this.request({
      id: this.channel!.nextRequestId(),
      operation: "unpack-recent",
      snapshot,
    }) as Promise<RecentSnapshot>;
  }
  private getFallbackCodec() {
    return (this.fallbackCodec ??= import("$/adapters/workers/recovery-codec"));
  }
  private request(request: RecoveryCodecRequest): Promise<CodecResult> {
    return this.channel!.request(request, (response) => {
      if (!response.ok) {
        this.snapshotDelta.clear();
        throw restoreWorkerError(response.error);
      }
      // Packed recent snapshots require pixel hydration only after decoding.
      return request.operation === "decode" || request.operation === "unpack-recent"
        ? hydratePixelStorage(response.result)
        : response.result;
    }).catch((error: unknown) => {
      this.snapshotDelta.clear();
      throw error;
    });
  }
  private assertOpen(): void {
    if (this.closed) throw new Error("Recovery codec client is closed");
    if (this.failure) {
      if (!this.workerFactory) throw this.failure;
      // The failed request has already been rejected. The next explicit retry
      // gets a fresh pure codec worker; no document/storage operation is replayed.
      this.channel?.close(this.failure);
      this.worker = this.workerFactory();
      this.attachChannel();
      this.failure = null;
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.fallbackCompression?.clear();
    this.snapshotDelta.clear();
    this.channel?.close(new Error("Recovery codec client is closed"));
  }
}
