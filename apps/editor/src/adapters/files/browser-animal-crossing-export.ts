import { tUiSource } from "$/i18n";
import type { AnimalCrossingExportPort } from "$/managers/ports/animal-crossing-export";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import { encodePngBlob } from "@xprite/bedrock/browser/images";
import { animalCrossingArchive } from "@xprite/editor-core/import-export";
import { createAnimalCrossingPreviewRenderer } from "@xprite/editor-ui/animal-crossing/preview";

export function createBrowserAnimalCrossingExportPort(): AnimalCrossingExportPort {
  return {
    ...createAnimalCrossingPreviewRenderer(tUiSource),
    async save(result, name) {
      const bytes = await animalCrossingArchive(
        result,
        async (pixels) => new Uint8Array(await (await encodePngBlob(pixels)).arrayBuffer()),
      );
      downloadBlob(new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }), name);
    },
    async saveQr(pixels, name) {
      downloadBlob(await encodePngBlob(pixels), name);
    },
  };
}
