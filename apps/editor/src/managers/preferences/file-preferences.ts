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

export interface FilePreferences {
  saveDefaultExtension: SaveFileExtension;
  imageDefaultExtension: ImageExportExtension;
  animationDefaultExtension: AnimationExportExtension;
  recentItemLimit: number;
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
});

const MAX_RECENT_ITEM_LIMIT = 100;

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

  return {
    saveDefaultExtension,
    imageDefaultExtension,
    animationDefaultExtension,
    recentItemLimit,
  };
}

export function fileNameWithExtension(name: string, extension: string): string {
  const trimmed = name.trim() || "Untitled";
  const stem = trimmed.replace(/\.[^.]+$/, "").trim() || "Untitled";
  return `${stem}.${extension}`;
}
