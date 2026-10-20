import { describe, expect, it } from "vitest";

import { themeDefinition } from "$/base/theme/generated/themes/aseprite-light";
import { themeTokens } from "$/base/theme/theme-tokens";
import { UiColorScheme } from "$/base/theme/theme-types";
import { macintoshArtwork } from "$/base/theme/themes/macintosh/artwork";

const COLOR_SCHEMES = [UiColorScheme.Light, UiColorScheme.Dark];

describe("Macintosh control contract", () => {
  it.each(COLOR_SCHEMES)(
    "covers every existing control part and color role in %s",
    (colorScheme) => {
      const { definition } = macintoshArtwork(colorScheme);
      expect(Object.keys(definition.parts).sort()).toEqual(
        Object.keys(themeDefinition.parts).sort(),
      );
      // Macintosh may add optional roles (e.g. menuitem_disabled_text, which components read
      // with a fallback), but must cover every role the Aseprite theme defines.
      expect(Object.keys(definition.colors)).toEqual(
        expect.arrayContaining(Object.keys(themeDefinition.colors)),
      );
      for (const part of Object.values(definition.parts)) {
        expect(part.x + part.width).toBeLessThanOrEqual(definition.sheet.width);
        expect(part.y + part.height).toBeLessThanOrEqual(definition.sheet.height);
      }
    },
  );

  // build-macintosh-theme.py packs one part per 40px cell in the Aseprite manifest order. A part
  // inserted into the sheet without regenerating these coordinates shifts every later part onto
  // its neighbour's artwork (e.g. editor_normal reading a house glyph as a 9-slice frame).
  it.each(COLOR_SCHEMES)("reads each part from its own atlas cell in %s", (colorScheme) => {
    const { definition } = macintoshArtwork(colorScheme);
    const cell = 40;
    const columns = definition.sheet.width / cell;
    const misplaced = Object.keys(themeDefinition.parts).flatMap((name, index) => {
      const part = definition.parts[name as keyof typeof definition.parts];
      const x = (index % columns) * cell;
      const y = Math.floor(index / columns) * cell;
      return part.x === x && part.y === y ? [] : [name];
    });
    expect(misplaced).toEqual([]);
  });

  it.each(COLOR_SCHEMES)(
    "keeps unselected, selected, and window title text legible in %s",
    (colorScheme) => {
      const { colors } = macintoshArtwork(colorScheme).definition;
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
  it.each(COLOR_SCHEMES)(
    "provides non-atlas visual slots and safe icon roles in %s",
    (colorScheme) => {
      const artwork = macintoshArtwork(colorScheme);
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
