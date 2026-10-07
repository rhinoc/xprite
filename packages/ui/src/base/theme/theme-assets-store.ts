import { defaultUiTheme } from "$/base/theme/default-theme";
import { themeGlyphAssets } from "$/base/theme/theme-assets";
import type { UiTheme, UiThemeTokens } from "$/base/theme/theme-definition";
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
  uiTheme: UiTheme;
  tokens?: UiThemeTokens;
  lightThemeColorRoles?: Readonly<Record<string, readonly UiColorRole[]>>;
}

const themeCaches = new WeakMap<
  UiTheme,
  {
    promises: Map<UiAppearance, Promise<UiAssetBundle>>;
    assets: Map<UiAppearance, UiAssetBundle>;
    listeners: Map<UiAppearance, Set<() => void>>;
  }
>();
function themeCache(uiTheme: UiTheme) {
  let cache = themeCaches.get(uiTheme);
  if (!cache) {
    cache = { promises: new Map(), assets: new Map(), listeners: new Map() };
    themeCaches.set(uiTheme, cache);
  }
  return cache;
}
const softwareSources = new Map<string, Promise<HTMLCanvasElement>>();
let fusionPixelFontPromise: Promise<boolean> | undefined;
const FUSION_PIXEL_FONT_LOAD_SAMPLE = "10px FusionPixelZhHans";

export function subscribeThemeAssets(
  variant: UiAppearance,
  uiTheme: UiTheme,
  listener: () => void,
) {
  const { listeners } = themeCache(uiTheme);
  let selected = listeners.get(variant);
  if (!selected) {
    selected = new Set();
    listeners.set(variant, selected);
  }
  const current = selected;
  current.add(listener);
  return () => {
    current.delete(listener);
    if (!current.size && listeners.get(variant) === current) listeners.delete(variant);
  };
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

async function loadThemeFonts(typography: UiStyleDefinition["typography"]): Promise<void> {
  if (!typography || typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    Object.values(typography).map((font) =>
      document.fonts.load(`${font.fontSize}px ${font.fontFamily}`),
    ),
  );
}

/** Load the selected theme module, its atlas, and shared font atlases once. */
export function preloadThemeAssets(
  variant: UiAppearance,
  language = "en",
  uiTheme: UiTheme = defaultUiTheme,
) {
  const { promises: assetsPromises, assets: cachedAssets } = themeCache(uiTheme);
  const existing = assetsPromises.get(variant);
  if (existing) return existing;
  const promise = loadThemeModule(variant, uiTheme).then(async (module) => {
    const [sheet, defaultFont, miniFont, cjkFontReady] = await Promise.all([
      loadImage(module.sheetUrl),
      loadImage(defaultFontUrl),
      loadImage(miniFontUrl),
      loadFusionPixelFont(),
      loadThemeFonts(module.definition.typography),
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
      uiTheme,
      tokens: module.tokens,
      lightThemeColorRoles: module.lightThemeColorRoles,
    };
    cachedAssets.set(variant, assets);
    for (const listener of themeCache(uiTheme).listeners.get(variant) ?? []) listener();
    return assets;
  });
  assetsPromises.set(variant, promise);
  void promise.catch(() => {
    if (assetsPromises.get(variant) === promise) assetsPromises.delete(variant);
  });
  return promise;
}

export function getThemeAssets(variant: UiAppearance, uiTheme: UiTheme = defaultUiTheme) {
  return themeCache(uiTheme).assets.get(variant) ?? null;
}
