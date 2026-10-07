import { browserToolAppearance } from "$/adapters/preview/browser-appearance";
import { readToolWheel } from "$/adapters/preview/browser-preview";
import type { GifSheetPort } from "$/managers/ports/gif-sheet";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import { encodePngBlob } from "@xprite/bedrock/browser/images";
import { decodeGifAnimation } from "@xprite/editor-core/import-export";
import exampleUrl from "@xprite/site-assets/showcase/ipad/hello/hello.gif?url";

const MAX_GIF_BYTES = 64 * 1024 * 1024;
const EXAMPLE_FILENAME = "hello.gif";
const JSON_TYPE = "application/json";

export function createBrowserGifSheetPort(): GifSheetPort {
  return {
    ...browserToolAppearance,
    readWheel: readToolWheel,
    async read(file) {
      if (file.size > MAX_GIF_BYTES) throw new Error("Choose a GIF no larger than 64 MiB.");
      const animation = decodeGifAnimation(new Uint8Array(await file.arrayBuffer()), {
        includeStatic: true,
      });
      if (!animation) throw new Error("This GIF could not be decoded.");
      return animation;
    },
    async example() {
      const response = await fetch(exampleUrl);
      if (!response.ok)
        throw new Error("The example could not be loaded. Choose a GIF to continue.");
      return new File([await response.blob()], EXAMPLE_FILENAME, { type: "image/gif" });
    },
    async savePng(pixels, name) {
      downloadBlob(await encodePngBlob(pixels), name);
    },
    async saveJson(content, name) {
      downloadBlob(new Blob([content], { type: JSON_TYPE }), name);
    },
  };
}
