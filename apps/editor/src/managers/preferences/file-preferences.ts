import {
  PixelationAlgorithm,
  CellColorPicker,
  DEFAULT_LINE_GUIDE,
  LineGuideMode,
  OutlinePrepass,
  PaletteColorMode,
  PixelationDither,
  getAllColorPickers,
} from "@xprite/editor-core/import-export/image/import";
import type { ImportPixelationMemory } from "@xprite/editor-core/session";

export { PixelationAlgorithm, CellColorPicker, OutlinePrepass };

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

/** Grid algorithms the next import starts with; Custom size and the plain resize are one-offs. */
export type RememberedPixelationAlgorithm = Exclude<
  PixelationAlgorithm,
  PixelationAlgorithm.CustomSize | PixelationAlgorithm.Resize
>;
const ONE_OFF_ALGORITHMS: ReadonlySet<PixelationAlgorithm> = new Set([
  PixelationAlgorithm.CustomSize,
  PixelationAlgorithm.Resize,
]);
export function isRememberedPixelationAlgorithm(
  value: unknown,
): value is RememberedPixelationAlgorithm {
  return (
    Object.values(PixelationAlgorithm).includes(value as PixelationAlgorithm) &&
    !ONE_OFF_ALGORITHMS.has(value as PixelationAlgorithm)
  );
}

export interface FilePreferences {
  saveDefaultExtension: SaveFileExtension;
  imageDefaultExtension: ImageExportExtension;
  animationDefaultExtension: AnimationExportExtension;
  recentItemLimit: number;
  /** Whether the import dialog is shown for images that could be pixelated. */
  importAsk: boolean;
  /** What the dialog last did; applied silently when importAsk is off. */
  importLastAction: ImportAction;
  importPixelationAlgorithm: RememberedPixelationAlgorithm;
  /** The colour rule of the last import without a pre-pass; picking None brings it back. */
  importColorPicker: CellColorPicker;
  /**
   * The pixelation of the last Pixelate import from the dialog, repeated by the silent path ("Don't
   * ask me again"). Null until the dialog has imported once; the dialog itself never opens on it.
   */
  importPixelation: ImportPixelationMemory | null;
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
  importLastAction: "import-as-is",
  importPixelationAlgorithm: PixelationAlgorithm.Auto,
  importColorPicker: CellColorPicker.MostCommon,
  importPixelation: null,
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
    pixelation: prefs.importPixelation,
  };
}

const MAX_COLORS = 256;
/** A saved Pixelate import, or null when it is missing or unreadable. */
function normalizeImportPixelation(value: unknown): ImportPixelationMemory | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Record<string, unknown>;
  if (!Object.values(OutlinePrepass).includes(saved.prepass as OutlinePrepass)) return null;
  return {
    prepass: saved.prepass as OutlinePrepass,
    lineGuide: Object.values(LineGuideMode).includes(saved.lineGuide as LineGuideMode)
      ? (saved.lineGuide as LineGuideMode)
      : DEFAULT_LINE_GUIDE,
    ...(getAllColorPickers().includes(saved.colorPicker as CellColorPicker)
      ? { colorPicker: saved.colorPicker as CellColorPicker }
      : {}),
    ...(typeof saved.reduceColors === "boolean" ? { reduceColors: saved.reduceColors } : {}),
    ...(typeof saved.maxColors === "number" && Number.isFinite(saved.maxColors)
      ? { maxColors: Math.max(2, Math.min(MAX_COLORS, Math.round(saved.maxColors))) }
      : {}),
    ...(Object.values(PixelationDither).includes(saved.dither as PixelationDither)
      ? { dither: saved.dither as PixelationDither }
      : {}),
    ...(Object.values(PaletteColorMode).includes(saved.paletteColorMode as PaletteColorMode)
      ? { paletteColorMode: saved.paletteColorMode as PaletteColorMode }
      : {}),
    ...(typeof saved.removeNoise === "boolean" ? { removeNoise: saved.removeNoise } : {}),
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
  const importPixelationAlgorithm = isRememberedPixelationAlgorithm(saved.importPixelationAlgorithm)
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
    importPixelation: normalizeImportPixelation(saved.importPixelation),
  };
}

export function fileNameWithExtension(name: string, extension: string): string {
  const trimmed = name.trim() || "Untitled";
  const stem = trimmed.replace(/\.[^.]+$/, "").trim() || "Untitled";
  return `${stem}.${extension}`;
}
