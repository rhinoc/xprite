import { tUi } from "$/i18n";
import type { ExportOutputPort } from "$/managers/ports/export-output";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import { renderArtifactSignature, createArtifactRasterText } from "@xprite/site-shell/browser";

export function createBrowserExportOutputPort(): ExportOutputPort {
  return {
    encodePng: encodePngBlob,
    rasterText: createArtifactRasterText(),
    async readAttribution(name, url, logoUrl, pixelFont) {
      try {
        const response = await fetch(logoUrl);
        if (!response.ok) throw new Error(tUi("ui.export.artwork.unavailable"));
        const logo = await decodeImageBlob(await response.blob());
        return { name, url, signature: await renderArtifactSignature(name, url, logo, pixelFont) };
      } catch {
        // Network, decode and canvas failures all mean the signature artwork is unavailable.
        throw new Error(tUi("ui.export.artwork.unavailable"));
      }
    },
    async save({ blob, name }) {
      downloadBlob(blob, name);
    },
  };
}
