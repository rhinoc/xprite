import { decodeRecoverySnapshot, encodeRecoverySnapshot } from "$/adapters/workers/recovery-codec";
import type { EditorPersistenceSnapshot } from "@xprite/editor-core";

export type RecoveryCodecRequest =
  | { id: number; operation: "encode"; snapshot: EditorPersistenceSnapshot }
  | { id: number; operation: "decode"; bytes: Uint8Array };
export interface SerializedRecoveryCodecError {
  name: string;
  message: string;
  stack?: string;
  details?: Readonly<Record<string, unknown>>;
}
export type RecoveryCodecResponse =
  | { id: number; ok: true; result: Uint8Array | EditorPersistenceSnapshot }
  | { id: number; ok: false; error: string | SerializedRecoveryCodecError };
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<RecoveryCodecRequest>) => void,
  ): void;
  postMessage(message: RecoveryCodecResponse): void;
}
const scope = globalThis as unknown as WorkerScope;

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
    const result =
      request.operation === "encode"
        ? await encodeRecoverySnapshot(request.snapshot)
        : request.operation === "decode"
          ? await decodeRecoverySnapshot(request.bytes)
          : (() => {
              throw new Error("Unknown recovery codec operation");
            })();
    scope.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    scope.postMessage({
      id: request?.id ?? -1,
      ok: false,
      error: serializeError(error),
    });
  }
});
