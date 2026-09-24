import type {
  WebpWorkerRequest,
  WebpWorkerResponse,
} from "$/adapters/workers/webp-export-worker-types";
import {
  WebpCompression,
  assembleWebpAnimation,
  encodeWebpLossless,
} from "@xprite/editor-core/import-export";

const scope = globalThis as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WebpWorkerRequest>) => void,
  ): void;
  postMessage(response: WebpWorkerResponse, transfer?: Transferable[]): void;
};
scope.addEventListener("message", ({ data: request }) => {
  try {
    if (request.options.compression !== WebpCompression.Lossless || !request.frames.length)
      throw new Error("Invalid lossless WebP export request");
    const cache = new Map<ArrayBuffer, Map<string, Uint8Array>>();
    const encoded = request.frames.map((frame) => {
      const key = `${frame.byteOffset}:${frame.length}:${frame.width}:${frame.height}`;
      let images = cache.get(frame.data);
      if (!images) {
        images = new Map();
        cache.set(frame.data, images);
      }
      let bytes = images.get(key);
      if (!bytes) {
        bytes = encodeWebpLossless({
          width: frame.width,
          height: frame.height,
          data: new Uint8ClampedArray(frame.data, frame.byteOffset, frame.length),
        });
        images.set(key, bytes);
      }
      return { duration: frame.duration, bytes };
    });
    const first = request.frames[0];
    const bytes = request.options.animated
      ? assembleWebpAnimation(encoded, first.width, first.height, request.options.loopCount)
      : encoded[0].bytes;
    scope.postMessage({ ok: true, data: bytes.buffer as ArrayBuffer }, [
      bytes.buffer as ArrayBuffer,
    ]);
  } catch (error) {
    scope.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
