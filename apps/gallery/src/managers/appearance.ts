import { asepriteTheme, macintoshTheme, type UiTheme } from "@xprite/ui";

export const GALLERY_THEMES = [asepriteTheme, macintoshTheme] as const;
export interface GalleryAppearance {
  theme: UiTheme;
}

export const DEFAULT_GALLERY_APPEARANCE: GalleryAppearance = {
  theme: macintoshTheme,
};
