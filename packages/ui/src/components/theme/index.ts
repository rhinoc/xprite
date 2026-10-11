export {
  UIProvider,
  useUi,
  useUiColorScheme,
  useSystemColorScheme,
} from "$/components/theme/provider";
export type { UIProviderProps, UiContextValue, UiColorRole } from "$/components/theme/provider";
export { createUiPortal } from "$/components/theme/portal";
export { UiColorScheme } from "$/base/theme/theme-types";

export { asepriteTheme } from "$/base/theme/themes/aseprite";
export { macintoshTheme } from "$/base/theme/themes/macintosh";
export type {
  UiTheme,
  UiThemeArtwork,
  UiThemeTokens,
  UiCursorArtwork,
} from "$/base/theme/theme-definition";

export { UiFontRenderer } from "$/base/theme/theme-types";
export { FontRole } from "$/base/theme/theme-types";
export type { UiTypography, UiFontDefinition } from "$/base/theme/theme-types";
