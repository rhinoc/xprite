import {
  PixelationAlgorithm,
  CellColorPicker,
  OutlinePrepass,
  getAllColorPickers,
} from "@xprite/pixelate";

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
  /** The mode the dialog last used; silent import only applies to "import-as-is". */
  importLastAction: ImportAction;
  importPixelationAlgorithm: RememberedPixelationAlgorithm;
  /** The colour rule of the last import without a pre-pass; picking None brings it back. */
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
  importLastAction: "import-as-is",
  importPixelationAlgorithm: PixelationAlgorithm.Auto,
  importColorPicker: CellColorPicker.MostCommon,
});

const MAX_RECENT_ITEM_LIMIT = 100;
const LEGACY_CHOICES: Readonly<Record<string, { ask: boolean; action?: ImportAction }>> = {
  "always-ask": { ask: true },
  "always-import-as-is": { ask: false, action: "import-as-is" },
  "always-pixelate": { ask: true, action: "pixelate" },
};

/** The session's view of the remembered import behaviour: ask, or silently import originals as-is. */
export function importPreferenceOf(prefs: FilePreferences) {
  return {
    choice:
      !prefs.importAsk && prefs.importLastAction === "import-as-is"
        ? ("always-import-as-is" as const)
        : ("always-ask" as const),
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
  const importLastAction: ImportAction =
    saved.importLastAction === "import-as-is" || saved.importLastAction === "pixelate"
      ? saved.importLastAction
      : (legacy?.action ?? DEFAULT_FILE_PREFERENCES.importLastAction);
  const rawImportAsk =
    typeof saved.importAsk === "boolean"
      ? saved.importAsk
      : (legacy?.ask ?? DEFAULT_FILE_PREFERENCES.importAsk);
  // Silent import is only valid for Keep as is; pixelation always shows the dialog for tuning.
  const importAsk = rawImportAsk || importLastAction !== "import-as-is";
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
  };
}

export function fileNameWithExtension(name: string, extension: string): string {
  const trimmed = name.trim() || "Untitled";
  const stem = trimmed.replace(/\.[^.]+$/, "").trim() || "Untitled";
  return `${stem}.${extension}`;
}
