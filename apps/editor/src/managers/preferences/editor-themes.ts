import { AppearanceTheme } from "@xprite/editor-ui/appearance";
import { asepriteTheme, colorFamilyThemes, type UiTheme } from "@xprite/ui";

const THEMES: ReadonlyMap<string, UiTheme> = new Map(
  [...colorFamilyThemes, asepriteTheme].map((theme) => [theme.id, theme]),
);

/** The skin for a saved theme choice; unknown values fall back to the Aseprite artwork. */
export function editorUiTheme(theme: AppearanceTheme): UiTheme {
  return THEMES.get(theme) ?? asepriteTheme;
}

/** Theme choices in menu order, labelled by the skin that draws them. */
export const EDITOR_THEME_OPTIONS: readonly { value: AppearanceTheme; label: string }[] =
  Object.values(AppearanceTheme).map((value) => ({ value, label: editorUiTheme(value).label }));
