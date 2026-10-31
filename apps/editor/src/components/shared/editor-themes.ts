import { tUi, type UiMessageKey } from "$/i18n";
import { AppearanceTheme } from "@xprite/editor-ui/appearance";
import { asepriteTheme, colorFamilyThemes, type UiTheme } from "@xprite/ui";

const THEMES: ReadonlyMap<string, UiTheme> = new Map(
  [...colorFamilyThemes, asepriteTheme].map((theme) => [theme.id, theme]),
);

/** The skin for a saved theme choice; unknown values fall back to the Aseprite artwork. */
export function editorUiTheme(theme: AppearanceTheme): UiTheme {
  return THEMES.get(theme) ?? asepriteTheme;
}

const THEME_LABELS: Readonly<Record<AppearanceTheme, UiMessageKey>> = {
  [AppearanceTheme.Ocean]: "ui.theme.ocean",
  [AppearanceTheme.OceanVivid]: "ui.theme.ocean.vivid",
  [AppearanceTheme.Moss]: "ui.theme.moss",
  [AppearanceTheme.MossVivid]: "ui.theme.moss.vivid",
  [AppearanceTheme.Ember]: "ui.theme.ember",
  [AppearanceTheme.EmberVivid]: "ui.theme.ember.vivid",
  [AppearanceTheme.Grape]: "ui.theme.grape",
  [AppearanceTheme.GrapeVivid]: "ui.theme.grape.vivid",
  [AppearanceTheme.Mustard]: "ui.theme.mustard",
  [AppearanceTheme.MustardVivid]: "ui.theme.mustard.vivid",
  [AppearanceTheme.Cocoa]: "ui.theme.cocoa",
  [AppearanceTheme.CocoaVivid]: "ui.theme.cocoa.vivid",
  [AppearanceTheme.Aseprite]: "ui.theme.aseprite",
};

/** Theme choices in menu order, in the current interface language. */
export function editorThemeOptions(): readonly { value: AppearanceTheme; label: string }[] {
  return Object.values(AppearanceTheme).map((value) => ({
    value,
    label: tUi(THEME_LABELS[value]),
  }));
}
