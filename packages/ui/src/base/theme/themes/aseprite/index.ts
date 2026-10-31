import { loadStylesheet } from "$/base/theme/load-stylesheet";
import type { UiTheme } from "$/base/theme/theme-definition";
import { UiColorScheme } from "$/base/theme/theme-types";
import { asepriteCursors } from "$/base/theme/themes/aseprite/cursors";
import { asepriteControlParts, asepriteSkinTokens } from "$/base/theme/themes/aseprite/skin";
import { asepriteTypography } from "$/base/theme/themes/aseprite/typography";

export const asepriteTheme: UiTheme = {
  id: "aseprite",
  label: "Aseprite",
  cursors: asepriteCursors,
  typography: asepriteTypography,
  async loadCjkFonts() {
    const href = (await import("$assets/fonts/aseprite/cjk-fonts.css?url")).default;
    await loadStylesheet(href);
  },
  async load(colorScheme) {
    await import("$assets/fonts/aseprite/fonts.css");
    const { themeDefinition, ...artwork } = await (colorScheme === UiColorScheme.Dark
      ? import("$/base/theme/generated/themes/aseprite-dark")
      : import("$/base/theme/generated/themes/aseprite-light"));
    return {
      ...artwork,
      definition: {
        ...themeDefinition,
        typography: asepriteTypography,
        controlParts: asepriteControlParts(),
      },
      tokens: {
        ...asepriteSkinTokens(themeDefinition.colors, colorScheme),
        "--ui-curve-background": "#000",
        "--ui-curve-border": "#ff0",
        "--ui-curve-grid": "#808000",
        "--ui-curve-line": "#fff",
        "--ui-curve-point": "#00f",
      },
    };
  },
};
