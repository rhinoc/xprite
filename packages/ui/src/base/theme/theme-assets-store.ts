import { themeGlyphAssets } from "$/base/theme/theme-assets";
import { loadThemeModule } from "$/base/theme/theme-module-loader";
import type { UiColorRole } from "$/base/theme/theme-name-types";
import type { UiStyleDefinition, UiAppearance } from "$/base/theme/theme-types";

const { defaultGlyphAtlasUrl: defaultFontUrl, miniGlyphAtlasUrl: miniFontUrl } = themeGlyphAssets;

export type UiBitmap = HTMLImageElement | HTMLCanvasElement;
export interface UiAssetBundle {
  sheet: UiBitmap;
  sheetUrl: string;
  defaultFont: UiBitmap;
  miniFont: UiBitmap;
  cjkFontReady: boolean;
  language: string;
  theme: UiStyleDefinition;
  variant: UiAppearance;
  lightThemeColorRoles?: Readonly<Record<string, readonly UiColorRole[]>>;
}

const assetsPromises = new Map<UiAppearance, Promise<UiAssetBundle>>();
const cachedAssets = new Map<UiAppearance, UiAssetBundle>();
const assetListeners = new Set<() => void>();
const softwareSources = new Map<string, Promise<HTMLCanvasElement>>();
let assetRevision = 0;
let fusionPixelFontPromise: Promise<boolean> | undefined;
const FUSION_PIXEL_FONT_LOAD_SAMPLE = "10px FusionPixelZhHans";

export function subscribeThemeAssets(listener: () => void) {
  assetListeners.add(listener);
  return () => assetListeners.delete(listener);
}

export function themeAssetsRevision() {
  return assetRevision;
}

function publishThemeAssets() {
  assetRevision++;
  for (const listener of assetListeners) listener();
}

function loadFusionPixelFont() {
  if (fusionPixelFontPromise) return fusionPixelFontPromise;
  fusionPixelFontPromise = (async () => {
    if (typeof document === "undefined" || !document.fonts) return false;
    try {
      const faces = await document.fonts.load(FUSION_PIXEL_FONT_LOAD_SAMPLE, "中");
      return faces.some((face) => face.family === "FusionPixelZhHans" && face.status === "loaded");
    } catch {
      return false;
    }
  })();
  return fusionPixelFontPromise;
}

function loadImage(url: string) {
  const cached = softwareSources.get(url);
  if (cached) return cached;
  const result = new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        reject(new Error("Cannot create theme asset software surface"));
        return;
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error(`Cannot load theme asset: ${url}`));
    image.src = url;
  });
  softwareSources.set(url, result);
  void result.catch(() => {
    if (softwareSources.get(url) === result) softwareSources.delete(url);
  });
  return result;
}

/** Load the selected theme module, its atlas, and shared font atlases once. */
export function preloadThemeAssets(variant: UiAppearance, language = "en") {
  const existing = assetsPromises.get(variant);
  if (existing) return existing;
  const promise = loadThemeModule(variant).then(async (module) => {
    const [sheet, defaultFont, miniFont, cjkFontReady] = await Promise.all([
      loadImage(module.sheetUrl),
      loadImage(defaultFontUrl),
      loadImage(miniFontUrl),
      loadFusionPixelFont(),
    ]);
    const assets: UiAssetBundle = {
      sheet,
      sheetUrl: module.sheetUrl,
      defaultFont,
      miniFont,
      cjkFontReady,
      language,
      theme: module.definition,
      variant,
      lightThemeColorRoles: module.lightThemeColorRoles,
    };
    cachedAssets.set(variant, assets);
    publishThemeAssets();
    return assets;
  });
  assetsPromises.set(variant, promise);
  void promise.catch(() => {
    if (assetsPromises.get(variant) === promise) assetsPromises.delete(variant);
  });
  return promise;
}

export function getThemeAssets(variant: UiAppearance) {
  return cachedAssets.get(variant) ?? null;
}
