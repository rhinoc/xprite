import { handOffToolOutput } from "$/adapters/preview/browser-download";
import { readToolWheel } from "$/adapters/preview/browser-preview";
import { decodeViewerFile } from "$/adapters/viewer/aseprite-file";
import { BeadToolError } from "$/managers/beads/bead-failure";
import type { BeadToolPort } from "$/managers/ports/beads";
import { ToolFailureCategory } from "$/managers/ports/telemetry";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import { encodeBeadPdfAsync, renderBeadPatternSheet } from "@xprite/editor-core/import-export";
import { BEAD_ARTIFACT_ATTRIBUTION } from "@xprite/growth-content/tools";
import logoUrl from "@xprite/site-assets/menu-icon.svg?url";
import exampleUrl from "@xprite/site-assets/showcase/ipad/hello/hello-frame-01.png?url";
import { renderArtifactSignature, createArtifactRasterText } from "@xprite/site-shell/browser";

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function createBrowserBeadToolPort(): BeadToolPort {
  const rasterText = createArtifactRasterText();
  return {
    readWheel: readToolWheel,
    async read(file) {
      if (file.size > MAX_FILE_BYTES)
        throw new BeadToolError(ToolFailureCategory.Limit, "beads.error.file.size");
      if (/\.(ase|aseprite)$/i.test(file.name)) {
        const project = await decodeViewerFile(file);
        return { pixels: project.image, project };
      }
      if (!/\.(png|jpe?g|webp)$/i.test(file.name))
        throw new BeadToolError(ToolFailureCategory.UnsupportedFormat, "beads.error.file.type");
      return {
        pixels: await decodeImageBlob(file, { maxPixels: MAX_IMAGE_PIXELS }),
      };
    },
    async example() {
      const response = await fetch(exampleUrl);
      if (!response.ok)
        throw new BeadToolError(ToolFailureCategory.ExampleFetch, "beads.error.example");
      return new File([await response.blob()], "hello-frame-01.png");
    },
    async savePng(grid, brand, showCodes, boardSize, name, labels) {
      await handOffToolOutput(
        async () =>
          encodePngBlob(
            renderBeadPatternSheet(
              grid,
              brand,
              showCodes,
              boardSize,
              await readAttribution(false),
              rasterText,
              labels,
            ),
          ),
        name,
      );
    },
    async savePdf(grid, brand, showCodes, boardSize, name, labels, onProgress) {
      await handOffToolOutput(async () => {
        const bytes = await encodeBeadPdfAsync(grid, brand, boardSize, showCodes, {
          attribution: await readAttribution(true),
          labels,
          rasterText,
          onProgress,
          yieldToHost: yieldToBrowser,
        });
        return new Blob([new Uint8Array(bytes).buffer], {
          type: "application/pdf",
        });
      }, name);
    },
  };
}

async function readAttribution(pixelFont: boolean) {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) throw new Error(`Artwork request failed: ${response.status}`);
    return {
      ...BEAD_ARTIFACT_ATTRIBUTION,
      signature: await renderArtifactSignature(
        BEAD_ARTIFACT_ATTRIBUTION.name,
        BEAD_ARTIFACT_ATTRIBUTION.url,
        await decodeImageBlob(await response.blob()),
        pixelFont,
      ),
    };
  } catch {
    throw new BeadToolError(ToolFailureCategory.Handoff, "beads.error.artwork");
  }
}
