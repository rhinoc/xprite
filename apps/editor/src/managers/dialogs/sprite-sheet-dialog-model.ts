import { useDialogEditorSource } from "$/managers/dialogs/internal-editor-source";
import { timelineTags } from "@xprite/editor-core";
import type { PixelBuffer } from "@xprite/editor-core";
import { INT16_MIN } from "@xprite/editor-core/base";
import {
  changeImportSpriteSheetOptions,
  defaultImportSpriteSheetOptions,
  defaultSpriteSheetOptions,
  renderSpriteSheet,
  SheetLayout,
  spriteSheetTileCounts,
  AsepriteTagDirection,
} from "@xprite/editor-core/import-export";
import type {
  ImportSpriteSheetOptions,
  SpriteSheetOptions,
  SpriteSheetResult,
} from "@xprite/editor-core/import-export";

export const SpriteSheetLayoutChoice = Object.freeze({
  Horizontal: SheetLayout.Horizontal,
  Vertical: SheetLayout.Vertical,
  Rows: SheetLayout.Rows,
  Columns: SheetLayout.Columns,
  Packed: SheetLayout.Packed,
});
export const SPRITE_SHEET_ORIGIN_MIN = INT16_MIN;
export type SpriteSheetDialogOptions = SpriteSheetOptions;
export type ImportSpriteSheetDialogOptions = ImportSpriteSheetOptions;
export type SpriteSheetPreviewResult = SpriteSheetResult;
export interface SpriteSheetImageView extends Pick<PixelBuffer, "width" | "height" | "data"> {}

const EMPTY_SPRITE_SHEET_OPTIONS: SpriteSheetDialogOptions = {
  source: "sprite",
  name: "untitled.png",
  dataName: "untitled.json",
  scalePercent: 100,
  area: "canvas",
  layers: "visible",
  frame: 0,
  frames: "all",
  direction: AsepriteTagDirection.Forward,
  layout: SheetLayout.Rows,
  constraint: "none",
  constraintWidth: 1,
  constraintHeight: 1,
  borderPadding: 0,
  shapePadding: 0,
  innerPadding: 0,
  trimSprite: false,
  trimCels: false,
  trimByGrid: false,
  tagnameFormat: "{tag}",
  extrude: false,
  mergeDuplicates: false,
  powerOfTwo: false,
  splitLayers: false,
  splitTags: false,
  dataFormat: "hash",
  imageEnabled: false,
  dataEnabled: false,
  listLayers: true,
  listTags: true,
  listSlices: true,
  filenameFormat: "{title} {frame}.{extension}",
  openGenerated: false,
};

export function createImportSpriteSheetOptions(image: SpriteSheetImageView) {
  return defaultImportSpriteSheetOptions(image);
}

export function updateImportSpriteSheetOptions<K extends keyof ImportSpriteSheetDialogOptions>(
  image: SpriteSheetImageView,
  options: ImportSpriteSheetDialogOptions,
  key: K,
  value: ImportSpriteSheetDialogOptions[K],
) {
  return changeImportSpriteSheetOptions(image, options, key, value);
}

export function getImportSpriteSheetTileCounts(
  image: Pick<SpriteSheetImageView, "width" | "height">,
  options: ImportSpriteSheetDialogOptions,
) {
  return spriteSheetTileCounts(image, options);
}

export function useSpriteSheetDialogModel(documentKey?: string) {
  const { document, exportPreferences } = useDialogEditorSource(documentKey);
  const view = document
    ? {
        name: document.name,
        tags: document.timeline ? timelineTags(document.timeline).map((tag) => tag.name) : [],
      }
    : { name: "Untitled", tags: [] as string[] };
  return {
    document: view,
    available: !!document,
    createInitialOptions(
      initialSource?: SpriteSheetDialogOptions["source"],
    ): SpriteSheetDialogOptions {
      const options = document
        ? exportPreferences.sheet
          ? {
              ...structuredClone(exportPreferences.sheet),
              frame: document.timeline?.activeFrame ?? 0,
              area:
                exportPreferences.sheet.area === "selection" && document.selection
                  ? ("selection" as const)
                  : ("canvas" as const),
            }
          : defaultSpriteSheetOptions(document)
        : EMPTY_SPRITE_SHEET_OPTIONS;
      return initialSource
        ? {
            ...options,
            source: initialSource,
            ...(initialSource === "tilesets" ? { layers: "selected" as const } : {}),
          }
        : options;
    },
    renderPreview(options: SpriteSheetDialogOptions): SpriteSheetPreviewResult | null {
      if (!document) return null;
      return renderSpriteSheet(document, options);
    },
  };
}
