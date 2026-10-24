import { openInEditor } from "$/adapters/editor/open-in-editor";
import { readPixelationPalettes } from "$/adapters/pixelation/palette-resources";
import {
  PixelationWorkerOperation,
  type PixelationWorkerRequest,
  type PixelationWorkerResponse,
} from "$/adapters/pixelation/worker-protocol";
import { readToolWheel } from "$/adapters/preview/browser-preview";
import { TOOL_IMPORT_MAX_BYTES } from "$/managers/files/files-model";
import type { PixelationPort } from "$/managers/ports/pixelation";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import { browserLocalStorage } from "@xprite/bedrock/browser/localstorage";
import { SerialWorker } from "@xprite/bedrock/browser/worker-job";
import type { PixelateOptions } from "@xprite/editor-core/import-export";
import defaultExampleUrl from "@xprite/site-assets/tools/pixelate/girl-with-a-pearl-earring.jpg?url";
const MAX_FILE_BYTES = TOOL_IMPORT_MAX_BYTES;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
const TIMEOUT_MS = 90_000;

export interface PixelationPortOptions {
  exampleUrl?: string;
  exampleName?: string;
}

export function createBrowserPixelationPort(options: PixelationPortOptions = {}): PixelationPort {
  const exampleUrl = options.exampleUrl ?? defaultExampleUrl;
  const exampleName = options.exampleName ?? "girl-with-a-pearl-earring.jpg";
  // One worker for the page: PixelOE's recent results and colour tables live in the worker, so
  // detection, the first convert and colour-only changes reuse them instead of starting cold.
  const worker = new SerialWorker(
    () => new Worker(new URL("./pixelation-worker.ts", import.meta.url), { type: "module" }),
  );
  function request<T>(
    message: PixelationWorkerRequest,
    readResponse: (response: PixelationWorkerResponse) => T,
  ): Promise<T> {
    const image = { ...message.image, data: new Uint8ClampedArray(message.image.data) };
    return worker.run<PixelationWorkerRequest, PixelationWorkerResponse, T>({
      request: { ...message, image },
      transfer: [image.data.buffer],
      timeoutMs: TIMEOUT_MS,
      timeoutError: () => new Error("Pixelation took too long. Try a smaller image."),
      transportError: () => new Error("Unable to pixelate this image."),
      readResponse: (response) => {
        if ("error" in response) throw new Error(response.error);
        return readResponse(response);
      },
    });
  }
  return {
    readWheel: readToolWheel,
    paletteResources() {
      return readPixelationPalettes((key) => {
        try {
          return browserLocalStorage.getItem(key);
        } catch {
          return null;
        }
      });
    },
    async read(file) {
      if (file.size > MAX_FILE_BYTES) throw new Error("Choose a file no larger than 64 MiB.");
      if (!/\.(png|jpe?g|webp)$/i.test(file.name))
        throw new Error("Choose a PNG, JPEG or WebP image.");
      return decodeImageBlob(file, { maxPixels: MAX_IMAGE_PIXELS });
    },
    async example() {
      const response = await fetch(exampleUrl);
      if (!response.ok) throw new Error("The example is unavailable.");
      return new File([await response.blob()], exampleName);
    },
    detectGrid(image, algorithm, size) {
      return request(
        { operation: PixelationWorkerOperation.DetectGrid, image, algorithm, size },
        (response) => {
          if (!("grid" in response)) throw new Error("Unable to detect the pixel grid.");
          return response.grid;
        },
      );
    },
    convert(image, options: PixelateOptions) {
      return request(
        { operation: PixelationWorkerOperation.Convert, image, options },
        (response) => {
          if (!("pixels" in response)) throw new Error("Unable to pixelate this image.");
          return response.pixels;
        },
      );
    },
    async save(pixels, name) {
      downloadBlob(await encodePngBlob(pixels), name);
    },
    async edit(pixels, name, palette) {
      await openInEditor(new File([await encodePngBlob(pixels)], name, { type: "image/png" }), {
        palette,
      });
    },
    prepare() {
      worker.prepare();
    },
    dispose() {
      worker.dispose();
    },
  };
}
