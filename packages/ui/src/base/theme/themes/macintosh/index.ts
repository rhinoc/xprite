import { loadStylesheet } from "$/base/theme/load-stylesheet";
import type { UiTheme } from "$/base/theme/theme-definition";
import { asepriteCursors } from "$/base/theme/themes/aseprite/cursors";
import { macintoshTypography } from "$/base/theme/themes/macintosh/typography";

export const macintoshTheme: UiTheme = {
  id: "macintosh",
  label: "Macintosh",
  cursors: asepriteCursors,
  typography: macintoshTypography,
  async loadCjkFonts() {
    const href = (await import("$assets/fonts/macintosh/cjk-fonts.css?url")).default;
    await loadStylesheet(href);
  },
  async load(colorScheme) {
    await import("$assets/fonts/macintosh/fonts.css");
    const { macintoshArtwork } = await import("$/base/theme/themes/macintosh/artwork");
    return macintoshArtwork(colorScheme);
  },
};
