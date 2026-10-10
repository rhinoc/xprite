import { defaultUiTheme } from "$/base/theme/default-theme";
import { themeCjkFontFamily } from "$/base/theme/font-families";
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
const cjkFontPromises = new Map<string, Promise<boolean>>();
const CJK_FONT_LOAD_SIZE = 10;
const CJK_LANGUAGE_PATTERN = /^(?:zh|ja|ko)(?:-|$)/i;

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

function loadCjkFont(family: string) {
  const existing = cjkFontPromises.get(family);
  if (existing) return existing;
  const pending = (async () => {
    if (typeof document === "undefined" || !document.fonts) return false;
    try {
      const faces = await document.fonts.load(`${CJK_FONT_LOAD_SIZE}px ${family}`, "中");
      return faces.some((face) => face.family === family && face.status === "loaded");
    } catch {
      return false;
    }
  })();
  cjkFontPromises.set(family, pending);
  return pending;
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
  if (existing) {
    return existing.then(async (assets) => {
      const current = cachedAssets.get(variant) ?? assets;
      if (current.cjkFontReady || !CJK_LANGUAGE_PATTERN.test(language)) return current;
      const cjkFontReady = await loadCjkFont(themeCjkFontFamily(current.theme.typography?.default));
      const latest = cachedAssets.get(variant) ?? current;
      if (latest.cjkFontReady || !cjkFontReady) return latest;
      const ready = { ...latest, cjkFontReady };
      cachedAssets.set(variant, ready);
      for (const listener of themeCache(uiTheme).listeners.get(variant) ?? []) listener();
      return ready;
    });
  }
  const promise = loadThemeModule(variant, uiTheme).then(async (module) => {
    // Bitmap text and editor rasterization need the fallback ready synchronously.
    // Native-font skins can let actual CJK text request it, without blocking English startup.
    const needsCjkFont = !module.definition.typography || CJK_LANGUAGE_PATTERN.test(language);
    const [sheet, defaultFont, miniFont, cjkFontReady] = await Promise.all([
      loadImage(module.sheetUrl),
      loadImage(defaultFontUrl),
      loadImage(miniFontUrl),
      needsCjkFont
        ? loadCjkFont(themeCjkFontFamily(module.definition.typography?.default))
        : Promise.resolve(false),
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
