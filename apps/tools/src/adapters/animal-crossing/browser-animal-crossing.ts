import { handOffToolOutput } from "$/adapters/preview/browser-download";
import { readToolWheel } from "$/adapters/preview/browser-preview";
import { decodeViewerFile } from "$/adapters/viewer/aseprite-file";
import type { AnimalCrossingPort } from "$/managers/ports/animal-crossing";
import { ToolFailureCategory, ToolOperationError } from "$/managers/ports/telemetry";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import {
  animalCrossingArchive,
  readAnimalCrossingQr,
  readAnimalCrossingPattern,
} from "@xprite/editor-core/import-export";
import exampleUrl from "@xprite/site-assets/tools/animal-crossing/acnh/winding-cobblestone.png?url";

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
export function createBrowserAnimalCrossingPort(): AnimalCrossingPort {
  return {
    readWheel: readToolWheel,
    async read(file) {
      if (file.size > MAX_FILE_BYTES)
        throw new ToolOperationError(
          ToolFailureCategory.Limit,
          "Choose a file no larger than 64 MiB.",
        );
      if (/\.(ase|aseprite)$/i.test(file.name)) {
        const project = await decodeViewerFile(file);
        return { pixels: project.image, project };
      }
      if (/\.acnl$/i.test(file.name)) {
        const pattern = readAnimalCrossingPattern(new Uint8Array(await file.arrayBuffer()));
        return { pixels: pattern.pixels, pattern };
      }
      if (!/\.(png|jpe?g)$/i.test(file.name))
        throw new ToolOperationError(
          ToolFailureCategory.UnsupportedFormat,
          "Choose PNG, JPEG, .acnl or Aseprite. Single normal-design QR images are supported.",
        );
      const pixels = await decodeImageBlob(file, { maxPixels: MAX_IMAGE_PIXELS });
      if (pixels.width * pixels.height > MAX_IMAGE_PIXELS)
        throw new ToolOperationError(
          ToolFailureCategory.Limit,
          "Choose a PNG with at most 16 million pixels.",
        );
      const pattern = readAnimalCrossingQr(pixels);
      return pattern ? { pixels: pattern.pixels, pattern } : { pixels };
    },
    async example() {
      const response = await fetch(exampleUrl);
      if (!response.ok) throw new Error("The example is unavailable.");
      return new File([await response.blob()], "acnh-winding-cobblestone.png");
    },
    async saveQr(pixels, name) {
      await handOffToolOutput(() => encodePngBlob(pixels), name);
    },
    async save(result, name) {
      await handOffToolOutput(async () => {
        const bytes = await animalCrossingArchive(
          result,
          async (pixels) => new Uint8Array(await (await encodePngBlob(pixels)).arrayBuffer()),
        );
        return new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" });
      }, name);
    },
  };
}
