import { handOffToolOutput } from "$/adapters/preview/browser-download";
import { readToolWheel } from "$/adapters/preview/browser-preview";
import { decodeViewerFile } from "$/adapters/viewer/aseprite-file";
import type { BeadToolPort } from "$/managers/ports/beads";
import { ToolFailureCategory, ToolOperationError } from "$/managers/ports/telemetry";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import { encodeBeadPdf, renderBeadChart } from "@xprite/editor-core/import-export";
import exampleUrl from "@xprite/site-assets/showcase/ipad/hello/hello-frame-01.png?url";

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;

export function createBrowserBeadToolPort(): BeadToolPort {
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
      if (!/\.(png|jpe?g|webp)$/i.test(file.name))
        throw new ToolOperationError(
          ToolFailureCategory.UnsupportedFormat,
          "Choose a PNG, JPEG, WebP or Aseprite file.",
        );
      return { pixels: await decodeImageBlob(file, { maxPixels: MAX_IMAGE_PIXELS }) };
    },
    async example() {
      const response = await fetch(exampleUrl);
      if (!response.ok) throw new Error("The example is unavailable.");
      return new File([await response.blob()], "hello-frame-01.png");
    },
    async savePng(grid, showCodes, boardSize, name) {
      await handOffToolOutput(
        () => encodePngBlob(renderBeadChart(grid, showCodes, boardSize)),
        name,
      );
    },
    async savePdf(grid, brand, showCodes, boardSize, name) {
      await handOffToolOutput(
        () =>
          new Blob([new Uint8Array(encodeBeadPdf(grid, brand, boardSize, showCodes)).buffer], {
            type: "application/pdf",
          }),
        name,
      );
    },
  };
}
