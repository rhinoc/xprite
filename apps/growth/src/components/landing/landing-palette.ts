import { colorFamilyPalette, UiColorScheme, type ColorFamilyPalette } from "@xprite/ui";

/** The editor theme whose colors the About page uses. */
const LANDING_THEME = "color-family-moss";

const VARIABLES: Readonly<Record<keyof ColorFamilyPalette, string>> = {
  face: "--landing-face",
  ink: "--landing-ink",
  field: "--landing-field",
  frame: "--landing-frame",
  frameInk: "--landing-frame-ink",
  canvas: "--landing-canvas",
  accent: "--landing-accent",
  accentInk: "--landing-accent-ink",
  line: "--landing-line",
  hot: "--landing-hot",
};

function declarations(colorScheme: UiColorScheme) {
  const palette = colorFamilyPalette(LANDING_THEME, colorScheme);
  return Object.entries(VARIABLES)
    .map(([role, variable]) => `${variable}:${palette[role as keyof ColorFamilyPalette]}`)
    .join(";");
}

/**
 * The page colors for both appearances. The root's `data-ui-appearance` follows the saved
 * appearance at startup and the menubar Appearance menu afterwards, so one rule per value
 * keeps the page in step without any script.
 */
export function landingStylesheet(): string {
  return [UiColorScheme.Light, UiColorScheme.Dark]
    .map(
      (colorScheme) =>
        `:root[data-ui-appearance="${colorScheme}"] [data-landing]{${declarations(colorScheme)}}`,
    )
    .join("\n");
}
