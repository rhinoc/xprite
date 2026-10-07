import "$/adapters/platform/structured-clone-compat";
import {
  packRecentSnapshot,
  unpackRecentSnapshot,
  type PackedRecentSnapshot,
  type RecentSnapshot,
} from "$/adapters/workers/recent-snapshot";
import { decodeRecoverySnapshot, encodeRecoverySnapshot } from "$/adapters/workers/recovery-codec";
import { RecoveryCompression } from "$/adapters/workers/recovery-compression";
import {
  RecoverySnapshotDeltaReceiver,
  type RecoverySnapshotDelta,
} from "$/adapters/workers/recovery-snapshot-delta";
import type { EditorPersistenceSnapshot } from "@xprite/editor-core";

export type RecoveryCodecRequest =
  | { id: number; operation: "stage-delta"; additions: RecoverySnapshotDelta["additions"] }
  | { id: number; operation: "encode-delta"; delta: RecoverySnapshotDelta; staged?: boolean }
  | { id: number; operation: "encode"; snapshot: EditorPersistenceSnapshot }
  | { id: number; operation: "decode"; bytes: Uint8Array }
  | { id: number; operation: "pack-recent"; snapshot: RecentSnapshot }
  | { id: number; operation: "unpack-recent"; snapshot: PackedRecentSnapshot };
export interface SerializedRecoveryCodecError {
  name: string;
  message: string;
  stack?: string;
  details?: Readonly<Record<string, unknown>>;
}
export type RecoveryCodecResponse =
  | {
      id: number;
      ok: true;
      result: Uint8Array | EditorPersistenceSnapshot | PackedRecentSnapshot | RecentSnapshot;
    }
  | { id: number; ok: false; error: string | SerializedRecoveryCodecError };
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<RecoveryCodecRequest>) => void,
  ): void;
  postMessage(message: RecoveryCodecResponse, transfer?: Transferable[]): void;
}
const scope = globalThis as unknown as WorkerScope;
const compression = new RecoveryCompression();
const snapshotDelta = new RecoverySnapshotDeltaReceiver();
const stagedBuffers = new Map<number, RecoverySnapshotDelta["additions"]>();

function serializeError(reason: unknown): SerializedRecoveryCodecError {
  if (!(reason instanceof Error)) return { name: "Error", message: String(reason) };
  const source = reason as Error & {
    issues?: unknown;
    diagnosticDetails?: unknown;
  };
  const details: Record<string, unknown> = {};
  if (
    source.diagnosticDetails &&
    typeof source.diagnosticDetails === "object" &&
    !Array.isArray(source.diagnosticDetails)
  )
    Object.assign(details, source.diagnosticDetails);
  if (Array.isArray(source.issues)) details.codecIssues = source.issues;
  return {
    name: reason.name || "Error",
    message: reason.message || reason.name || "Unknown error",
    ...(typeof reason.stack === "string" ? { stack: reason.stack } : {}),
    ...(Object.keys(details).length ? { details } : {}),
  };
}

scope.addEventListener("message", async ({ data: request }) => {
  try {
    if (!request || !Number.isSafeInteger(request.id))
      throw new Error("Invalid recovery codec request");
    if (request.operation === "stage-delta") {
      if (!stagedBuffers.has(request.id)) stagedBuffers.clear();
      const buffers = stagedBuffers.get(request.id) ?? new Map();
      for (const [id, value] of request.additions) buffers.set(id, value);
      stagedBuffers.set(request.id, buffers);
      return;
    }
    if (request.operation === "encode-delta" && request.staged) {
      const additions = stagedBuffers.get(request.id);
      stagedBuffers.delete(request.id);
      if (!additions) throw new Error("Incomplete recovery pixel batches");
      request.delta = { ...request.delta, additions };
    }
    const result =
      request.operation === "encode-delta"
        ? await encodeRecoverySnapshot(
            snapshotDelta.decode(request.delta),
            compression.deflateImmutable,
          )
        : request.operation === "encode"
          ? await encodeRecoverySnapshot(request.snapshot, compression.deflate)
          : request.operation === "decode"
            ? await decodeRecoverySnapshot(request.bytes)
            : request.operation === "pack-recent"
              ? await packRecentSnapshot(request.snapshot, compression)
              : request.operation === "unpack-recent"
                ? unpackRecentSnapshot(request.snapshot)
                : (() => {
                    throw new Error("Unknown recovery codec operation");
                  })();
    scope.postMessage(
      { id: request.id, ok: true, result },
      result instanceof Uint8Array ? [result.buffer as ArrayBuffer] : undefined,
    );
  } catch (error) {
    stagedBuffers.delete(request?.id);
    scope.postMessage({
      id: request?.id ?? -1,
      ok: false,
      error: serializeError(error),
    });
  }
});
