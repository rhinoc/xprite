import { describe, expect, it } from "vitest";

import { themeDefinition } from "$/base/theme/generated/themes/aseprite-light";
import { themeTokens } from "$/base/theme/theme-tokens";
import type { UiAppearance } from "$/base/theme/theme-types";
import { macintoshArtwork } from "$/base/theme/themes/macintosh/artwork";

const APPEARANCES: UiAppearance[] = ["light", "dark"];

describe("Macintosh control contract", () => {
  it.each(APPEARANCES)("covers every existing control part and color role in %s", (appearance) => {
    const { definition } = macintoshArtwork(appearance);
    expect(Object.keys(definition.parts).sort()).toEqual(Object.keys(themeDefinition.parts).sort());
    expect(Object.keys(definition.colors).sort()).toEqual(
      Object.keys(themeDefinition.colors).sort(),
    );
    for (const part of Object.values(definition.parts)) {
      expect(part.x + part.width).toBeLessThanOrEqual(definition.sheet.width);
      expect(part.y + part.height).toBeLessThanOrEqual(definition.sheet.height);
    }
  });

  it.each(APPEARANCES)(
    "keeps normal, selected, and window title text legible in %s",
    (appearance) => {
      const { colors } = macintoshArtwork(appearance).definition;
      for (const [ink, face] of [
        [colors.text, colors.window_face],
        [colors.listitem_normal_text, colors.listitem_normal_face],
        [colors.listitem_selected_text, colors.listitem_selected_face],
        [colors.menuitem_highlight_text, colors.menuitem_highlight_face],
        [colors.window_titlebar_text, colors.window_titlebar_face],
        [colors.tab_active_text, colors.tab_active_face],
      ])
        expect(ink).not.toBe(face);
    },
  );
  it.each(APPEARANCES)(
    "provides non-atlas visual slots and safe icon roles in %s",
    (appearance) => {
      const artwork = macintoshArtwork(appearance);
      const tokens = themeTokens(artwork);
      for (const key of [
        "--ui-field-face",
        "--ui-field-text",
        "--ui-field-font",
        "--ui-panel-header-face",
        "--ui-curve-background",
        "--ui-curve-border",
        "--ui-curve-grid",
        "--ui-curve-line",
        "--ui-curve-point",
        "--ui-native-slider-track-face",
        "--ui-native-slider-fill",
        "--ui-native-slider-thumb-face",
        "--ui-native-slider-border",
        "--ui-native-slider-radius",
        "--ui-native-slider-thumb-shadow",
        "--ui-scrollbar-track-pattern",
        "--ui-scrollbar-thumb-grip",
      ] as const)
        expect(tokens[key]).toBeTruthy();
      expect(tokens["--ui-field-face"]).not.toBe(tokens["--ui-field-text"]);
      expect(tokens["--ui-curve-background"]).not.toBe(tokens["--ui-curve-line"]);
      expect(artwork.definition.parts.window_play_icon.foregroundRole).toBe("text");
      expect(artwork.definition.parts.check_selected.foregroundRole).toBeUndefined();
      expect(artwork.definition.parts.scrollbar_bg.slices?.[0]).toBe(1);
    },
  );
});
