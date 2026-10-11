import { createBrowserExportOutputPort } from "$/adapters/files/browser-export-output";
import { tUiSource } from "$/i18n";
import type { AnimalCrossingExportPort } from "$/managers/ports/animal-crossing-export";
import type { ExportOutputPort } from "$/managers/ports/export-output";
import { animalCrossingArchive } from "@xprite/editor-core/import-export";
import { createAnimalCrossingPreviewRenderer } from "@xprite/editor-ui/animal-crossing/preview";

export function createBrowserAnimalCrossingExportPort(
  output: ExportOutputPort = createBrowserExportOutputPort(),
): AnimalCrossingExportPort {
  return {
    ...createAnimalCrossingPreviewRenderer(tUiSource),
    async save(result, name) {
      const bytes = await animalCrossingArchive(
        result,
        async (pixels) => new Uint8Array(await (await output.encodePng(pixels)).arrayBuffer()),
      );
      await output.save({
        blob: new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
        name,
      });
    },
    async saveQr(pixels, name) {
      await output.save({ blob: await output.encodePng(pixels), name });
    },
  };
}
