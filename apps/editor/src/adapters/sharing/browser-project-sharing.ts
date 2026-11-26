import { decodeAsepriteBlob } from "$/adapters/files/aseprite-files";
import {
  ShareOperation,
  type ShareWorkerRequest,
  type ShareWorkerResult,
} from "$/adapters/sharing/share-protocol";
import {
  announceWorkerLoadFailure,
  WORKER_LOAD_ATTEMPTS,
  WORKER_LOAD_RETRY_DELAY_MS,
  workerLoadError,
} from "$/adapters/workers/worker-load-failure";
import type { EditorInitialProject } from "$/managers/ports/editor-host";
import { EditorPageRoute } from "$/managers/ports/platform";
import type { ProjectSharingPort, ShareArtifact, ShareLimits } from "$/managers/ports/sharing";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import { encodePngBlob } from "@xprite/bedrock/browser/images";
import {
  runManagedWorkerJob,
  WorkerFailureKind,
  WorkerFailureStage,
  type ManagedWorkerTransport,
} from "@xprite/bedrock/browser/managed-worker";
import { SHARE_FRAGMENT_PREFIX } from "@xprite/editor-core/import-export";

const SHARE_JOB_TIMEOUT_MS = 120_000;
const SHARE_FILE_MIME = "application/x-aseprite";
const WORKER_LOAD_DIAGNOSTIC = "The project sharing worker script could not be loaded";

export interface BrowserProjectSharingOptions {
  createWorker?: () => ManagedWorkerTransport<ShareWorkerRequest>;
  retryDelayMs?: number;
}

function createShareWorker(): Worker {
  return new Worker(new URL("./share-worker.ts", import.meta.url), { type: "module" });
}

async function runWorker(
  request: ShareWorkerRequest,
  signal?: AbortSignal,
  options: BrowserProjectSharingOptions = {},
): Promise<ShareWorkerResult> {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (!options.createWorker && typeof Worker !== "function") {
    throw new Error("Sharing is unavailable in this browser.");
  }
  return runManagedWorkerJob<ShareWorkerRequest, ShareWorkerResult, ShareWorkerResult>({
    workerFactory: options.createWorker ?? createShareWorker,
    buildRequest: () => ({ request }),
    signal,
    timeoutMs: SHARE_JOB_TIMEOUT_MS,
    maxStartupAttempts: WORKER_LOAD_ATTEMPTS,
    retryDelayMs: options.retryDelayMs ?? WORKER_LOAD_RETRY_DELAY_MS,
    retryConstructionFailure: false,
    timeoutError: () => new Error("Sharing took too long. Export a file instead."),
    formatError: (info) => {
      if (info.stage === WorkerFailureStage.Construction) {
        return new Error("Sharing is unavailable in this browser.");
      }
      if (info.kind === WorkerFailureKind.Startup) return workerLoadError(WORKER_LOAD_DIAGNOSTIC);
      return new Error("Unable to share this project.");
    },
    onStartupFailureExhausted: (error) => announceWorkerLoadFailure(error),
    readResponse: (result) => {
      if (result.operation === ShareOperation.Error) throw new Error(result.message);
      return result;
    },
  });
}

export function createBrowserProjectSharing(
  options: BrowserProjectSharingOptions = {},
): ProjectSharingPort {
  return {
    canCopy: typeof navigator.clipboard?.writeText === "function",
    create: async (source, limits, signal) => {
      const baseUrl = new URL(EditorPageRoute.Document, window.location.origin).href;
      const result = await runWorker(
        { operation: ShareOperation.Encode, source, limits, baseUrl },
        signal,
        options,
      );
      if (result.operation !== ShareOperation.Encode)
        throw new Error("Unable to share this project.");
      const file = result.qr ? await encodePngBlob(result.qr) : null;
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      return {
        url: result.url,
        urlCharacters: result.urlCharacters,
        frameCount: result.frameCount,
        layerCount: result.layerCount,
        qr: file ? { file, preview: URL.createObjectURL(file) } : null,
      };
    },
    release: (artifact: ShareArtifact) => {
      if (artifact.qr) URL.revokeObjectURL(artifact.qr.preview);
    },
    copy: (url) => {
      if (typeof navigator.clipboard?.writeText !== "function")
        return Promise.reject(new Error("Copy failed. Select the link and copy it manually."));
      return navigator.clipboard.writeText(url).catch(() => {
        throw new Error("Copy failed. Select the link and copy it manually.");
      });
    },
    downloadQr: (artifact, name) => {
      if (artifact.qr) downloadBlob(artifact.qr.file, `${name.replace(/\.[^.]+$/, "")}-share.png`);
    },
  };
}

/** Ordinary startup performs no sharing work. A share opens as a new independent
 * editable document; clearing the fragment prevents accidental duplicate imports. */
export function takeSharedProject(
  limits: ShareLimits,
  options: BrowserProjectSharingOptions = {},
): Promise<EditorInitialProject | null> | null {
  if (!window.location.hash.startsWith(SHARE_FRAGMENT_PREFIX)) return null;
  const text = window.location.hash.slice(SHARE_FRAGMENT_PREFIX.length);
  const length = window.location.href.length;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  return (async () => {
    if (length > limits.maxUrlCharacters)
      throw new Error("This share link is too long. Ask for an exported file instead.");
    const result = await runWorker(
      { operation: ShareOperation.Decode, text, limits },
      undefined,
      options,
    );
    if (result.operation !== ShareOperation.Decode) throw new Error("Invalid share data.");
    const name = result.name || "Shared sprite.aseprite";
    const blob = new Blob([new Uint8Array(result.bytes).buffer], { type: SHARE_FILE_MIME });
    const project = await decodeAsepriteBlob(blob, name, {
      maxProjectBytes: limits.maxProjectBytes,
      maxInflatedBytes: limits.maxProjectBytes,
    });
    return { name, project };
  })();
}
