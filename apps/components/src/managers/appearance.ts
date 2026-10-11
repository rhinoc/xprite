import { asepriteTheme, macintoshTheme, type UiTheme } from "@xprite/ui";

export const COMPONENTS_THEMES = [asepriteTheme, macintoshTheme] as const;
export interface ComponentsAppearance {
  theme: UiTheme;
}

export const DEFAULT_COMPONENTS_APPEARANCE: ComponentsAppearance = {
  theme: macintoshTheme,
};
