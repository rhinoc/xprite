import { defaultUiTheme } from "$/base/theme/default-theme";
import type { UiTheme, UiThemeTokens } from "$/base/theme/theme-definition";
import { loadThemeModule } from "$/base/theme/theme-module-loader";
import type { UiColorRole } from "$/base/theme/theme-name-types";
import { FontRole, UiFontRenderer } from "$/base/theme/theme-types";
import type { UiStyleDefinition, UiColorScheme } from "$/base/theme/theme-types";

export type UiBitmap = HTMLImageElement | HTMLCanvasElement;
export interface UiAssetBundle {
  sheet: UiBitmap;
  sheetUrl: string;
  fontAtlases: Readonly<Partial<Record<FontRole, UiBitmap>>>;
  cjkFontReady: boolean;
  language: string;
  theme: UiStyleDefinition;
  colorScheme: UiColorScheme;
  uiTheme: UiTheme;
  tokens?: UiThemeTokens;
  lightThemeColorRoles?: Readonly<Record<string, readonly UiColorRole[]>>;
}

const themeCaches = new WeakMap<
  UiTheme,
  {
    promises: Map<UiColorScheme, Promise<UiAssetBundle>>;
    assets: Map<UiColorScheme, UiAssetBundle>;
    listeners: Map<UiColorScheme, Set<() => void>>;
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
const FONT_ROLES: readonly FontRole[] = [FontRole.Primary, FontRole.Compact];
const CJK_LANGUAGE_PATTERN = /^(?:zh|ja|ko)(?:-|$)/i;
const TEXT_TOOL_CJK_FACES = [
  { family: "FusionPixel8", size: 8 },
  { family: "FusionPixel10", size: 10 },
  { family: "FusionPixel12", size: 12 },
];

function cjkFaceRequests(typography: UiStyleDefinition["typography"]) {
  const faces = FONT_ROLES.map((role) => ({
    family: typography[role].cjkFontFamily,
    size: typography[role].cjkFontSize,
  }));
  if (typography[FontRole.Primary].renderer === UiFontRenderer.Bitmap)
    faces.push(...TEXT_TOOL_CJK_FACES);
  const seen = new Set<string>();
  return faces.filter((face) => {
    if (seen.has(face.family)) return false;
    seen.add(face.family);
    return true;
  });
}

async function loadThemeCjkFonts(typography: UiStyleDefinition["typography"], uiTheme: UiTheme) {
  await uiTheme.loadCjkFonts?.();
  const ready = await Promise.all(
    cjkFaceRequests(typography).map((face) => loadCjkFont(face.family, face.size)),
  );
  return ready.every(Boolean);
}

export function subscribeThemeAssets(
  colorScheme: UiColorScheme,
  uiTheme: UiTheme,
  listener: () => void,
) {
  const { listeners } = themeCache(uiTheme);
  let selected = listeners.get(colorScheme);
  if (!selected) {
    selected = new Set();
    listeners.set(colorScheme, selected);
  }
  const current = selected;
  current.add(listener);
  return () => {
    current.delete(listener);
    if (!current.size && listeners.get(colorScheme) === current) listeners.delete(colorScheme);
  };
}

function loadCjkFont(family: string, size: number) {
  const existing = cjkFontPromises.get(family);
  if (existing) return existing;
  const pending = (async () => {
    if (typeof document === "undefined" || !document.fonts) return false;
    try {
      // "图" is outside the Latin-page base unicode-range, so this waits on the full CJK face.
      const faces = await document.fonts.load(`${size}px ${family}`, "图");
      return faces.some((face) => face.family === family && face.status === "loaded");
    } catch {
      return false;
    }
  })();
  cjkFontPromises.set(family, pending);
  void pending.then((ready) => {
    if (!ready && cjkFontPromises.get(family) === pending) cjkFontPromises.delete(family);
  });
  return pending;
}

const IMAGE_RETRY_DELAY_MS = 400;
/** Set while the page is being hidden or unloaded, when the browser cancels in-flight loads. */
let pageLeaving = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => (pageLeaving = true));
  window.addEventListener("pageshow", () => (pageLeaving = false));
}

function pageIsLeaving() {
  return pageLeaving || (typeof document !== "undefined" && document.visibilityState === "hidden");
}

/** A load that failed because the page was going away, not because the asset is broken. */
export class ThemeAssetInterruptedError extends Error {
  constructor(url: string) {
    super(`Theme asset load interrupted while the page was hiding: ${url}`);
    this.name = "ThemeAssetInterruptedError";
  }
}

/** Log a theme asset failure, except a load cut short by the page hiding or unloading. */
export function reportThemeAssetError(error: unknown) {
  if (error instanceof ThemeAssetInterruptedError) return;
  console.error(error);
}

function decodeImage(url: string) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
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
}

async function decodeImageWithRetry(url: string) {
  try {
    return await decodeImage(url);
  } catch (first) {
    // A transient network or cache error is common right after a deploy or tab restore.
    if (pageIsLeaving()) throw new ThemeAssetInterruptedError(url);
    await new Promise((resolve) => setTimeout(resolve, IMAGE_RETRY_DELAY_MS));
    try {
      return await decodeImage(url);
    } catch (second) {
      if (pageIsLeaving()) throw new ThemeAssetInterruptedError(url);
      throw second ?? first;
    }
  }
}

function loadImage(url: string) {
  const cached = softwareSources.get(url);
  if (cached) return cached;
  const result = decodeImageWithRetry(url);
  softwareSources.set(url, result);
  void result.catch(() => {
    if (softwareSources.get(url) === result) softwareSources.delete(url);
  });
  return result;
}

/** Uncached image load, exposed for tests. */
export const loadThemeImageForTest = decodeImageWithRetry;

async function loadThemeFonts(typography: UiStyleDefinition["typography"]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    FONT_ROLES.map((role) => {
      const font = typography[role];
      return document.fonts.load(`${font.fontSize}px ${font.fontFamily}`);
    }),
  );
}

async function ensureThemeCjkFonts(assets: UiAssetBundle): Promise<UiAssetBundle> {
  const { assets: cachedAssets, listeners } = themeCache(assets.uiTheme);
  const current = cachedAssets.get(assets.colorScheme) ?? assets;
  if (current.cjkFontReady) return current;
  const cjkFontReady = await loadThemeCjkFonts(current.theme.typography, current.uiTheme);
  const latest = cachedAssets.get(assets.colorScheme) ?? current;
  if (latest.cjkFontReady || !cjkFontReady) return latest;
  const ready = { ...latest, cjkFontReady };
  cachedAssets.set(assets.colorScheme, ready);
  for (const listener of listeners.get(assets.colorScheme) ?? []) listener();
  return ready;
}

/** Load the selected theme module, its atlas, and its declared fonts once. */
export function preloadThemeAssets(
  colorScheme: UiColorScheme,
  language = "en",
  uiTheme: UiTheme = defaultUiTheme,
) {
  const { promises: assetsPromises, assets: cachedAssets } = themeCache(uiTheme);
  const existing = assetsPromises.get(colorScheme);
  if (existing) {
    return existing.then(async (assets) => {
      const current = cachedAssets.get(colorScheme) ?? assets;
      if (current.cjkFontReady || !CJK_LANGUAGE_PATTERN.test(language)) return current;
      return ensureThemeCjkFonts(current);
    });
  }
  const promise = loadThemeModule(colorScheme, uiTheme).then(async (module) => {
    const typography = module.definition.typography;
    const needsCjkFont = CJK_LANGUAGE_PATTERN.test(language);
    const [sheet, fonts, cjkFontReady] = await Promise.all([
      loadImage(module.sheetUrl),
      Promise.all(
        FONT_ROLES.map(async (role) => {
          const font = typography[role];
          return [
            role,
            font.renderer === UiFontRenderer.Bitmap ? await loadImage(font.atlas.url) : undefined,
          ] as const;
        }),
      ),
      needsCjkFont ? loadThemeCjkFonts(typography, uiTheme) : Promise.resolve(false),
      loadThemeFonts(typography),
    ]);
    const fontAtlases = Object.fromEntries(fonts.filter(([, atlas]) => atlas !== undefined));
    const assets: UiAssetBundle = {
      sheet,
      sheetUrl: module.sheetUrl,
      fontAtlases,
      cjkFontReady,
      language,
      theme: module.definition,
      colorScheme,
      uiTheme,
      tokens: module.tokens,
      lightThemeColorRoles: module.lightThemeColorRoles,
    };
    cachedAssets.set(colorScheme, assets);
    for (const listener of themeCache(uiTheme).listeners.get(colorScheme) ?? []) listener();
    if (!needsCjkFont && typography[FontRole.Primary].renderer === UiFontRenderer.Bitmap) {
      // User-provided text can contain CJK even when the interface language does not.
      // Start after the initial assets are ready, without holding up the first screen.
      void ensureThemeCjkFonts(assets).catch(reportThemeAssetError);
    }
    return assets;
  });
  assetsPromises.set(colorScheme, promise);
  void promise.catch(() => {
    if (assetsPromises.get(colorScheme) === promise) assetsPromises.delete(colorScheme);
  });
  return promise;
}

export function getThemeAssets(colorScheme: UiColorScheme, uiTheme: UiTheme = defaultUiTheme) {
  return themeCache(uiTheme).assets.get(colorScheme) ?? null;
}
