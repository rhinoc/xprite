import {
  decompressShare,
  smallestShareCompression,
  refineShareCompression,
} from "$/adapters/sharing/share-compression";
import {
  ShareOperation,
  type ShareWorkerRequest,
  type ShareWorkerResult,
} from "$/adapters/sharing/share-protocol";
import {
  decodeSharedProject,
  encodeSharedProject,
  type ShareCompressionCodec,
} from "@xprite/editor-core/import-export";

const compression: ShareCompressionCodec = {
  compress: smallestShareCompression,
  refine: refineShareCompression,
  decompress: decompressShare,
};

async function runShareJob(request: ShareWorkerRequest): Promise<ShareWorkerResult> {
  if (request.operation === ShareOperation.Decode)
    return {
      operation: ShareOperation.Decode,
      ...(await decodeSharedProject(request.text, request.limits, compression)),
    };
  return {
    operation: ShareOperation.Encode,
    ...(await encodeSharedProject(request.source, request.baseUrl, request.limits, compression)),
  };
}

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<ShareWorkerRequest>) => void;
  postMessage(result: ShareWorkerResult): void;
};
scope.onmessage = (event) => {
  void runShareJob(event.data).then(
    (result) => scope.postMessage(result),
    (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : "";
      const publicErrors = [
        "This shared project is too large. Export a file instead.",
        "No visible layers to share.",
        "This share link is too long. Ask for an exported file instead.",
        "Invalid share data.",
        "The share link is incomplete or damaged.",
      ];
      scope.postMessage({
        operation: ShareOperation.Error,
        message: publicErrors.includes(message)
          ? message
          : event.data.operation === ShareOperation.Decode
            ? "The share link is incomplete or damaged."
            : /exceeds|maxFileBytes|memory budget|too large/i.test(message)
              ? "This shared project is too large. Export a file instead."
              : "Unable to share this project.",
      });
    },
  );
};
