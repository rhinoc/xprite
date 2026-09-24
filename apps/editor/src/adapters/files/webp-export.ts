import type {
  WebpWorkerFrame,
  WebpWorkerResponse,
} from "$/adapters/workers/webp-export-worker-types";
import { tUi, tUiSource } from "$/i18n";
import type { WebpExportPort } from "$/managers/ports/webp-export";
import { encodeImageBlob, ImageEncodingFormat } from "@xprite/bedrock/browser/images";
import { WebpCompression, assembleWebpAnimation } from "@xprite/editor-core/import-export";

/** A worker exists only for the duration of one export, including all error paths. */
export function createBrowserWebpExportPort(): WebpExportPort {
  return {
    supportsLossless: () => typeof Worker === "function",
    async encode(frames, options) {
      if (!frames.length) throw new Error(tUi("ui.webp.export.frames.required"));
      if (options.compression === WebpCompression.Lossy) {
        const encoded = [];
        for (const frame of frames) {
          const blob = await encodeImageBlob(
            frame.pixels,
            ImageEncodingFormat.Webp,
            options.qualityPercent / 100,
          );
          if (blob.type.toLowerCase() !== "image/webp")
            throw new Error(tUi("ui.webp.export.image.unavailable"));
          encoded.push({
            bytes: new Uint8Array(await blob.arrayBuffer()),
            duration: frame.duration,
          });
        }
        const first = frames[0].pixels;
        const bytes = options.animated
          ? assembleWebpAnimation(encoded, first.width, first.height, options.loopCount)
          : encoded[0].bytes;
        return new Blob([bytes.buffer as ArrayBuffer], { type: "image/webp" });
      }
      if (typeof Worker !== "function") throw new Error(tUi("ui.webp.export.lossless.unavailable"));
      const worker = new Worker(new URL("../workers/webp-export-worker.ts", import.meta.url), {
        type: "module",
      });
      try {
        return await new Promise<Blob>((resolve, reject) => {
          worker.onmessage = ({ data }: MessageEvent<WebpWorkerResponse>) => {
            if (data.ok) resolve(new Blob([data.data], { type: "image/webp" }));
            else reject(new Error(tUiSource(data.message)));
          };
          worker.onerror = (event) => {
            event.preventDefault();
            reject(new Error(event.message || tUi("ui.webp.export.worker.failed")));
          };
          worker.onmessageerror = () => reject(new Error(tUi("ui.webp.export.output.unreadable")));
          const transfer = new Set<ArrayBuffer>();
          const images: WebpWorkerFrame[] = frames.map((frame) => {
            const { data, width, height } = frame.pixels;
            if (!(data.buffer instanceof ArrayBuffer))
              throw new Error(tUi("ui.webp.export.buffer.required"));
            transfer.add(data.buffer);
            return {
              width,
              height,
              duration: frame.duration,
              data: data.buffer,
              byteOffset: data.byteOffset,
              length: data.length,
            };
          });
          worker.postMessage({ frames: images, options }, [...transfer]);
        });
      } finally {
        worker.terminate();
      }
    },
  };
}
