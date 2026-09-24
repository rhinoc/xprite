import type { ExportFileOptions, SpriteSheetOptions } from "@xprite/editor-core";

export enum ExportKind {
  Animation = "animation",
  Sheet = "sheet",
}

export type ExportRecord =
  | { type: ExportKind.Animation; options: ExportFileOptions }
  | { type: ExportKind.Sheet; options: SpriteSheetOptions };

export interface DocumentExportPreferences {
  lastType?: ExportKind;
  animation?: ExportFileOptions;
  sheet?: SpriteSheetOptions;
}

export function normalizeDocumentExportPreferences(value: unknown): DocumentExportPreferences {
  const source =
    value && typeof value === "object" ? (value as Partial<DocumentExportPreferences>) : {};
  return {
    ...(Object.values(ExportKind).includes(source.lastType as ExportKind)
      ? { lastType: source.lastType }
      : {}),
    ...(typeof source.animation?.name === "string" ? { animation: source.animation } : {}),
    ...(typeof source.sheet?.name === "string" && typeof source.sheet.dataName === "string"
      ? { sheet: source.sheet }
      : {}),
  };
}

export function lastDocumentExport(preferences: DocumentExportPreferences): ExportRecord | null {
  if (preferences.lastType === ExportKind.Animation && preferences.animation)
    return { type: ExportKind.Animation, options: preferences.animation };
  if (preferences.lastType === ExportKind.Sheet && preferences.sheet)
    return { type: ExportKind.Sheet, options: preferences.sheet };
  return null;
}
