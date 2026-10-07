import type { UiTheme } from "$/base/theme/theme-definition";

export const macintoshTheme: UiTheme = {
  id: "macintosh",
  label: "Macintosh",
  async load(appearance) {
    const { macintoshArtwork } = await import("$/base/theme/themes/macintosh/artwork");
    return macintoshArtwork(appearance);
  },
};
