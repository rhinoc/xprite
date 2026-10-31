import { UiColorScheme } from "$/base/theme/theme-types";
import { COLOR_FAMILIES, colorFamilyColors } from "$/base/theme/themes/color-family/families";
import asepriteDark from "$assets/themes/aseprite/aseprite-dark-theme.json";
import aseprite from "$assets/themes/aseprite/aseprite-light-theme.json";

const CLASSIC_COLORS: Readonly<Record<UiColorScheme, Readonly<Record<string, string>>>> = {
  [UiColorScheme.Light]: aseprite.colors,
  [UiColorScheme.Dark]: asepriteDark.colors,
};

/** Page roles and the Aseprite color key each one takes; every text and face pair is a contrast pair. */
const PALETTE_KEYS = {
  face: "face",
  ink: "text",
  field: "textbox_face",
  frame: "workspace",
  frameInk: "tab_active_text",
  canvas: "editor_face",
  accent: "selected",
  accentInk: "selected_text",
  line: "check_focus_face",
  hot: "check_hot_face",
} as const;

export type ColorFamilyPalette = Readonly<Record<keyof typeof PALETTE_KEYS, string>>;

/**
 * Hex colors of one color family theme for static pages. Values come from the same rule as
 * the editor theme, so a page and the editor in that theme share every color.
 */
export function colorFamilyPalette(
  themeId: string,
  colorScheme: UiColorScheme,
): ColorFamilyPalette {
  const family = COLOR_FAMILIES.find((entry) => `color-family-${entry.id}` === themeId);
  if (!family) throw new Error(`Unknown color family theme: ${themeId}`);
  const colors = colorFamilyColors(CLASSIC_COLORS[colorScheme], family, colorScheme);
  return Object.fromEntries(
    Object.entries(PALETTE_KEYS).map(([role, key]) => [role, colors[key]]),
  ) as ColorFamilyPalette;
}
