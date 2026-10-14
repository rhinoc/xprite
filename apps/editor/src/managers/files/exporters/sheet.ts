import { tUi } from "$/i18n";
import { exportDocumentSpriteSheet } from "$/managers/files/export-animation";
import { ExporterGroup, type ExporterDefinition } from "$/managers/files/exporter-registry";
import { tilesetExportSource } from "$/managers/files/tileset-export-source";
import { colorProfileToSrgb, workingColorProfile } from "@xprite/editor-core/color";
import type { SpriteSheetOptions } from "@xprite/editor-core/import-export";

export enum SheetExporterId {
  SpriteSheet = "sprite-sheet",
  Tileset = "tileset",
}
export interface SheetExporterSource {
  documentKey: string;
  initialSource: "sprite" | "tilesets";
  preview(result: { pixels: import("@xprite/editor-core/base").PixelBuffer } | null): void;
}

export function normalizeSheetExportOptions(value: unknown): SpriteSheetOptions | null {
  if (!value || typeof value !== "object") return null;
  const options = value as SpriteSheetOptions;
  return typeof options.name === "string" && typeof options.dataName === "string" ? options : null;
}

export function sheetExporterDefinition(
  id: SheetExporterId,
): ExporterDefinition<SheetExporterSource, SpriteSheetOptions> {
  const tiles = id === SheetExporterId.Tileset;
  return {
    id,
    label: () => tUi(tiles ? "ui.tileset" : "ui.sprite.sheet"),
    group: ExporterGroup.Sheets,
    initialSize: { width: 562, height: 282 },
    helpUrl: "https://www.aseprite.org/docs/sprite-sheet/#export",
    available: ({ document }) =>
      !tiles || document.timeline?.layers[document.timeline.activeLayer]?.kind === "tilemap",
    normalizeOptions: normalizeSheetExportOptions,
    canRepeat: ({ document }, options) =>
      options.source !== "tilesets" ||
      document.timeline?.layers[document.timeline.activeLayer]?.kind === "tilemap",
    createSource: ({ documentKey, preview }) => ({
      documentKey,
      initialSource: tiles ? "tilesets" : "sprite",
      preview: (result) => preview(result?.pixels ?? null),
    }),
    async execute({ document }, options, ports) {
      const source = options.source === "tilesets" ? tilesetExportSource(document) : document;
      const result = await exportDocumentSpriteSheet(source, options, ports);
      return {
        names: result.names,
        ...(options.openGenerated
          ? {
              generated: {
                pixels: result.pixels,
                palette: source.palette?.map((color) =>
                  colorProfileToSrgb(color, workingColorProfile(source.timeline)),
                ),
                name: options.name,
              },
            }
          : {}),
      };
    },
  };
}
