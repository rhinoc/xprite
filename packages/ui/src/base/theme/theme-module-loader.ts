import { defaultUiTheme } from "$/base/theme/default-theme";
import type { UiTheme, UiThemeArtwork } from "$/base/theme/theme-definition";
import type { UiStyleDefinition, UiColorScheme } from "$/base/theme/theme-types";

export interface ThemeModule extends UiThemeArtwork {
  colorScheme: UiColorScheme;
  uiTheme: UiTheme;
}

/** Serializable metadata for rendering and hydrating before bitmap resources load. */
export interface UiThemeSnapshot {
  themeId: string;
  colorScheme: UiColorScheme;
  definition: UiStyleDefinition;
  sheetUrl: string;
  tokens?: UiThemeArtwork["tokens"];
}

const modulePromises = new WeakMap<UiTheme, Map<UiColorScheme, Promise<ThemeModule>>>();

export function loadThemeModule(
  colorScheme: UiColorScheme,
  uiTheme: UiTheme = defaultUiTheme,
): Promise<ThemeModule> {
  let cache = modulePromises.get(uiTheme);
  if (!cache) {
    cache = new Map();
    modulePromises.set(uiTheme, cache);
  }
  const cached = cache.get(colorScheme);
  if (cached) return cached;
  const promise = uiTheme
    .load(colorScheme)
    .then((artwork) => ({ ...artwork, colorScheme, uiTheme }));
  cache.set(colorScheme, promise);
  void promise.catch(() => {
    if (cache.get(colorScheme) === promise) cache.delete(colorScheme);
  });
  return promise;
}
