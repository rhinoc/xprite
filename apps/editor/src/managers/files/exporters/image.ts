import { tUi } from "$/i18n";
import { exportDocumentAnimation } from "$/managers/files/export-animation";
import { ExportOutputFormat } from "$/managers/files/export-file-options";
import type { ExporterDefinition } from "$/managers/files/exporter-registry";
import { inspectImageEncodingCapabilities } from "$/managers/files/image-encoding-capabilities";
import type { ExportFileOptions } from "@xprite/editor-core";

export enum ImageExporterId {
  Image = "image",
}
export interface ImageExporterSource {
  documentKey: string;
}

export function normalizeImageExportOptions(value: unknown): ExportFileOptions | null {
  if (!value || typeof value !== "object") return null;
  const options = value as ExportFileOptions;
  return typeof options.name === "string" &&
    Number.isFinite(options.scalePercent) &&
    options.scalePercent > 0
    ? options
    : null;
}

export const imageExporterDefinition: ExporterDefinition<ImageExporterSource, ExportFileOptions> = {
  id: ImageExporterId.Image,
  label: () => tUi("ui.save.format.png"),
  initialSize: { width: 456, height: 336 },
  helpUrl: "https://www.aseprite.org/docs/exporting/",
  initialChoices: [
    { id: ExportOutputFormat.Png, label: "ui.save.format.png" },
    { id: ExportOutputFormat.Gif, label: "ui.export.format.gif" },
    { id: ExportOutputFormat.Apng, label: "ui.export.format.apng" },
    {
      id: ExportOutputFormat.Jpeg,
      label: "ui.image.export.jpeg.current.frame",
      disabled: true,
    },
    {
      id: ExportOutputFormat.Webp,
      label: "ui.image.export.webp.format",
      disabled: true,
    },
  ],
  async resolveChoices({ platform }) {
    const capabilities = await inspectImageEncodingCapabilities(platform.files.webp);
    return imageExporterDefinition.initialChoices!.map((choice) => ({
      ...choice,
      disabled:
        choice.id === ExportOutputFormat.Jpeg
          ? !capabilities.jpeg
          : choice.id === ExportOutputFormat.Webp
            ? !capabilities.webp
            : false,
    }));
  },
  available: () => true,
  normalizeOptions: normalizeImageExportOptions,
  canRepeat: ({ platform }, options) => !/\.webp$/i.test(options.name) || !!platform.files.webp,
  createSource: ({ documentKey }) => ({ documentKey }),
  execute: ({ document }, options, ports) => exportDocumentAnimation(document, options, ports),
};
