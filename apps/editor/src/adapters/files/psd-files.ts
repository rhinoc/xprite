import { importPsdInWorker } from "$/adapters/workers/psd-import-client";
import { tUi } from "$/i18n";
import { WORKER_LOAD_ERROR_NAME } from "$/managers/ports/chunk-load";
import { markImmutableEditorProject } from "@xprite/editor-core/document";
import {
  EDITOR_PSD_LIMITS,
  PsdCodecError,
  PsdIssueCode,
  type PsdResourceLimits,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

export const DEFAULT_MAX_PSD_PROJECT_BYTES = EDITOR_PSD_LIMITS.maxFileBytes;

export interface PsdFileOptions {
  fetch?: typeof globalThis.fetch;
  onSourceBytes?: (bytes: Uint8Array) => void;
  maxProjectBytes?: number;
}

function localizePsdError(reason: unknown, maxProjectBytes: number): Error {
  if (reason instanceof PsdCodecError) {
    if (reason.code === PsdIssueCode.ResourceLimit) {
      return new PsdCodecError(
        tUi("ui.psd.file.exceeds.limit", { value1: maxProjectBytes }),
        reason.code,
        reason.details,
      );
    }
    if (reason.code === PsdIssueCode.InvalidHeader) {
      return new PsdCodecError(tUi("ui.psd.invalid.header"), reason.code, reason.details);
    }
    return new PsdCodecError(
      tUi("ui.psd.decode.failed", { reason: reason.message }),
      reason.code,
      reason.details,
    );
  }
  return reason instanceof Error ? reason : new Error(String(reason));
}

export async function decodePsdBlob(
  blob: Blob,
  fileName: string,
  options: PsdFileOptions = {},
): Promise<SessionProject> {
  if (!(blob instanceof Blob)) throw new TypeError("decodePsdBlob expects a Blob");
  const maxProjectBytes = options.maxProjectBytes ?? DEFAULT_MAX_PSD_PROJECT_BYTES;
  if (!Number.isSafeInteger(maxProjectBytes) || maxProjectBytes < 1) {
    throw new RangeError("maxProjectBytes must be a positive safe integer");
  }
  if (blob.size > maxProjectBytes) {
    throw new PsdCodecError(
      tUi("ui.psd.file.exceeds.limit", { value1: maxProjectBytes }),
      PsdIssueCode.ResourceLimit,
    );
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength > maxProjectBytes) {
    throw new PsdCodecError(
      tUi("ui.psd.file.exceeds.limit", { value1: maxProjectBytes }),
      PsdIssueCode.ResourceLimit,
    );
  }
  options.onSourceBytes?.(bytes);

  const limits: PsdResourceLimits = {
    ...EDITOR_PSD_LIMITS,
    maxFileBytes: maxProjectBytes,
    maxDecodedBytes: options.maxProjectBytes ?? EDITOR_PSD_LIMITS.maxDecodedBytes,
  };

  try {
    const pending = importPsdInWorker({ bytes, fileName, limits });
    if (pending) {
      try {
        return await pending;
      } catch (error) {
        if (!(error instanceof Error) || error.name !== WORKER_LOAD_ERROR_NAME) throw error;
      }
    }
    const { decodePsdProjectSync } = await import("$/adapters/files/psd-decoder");
    return markImmutableEditorProject(decodePsdProjectSync(bytes, limits));
  } catch (reason) {
    throw localizePsdError(reason, maxProjectBytes);
  }
}

export async function decodePsdSource(
  source: Blob | { url: string },
  fileName: string,
  options: PsdFileOptions = {},
): Promise<SessionProject> {
  if (source instanceof Blob) return decodePsdBlob(source, fileName, options);
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("This browser cannot fetch a PSD asset");
  const response = await fetcher(source.url);
  if (
    response.ok === false ||
    (response.ok === undefined && typeof response.status === "number" && response.status >= 400)
  ) {
    throw new Error(tUi("ui.psd.fetch.failed", { value1: response.status }));
  }
  return decodePsdBlob(await response.blob(), fileName, options);
}
