export enum AppearanceMode {
  Light = "light",
  Dark = "dark",
  System = "system",
}
export type ResolvedAppearance = Exclude<AppearanceMode, AppearanceMode.System>;
export const APPEARANCE_MODE_STORAGE_KEY = "xse.ui.appearance-mode.v1";
export const APPEARANCE_THEME_STORAGE_KEY = "xse.ui.theme.v1";

/** Editor color themes; Aseprite keeps the original artwork and stays the default. */
export enum AppearanceTheme {
  Ocean = "color-family-ocean",
  OceanVivid = "color-family-ocean-vivid",
  Moss = "color-family-moss",
  MossVivid = "color-family-moss-vivid",
  Ember = "color-family-ember",
  EmberVivid = "color-family-ember-vivid",
  Grape = "color-family-grape",
  GrapeVivid = "color-family-grape-vivid",
  Mustard = "color-family-mustard",
  MustardVivid = "color-family-mustard-vivid",
  Cocoa = "color-family-cocoa",
  CocoaVivid = "color-family-cocoa-vivid",
  Aseprite = "aseprite",
}
export const DEFAULT_APPEARANCE_THEME = AppearanceTheme.Aseprite;
const APPEARANCE_THEMES = new Set<string>(Object.values(AppearanceTheme));

export function resolveAppearanceMode(
  mode: AppearanceMode,
  system: ResolvedAppearance,
): ResolvedAppearance {
  return mode === AppearanceMode.System ? system : mode;
}

export function readAppearanceMode(storage: {
  getItem(key: string): string | null;
}): AppearanceMode {
  try {
    const saved = storage.getItem(APPEARANCE_MODE_STORAGE_KEY);
    if (
      saved === AppearanceMode.Light ||
      saved === AppearanceMode.Dark ||
      saved === AppearanceMode.System
    )
      return saved;
  } catch {
    /* Storage is optional; the editor's default is light. */
  }
  return AppearanceMode.Light;
}

export function readAppearanceTheme(storage: {
  getItem(key: string): string | null;
}): AppearanceTheme {
  try {
    const saved = storage.getItem(APPEARANCE_THEME_STORAGE_KEY);
    if (saved && APPEARANCE_THEMES.has(saved)) return saved as AppearanceTheme;
  } catch {
    /* Storage is optional; the default theme applies. */
  }
  return DEFAULT_APPEARANCE_THEME;
}
