import { describe, expect, it } from "vitest";

import { contrastRatio, hexToOklch } from "$/base/theme/oklch";
import { UiColorScheme } from "$/base/theme/theme-types";
import { colorFamilyPalette } from "$/base/theme/themes/color-family/palette";

const SCHEMES = [UiColorScheme.Light, UiColorScheme.Dark];
const TEXT_PAIRS = [
  ["ink", "face"],
  ["ink", "field"],
  ["frameInk", "frame"],
  ["accentInk", "accent"],
] as const;
/**
 * White tab text on the blue-grey workspace (3.2:1) and white selection text on red (3.1:1)
 * are Classic values the families keep; use these roles for large or bold text only.
 */
const LARGE_TEXT_ROLES = new Set(["frameInk", "accentInk"]);
const MINIMUM_LARGE_TEXT_CONTRAST = 3;
const MINIMUM_TEXT_CONTRAST = 4.5;

describe("color family palette for static pages", () => {
  it("returns every role as a hex color", () => {
    for (const scheme of SCHEMES)
      for (const value of Object.values(colorFamilyPalette("color-family-moss", scheme)))
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps text readable on its face", () => {
    const low = SCHEMES.flatMap((scheme) => {
      const palette = colorFamilyPalette("color-family-moss", scheme);
      return TEXT_PAIRS.filter(([text, face]) => {
        const ratio = contrastRatio(hexToOklch(palette[text]), hexToOklch(palette[face]));
        return (
          ratio < (LARGE_TEXT_ROLES.has(text) ? MINIMUM_LARGE_TEXT_CONTRAST : MINIMUM_TEXT_CONTRAST)
        );
      }).map(([text, face]) => `${scheme} ${text}/${face}`);
    });
    expect(low).toEqual([]);
  });

  it("rejects ids that are not color family themes", () => {
    expect(() => colorFamilyPalette("aseprite", UiColorScheme.Light)).toThrow();
  });
});
