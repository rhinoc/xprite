import { decodeAsepriteBlob } from "$/adapters/files/aseprite-files";
import {
  ShareOperation,
  type ShareWorkerRequest,
  type ShareWorkerResult,
} from "$/adapters/sharing/share-protocol";
import type { EditorInitialProject } from "$/managers/ports/editor-host";
import { EditorPageRoute } from "$/managers/ports/platform";
import type { ProjectSharingPort, ShareArtifact, ShareLimits } from "$/managers/ports/sharing";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import { encodePngBlob } from "@xprite/bedrock/browser/images";
import { runWorkerJob } from "@xprite/bedrock/browser/worker-job";
import { SHARE_FRAGMENT_PREFIX } from "@xprite/editor-core/import-export";

const SHARE_JOB_TIMEOUT_MS = 120_000;
const SHARE_FILE_MIME = "application/x-aseprite";

async function runWorker(
  request: ShareWorkerRequest,
  signal?: AbortSignal,
): Promise<ShareWorkerResult> {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  let worker: Worker;
  try {
    worker = new Worker(new URL("./share-worker.ts", import.meta.url), { type: "module" });
  } catch {
    throw new Error("Sharing is unavailable in this browser.");
  }
  return runWorkerJob<ShareWorkerRequest, ShareWorkerResult, ShareWorkerResult>({
    worker,
    request,
    signal,
    timeoutMs: SHARE_JOB_TIMEOUT_MS,
    timeoutError: () => new Error("Sharing took too long. Export a file instead."),
    transportError: () => new Error("Unable to share this project."),
    readResponse: (result) => {
      if (result.operation === ShareOperation.Error) throw new Error(result.message);
      return result;
    },
  });
}

export function createBrowserProjectSharing(): ProjectSharingPort {
  return {
    canCopy: typeof navigator.clipboard?.writeText === "function",
    create: async (source, limits, signal) => {
      const baseUrl = new URL(EditorPageRoute.Document, window.location.origin).href;
      const result = await runWorker(
        { operation: ShareOperation.Encode, source, limits, baseUrl },
        signal,
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
    const result = await runWorker({ operation: ShareOperation.Decode, text, limits });
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
