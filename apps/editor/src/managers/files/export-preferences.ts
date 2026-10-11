import {
  AnimalCrossingDownloadKind,
  type AnimalCrossingExportOptions,
} from "$/managers/files/animal-crossing-export-options";
import type { ExportFileOptions, SpriteSheetOptions } from "@xprite/editor-core";

export enum ExportKind {
  Animation = "animation",
  Sheet = "sheet",
  AnimalCrossing = "animalCrossing",
}

export type ExportRecord =
  | { type: ExportKind.Animation; options: ExportFileOptions }
  | { type: ExportKind.Sheet; options: SpriteSheetOptions }
  | { type: ExportKind.AnimalCrossing; options: AnimalCrossingExportOptions };

export interface DocumentExportPreferences {
  lastType?: ExportKind;
  animation?: ExportFileOptions;
  sheet?: SpriteSheetOptions;
  animalCrossing?: AnimalCrossingExportOptions;
}

export function normalizeDocumentExportPreferences(value: unknown): DocumentExportPreferences {
  const source =
    value && typeof value === "object" ? (value as Partial<DocumentExportPreferences>) : {};
  const animal = source.animalCrossing;
  const animalSettings = animal?.settings;
  const validAnimal =
    !!animal &&
    !!animalSettings &&
    [animalSettings.title, animalSettings.creator, animalSettings.town].every(
      (value) => typeof value === "string",
    ) &&
    [animalSettings.cellWidth, animalSettings.cellHeight].every(
      (value) => Number.isInteger(value) && value > 0,
    ) &&
    [
      animalSettings.offsetX,
      animalSettings.offsetY,
      animalSettings.spacingX,
      animalSettings.spacingY,
    ].every((value) => Number.isInteger(value) && value >= 0) &&
    Object.values(AnimalCrossingDownloadKind).includes(animal.download) &&
    Number.isInteger(animal.selected) &&
    animal.selected >= 0;
  return {
    ...(validAnimal ? { animalCrossing: animal } : {}),
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
  if (preferences.lastType === ExportKind.AnimalCrossing && preferences.animalCrossing)
    return { type: ExportKind.AnimalCrossing, options: preferences.animalCrossing };
  return null;
}
