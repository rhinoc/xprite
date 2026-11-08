import { openPixelsInEditor } from "$/adapters/editor/open-in-editor";
import { browserToolAppearance } from "$/adapters/preview/browser-appearance";
import { handOffToolOutput } from "$/adapters/preview/browser-download";
import { readToolWheel } from "$/adapters/preview/browser-preview";
import { TOOL_IMPORT_MAX_BYTES } from "$/managers/files/files-model";
import type { NormalMapPort } from "$/managers/ports/normal-map";
import { ToolFailureCategory, ToolOperationError } from "$/managers/ports/telemetry";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import exampleUrl from "@xprite/site-assets/tools/normal-map/knight.png?url";

const MAX_FILE_BYTES = TOOL_IMPORT_MAX_BYTES;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
const EXAMPLE_FILENAME = "knight.png";

export function createBrowserNormalMapPort(): NormalMapPort {
  return {
    ...browserToolAppearance,
    readWheel: readToolWheel,
    async read(file) {
      if (file.size > MAX_FILE_BYTES)
        throw new ToolOperationError(
          ToolFailureCategory.Limit,
          "Choose an image no larger than 64 MiB.",
        );
      return decodeImageBlob(file, { maxPixels: MAX_IMAGE_PIXELS });
    },
    async example() {
      const response = await fetch(exampleUrl);
      if (!response.ok)
        throw new Error("The example could not be loaded. Choose an image to continue.");
      return new File([await response.blob()], EXAMPLE_FILENAME, { type: "image/png" });
    },
    edit: openPixelsInEditor,
    async savePng(pixels, name) {
      await handOffToolOutput(() => encodePngBlob(pixels), name);
    },
  };
}
