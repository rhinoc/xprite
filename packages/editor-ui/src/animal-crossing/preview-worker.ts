import type {
  AnimalCrossingPreviewRequest,
  AnimalCrossingPreviewResponse,
} from "$/animal-crossing/preview-types";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  convertAnimalCrossing,
  animalCrossingQrPixels,
} from "@xprite/editor-core/import-export/animal-crossing";

let source: PixelBuffer | null = null;
const scope = globalThis as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<AnimalCrossingPreviewRequest>) => void,
  ): void;
  postMessage(response: AnimalCrossingPreviewResponse, transfer?: Transferable[]): void;
};
scope.addEventListener("message", ({ data }) => {
  try {
    if (data.pixels) source = data.pixels;
    if (!source) throw new Error("Missing Animal Crossing preview source");
    const result = convertAnimalCrossing(source, data.settings);
    const selected = Math.min(data.selected, result.patterns.length - 1);
    const qr = animalCrossingQrPixels(result.patterns[selected].bytes);
    const buffers = new Set<ArrayBuffer>([
      result.pixels.data.buffer as ArrayBuffer,
      qr.data.buffer as ArrayBuffer,
    ]);
    for (const pattern of result.patterns) {
      buffers.add(pattern.pixels.data.buffer as ArrayBuffer);
      buffers.add(pattern.bytes.buffer as ArrayBuffer);
    }
    scope.postMessage({ ok: true, preview: { result, selected, qr } }, [...buffers]);
  } catch (reason) {
    scope.postMessage({
      ok: false,
      message: reason instanceof Error ? reason.message : String(reason),
    });
  }
});
