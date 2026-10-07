import { defaultUiTheme } from "$/base/theme/default-theme";
import type { UiTheme, UiThemeArtwork } from "$/base/theme/theme-definition";
import type { UiStyleDefinition, UiAppearance } from "$/base/theme/theme-types";

export interface ThemeModule extends UiThemeArtwork {
  variant: UiAppearance;
  uiTheme: UiTheme;
}

/** Serializable metadata for rendering and hydrating before bitmap resources load. */
export interface UiThemeSnapshot {
  themeId: string;
  appearance: UiAppearance;
  definition: UiStyleDefinition;
  sheetUrl: string;
  tokens?: UiThemeArtwork["tokens"];
}

const modulePromises = new WeakMap<UiTheme, Map<UiAppearance, Promise<ThemeModule>>>();

export function loadThemeModule(
  variant: UiAppearance,
  uiTheme: UiTheme = defaultUiTheme,
): Promise<ThemeModule> {
  let cache = modulePromises.get(uiTheme);
  if (!cache) {
    cache = new Map();
    modulePromises.set(uiTheme, cache);
  }
  const cached = cache.get(variant);
  if (cached) return cached;
  const promise = uiTheme.load(variant).then((artwork) => ({ ...artwork, variant, uiTheme }));
  cache.set(variant, promise);
  void promise.catch(() => {
    if (cache.get(variant) === promise) cache.delete(variant);
  });
  return promise;
}
