import {
  PixelationAlgorithm,
  CellColorPicker,
  getAllAlgorithms,
  getAllColorPickers,
  PixelationMode,
  PixelArtClassification,
} from "@xprite/editor-core/import-export/image/import";

export {
  PixelationAlgorithm,
  CellColorPicker,
  getAllAlgorithms,
  getAllColorPickers,
  PixelationMode,
  PixelArtClassification,
};

export enum SaveFileExtension {
  Aseprite = "aseprite",
  Png = "png",
}

export enum ImageExportExtension {
  Png = "png",
  Jpeg = "jpg",
  Webp = "webp",
  Gif = "gif",
  Apng = "apng",
}

export enum AnimationExportExtension {
  Gif = "gif",
  Apng = "apng",
  Webp = "webp",
}

export type ImportAction = "import-as-is" | "pixelate";

export interface FilePreferences {
  saveDefaultExtension: SaveFileExtension;
  imageDefaultExtension: ImageExportExtension;
  animationDefaultExtension: AnimationExportExtension;
  recentItemLimit: number;
  /** Whether the import dialog is shown for images that could be pixelated. */
  importAsk: boolean;
  /** What the dialog last did; applied silently when importAsk is off. */
  importLastAction: ImportAction;
  importPixelationAlgorithm: "auto" | "edge-grid" | "uniform-grid" | "resize";
  importColorPicker: CellColorPicker;
}
export type ExportExtensionDefaults = Pick<
  FilePreferences,
  "imageDefaultExtension" | "animationDefaultExtension"
>;

export const DEFAULT_FILE_PREFERENCES: Readonly<FilePreferences> = Object.freeze({
  saveDefaultExtension: SaveFileExtension.Aseprite,
  imageDefaultExtension: ImageExportExtension.Png,
  animationDefaultExtension: AnimationExportExtension.Gif,
  recentItemLimit: 16,
  importAsk: true,
  importLastAction: "pixelate",
  importPixelationAlgorithm: "auto",
  importColorPicker: CellColorPicker.MostCommon,
});

const MAX_RECENT_ITEM_LIMIT = 100;
const LEGACY_CHOICES: Readonly<Record<string, { ask: boolean; action?: ImportAction }>> = {
  "always-ask": { ask: true },
  "always-import-as-is": { ask: false, action: "import-as-is" },
  "always-pixelate": { ask: false, action: "pixelate" },
};

/** The session's view of the remembered import behaviour: ask, or silently repeat the last pick. */
const CHOICE_BY_ACTION = {
  "import-as-is": "always-import-as-is",
  pixelate: "always-pixelate",
} as const;
export function importPreferenceOf(prefs: FilePreferences) {
  return {
    choice: prefs.importAsk ? "always-ask" : CHOICE_BY_ACTION[prefs.importLastAction],
    algorithm: prefs.importPixelationAlgorithm,
    colorPicker: prefs.importColorPicker,
  };
}

export function normalizeFilePreferences(value: unknown): FilePreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const saveDefaultExtension = Object.values(SaveFileExtension).includes(
    saved.saveDefaultExtension as SaveFileExtension,
  )
    ? (saved.saveDefaultExtension as SaveFileExtension)
    : DEFAULT_FILE_PREFERENCES.saveDefaultExtension;
  const imageDefaultExtension = Object.values(ImageExportExtension).includes(
    saved.imageDefaultExtension as ImageExportExtension,
  )
    ? (saved.imageDefaultExtension as ImageExportExtension)
    : DEFAULT_FILE_PREFERENCES.imageDefaultExtension;
  const animationDefaultExtension = Object.values(AnimationExportExtension).includes(
    saved.animationDefaultExtension as AnimationExportExtension,
  )
    ? (saved.animationDefaultExtension as AnimationExportExtension)
    : DEFAULT_FILE_PREFERENCES.animationDefaultExtension;
  const recentItemLimit =
    typeof saved.recentItemLimit === "number" && Number.isFinite(saved.recentItemLimit)
      ? Math.max(0, Math.min(MAX_RECENT_ITEM_LIMIT, Math.trunc(saved.recentItemLimit)))
      : DEFAULT_FILE_PREFERENCES.recentItemLimit;
  // Older builds stored one combined choice; read it as ask + last action.
  const legacy = LEGACY_CHOICES[String(saved.importDialogChoice)];
  const importAsk =
    typeof saved.importAsk === "boolean"
      ? saved.importAsk
      : (legacy?.ask ?? DEFAULT_FILE_PREFERENCES.importAsk);
  const importLastAction: ImportAction =
    saved.importLastAction === "import-as-is" || saved.importLastAction === "pixelate"
      ? saved.importLastAction
      : (legacy?.action ?? DEFAULT_FILE_PREFERENCES.importLastAction);
  const importPixelationAlgorithm =
    saved.importPixelationAlgorithm === "auto" ||
    saved.importPixelationAlgorithm === "edge-grid" ||
    saved.importPixelationAlgorithm === "uniform-grid" ||
    saved.importPixelationAlgorithm === "resize"
      ? saved.importPixelationAlgorithm
      : DEFAULT_FILE_PREFERENCES.importPixelationAlgorithm;
  const importColorPicker = getAllColorPickers().includes(
    saved.importColorPicker as CellColorPicker,
  )
    ? (saved.importColorPicker as CellColorPicker)
    : DEFAULT_FILE_PREFERENCES.importColorPicker;

  return {
    saveDefaultExtension,
    imageDefaultExtension,
    animationDefaultExtension,
    recentItemLimit,
    importAsk,
    importLastAction,
    importPixelationAlgorithm,
    importColorPicker,
  };
}

export function fileNameWithExtension(name: string, extension: string): string {
  const trimmed = name.trim() || "Untitled";
  const stem = trimmed.replace(/\.[^.]+$/, "").trim() || "Untitled";
  return `${stem}.${extension}`;
}
