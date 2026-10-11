import { tUi } from "$/i18n";
import {
  createAnimalCrossingExportSource,
  type AnimalCrossingExportSource,
} from "$/managers/files/animal-crossing-export";
import {
  AnimalCrossingDownloadKind,
  type AnimalCrossingExportOptions,
} from "$/managers/files/animal-crossing-export-options";
import { ExporterGroup, type ExporterDefinition } from "$/managers/files/exporter-registry";
import { animalCrossingExportEmbeddedSize } from "$/managers/files/policies/animal-crossing-export-geometry";
import type { AnimalCrossingExportPort } from "$/managers/ports/animal-crossing-export";
import { convertAnimalCrossing, animalCrossingQrPixels } from "@xprite/editor-core/import-export";

enum AnimalCrossingExporterId {
  AnimalCrossing = "animal-crossing",
}
export interface AnimalCrossingExporterSource {
  image: AnimalCrossingExportSource;
  port: AnimalCrossingExportPort;
}

function normalizeOptions(value: unknown): AnimalCrossingExportOptions | null {
  if (!value || typeof value !== "object") return null;
  const options = value as AnimalCrossingExportOptions;
  const settings = options.settings;
  if (
    !settings ||
    ![settings.title, settings.creator, settings.town].every((item) => typeof item === "string")
  )
    return null;
  if (
    ![settings.cellWidth, settings.cellHeight].every(
      (item) => Number.isSafeInteger(item) && item > 0,
    )
  )
    return null;
  if (
    ![settings.offsetX, settings.offsetY, settings.spacingX, settings.spacingY].every(
      (item) => Number.isSafeInteger(item) && item >= 0,
    )
  )
    return null;
  return Object.values(AnimalCrossingDownloadKind).includes(options.download) &&
    Number.isSafeInteger(options.selected) &&
    options.selected >= 0
    ? options
    : null;
}

export const animalCrossingExporterDefinition: ExporterDefinition<
  AnimalCrossingExporterSource,
  AnimalCrossingExportOptions
> = {
  id: AnimalCrossingExporterId.AnimalCrossing,
  label: () => tUi("ui.export.animal.crossing"),
  group: ExporterGroup.Crafts,
  initialSize: animalCrossingExportEmbeddedSize(),
  available: ({ platform }) => !!platform.files.animalCrossingExport,
  normalizeOptions,
  createSource({ document, platform }, remembered) {
    const image = createAnimalCrossingExportSource(document);
    if (remembered) image.settings = { ...remembered.settings };
    return { image, port: platform.files.animalCrossingExport! };
  },
  async execute({ document, platform }, options) {
    const source = createAnimalCrossingExportSource(document);
    const result = convertAnimalCrossing(source.pixels, options.settings);
    const port = platform.files.animalCrossingExport!;
    if (options.download === AnimalCrossingDownloadKind.Archive) {
      const name = `${source.name.replace(/\.[^.]+$/, "")}-animal-crossing.zip`;
      await port.save(result, name);
      return { names: [name] };
    }
    const pattern = result.patterns[options.selected];
    if (!pattern) throw new Error(tUi("ui.export.design.unavailable"));
    const name = `r${pattern.row + 1}-c${pattern.column + 1}-qr.png`;
    await port.saveQr(animalCrossingQrPixels(pattern.bytes), name);
    return { names: [name] };
  },
};
