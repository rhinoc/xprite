/** Aseprite GIF options are global format preferences, independent of documents. */
import { optionalLocalStorage } from "@xprite/bedrock/browser/localstorage";
import { WebpCompression } from "@xprite/editor-core/import-export";
export { WebpCompression } from "@xprite/editor-core/import-export";
export interface GifExportPreferences {
  interlaced: boolean;
  loop: boolean;
  preservePaletteOrder: boolean;
  dontShow: boolean;
}
type SettingsStorage = Pick<Storage, "getItem" | "setItem">;
const key = "xse.export.gif-options.v1";
function storage(): SettingsStorage | undefined {
  return optionalLocalStorage();
}
export function readGifExportPreferences(store = storage()): GifExportPreferences {
  let saved: Partial<GifExportPreferences> = {};
  try {
    saved = JSON.parse(store?.getItem(key) ?? "{}") ?? {};
  } catch {}
  return {
    interlaced: saved.interlaced === true,
    loop: saved.loop !== false,
    preservePaletteOrder: saved.preservePaletteOrder === true,
    dontShow: saved.dontShow === true,
  };
}
export function writeGifExportPreferences(value: GifExportPreferences, store = storage()): void {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    /* Export itself does not depend on settings storage. */
  }
}

export enum ImageExportFormat {
  Jpeg = "jpg",
  Webp = "webp",
}
export interface ImageExportPreferences {
  qualityPercent: number;
  jpegMatte: string;
  webpCompression: WebpCompression;
}
export const DEFAULT_IMAGE_EXPORT_QUALITY = 90;
export const DEFAULT_JPEG_MATTE = "#ffffff";
const imageKey = "xse.export.image-options.v1";
export function readImageExportPreferences(
  format: ImageExportFormat,
  store = storage(),
): ImageExportPreferences {
  let saved: Partial<ImageExportPreferences> = {};
  try {
    saved = JSON.parse(store?.getItem(imageKey) ?? "{}")[format] ?? {};
  } catch {}
  return {
    webpCompression: Object.values(WebpCompression).includes(
      saved.webpCompression as WebpCompression,
    )
      ? saved.webpCompression!
      : WebpCompression.Lossless,
    qualityPercent:
      typeof saved.qualityPercent === "number" && Number.isFinite(saved.qualityPercent)
        ? Math.max(0, Math.min(100, saved.qualityPercent))
        : DEFAULT_IMAGE_EXPORT_QUALITY,
    jpegMatte:
      typeof saved.jpegMatte === "string" && /^#[0-9a-f]{6}$/i.test(saved.jpegMatte)
        ? saved.jpegMatte
        : DEFAULT_JPEG_MATTE,
  };
}
export function writeImageExportPreferences(
  format: ImageExportFormat,
  value: ImageExportPreferences,
  store = storage(),
): void {
  try {
    const saved = JSON.parse(store?.getItem(imageKey) ?? "{}");
    store?.setItem(imageKey, JSON.stringify({ ...saved, [format]: value }));
  } catch {
    /* Export is independent of preference storage. */
  }
}
