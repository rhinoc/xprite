import { describe, expect, it } from "vitest";

import { contrastRatio, hexToOklch, maxChroma } from "$/base/theme/oklch";
import { UiColorScheme } from "$/base/theme/theme-types";
import {
  classicFamily,
  COLOR_FAMILIES,
  ColorFamilyId,
  ColorIntensity,
  colorFamilyColors,
  CONTRAST_PAIRS,
  CONTRAST_TOLERANCE,
  contrastTarget,
} from "$/base/theme/themes/color-family/families";
import asepriteDark from "$assets/themes/aseprite/aseprite-dark-theme.json";
import aseprite from "$assets/themes/aseprite/aseprite-light-theme.json";

const CLASSIC: Readonly<Record<UiColorScheme, Readonly<Record<string, string>>>> = {
  [UiColorScheme.Light]: aseprite.colors,
  [UiColorScheme.Dark]: asepriteDark.colors,
};
const SCHEMES = [UiColorScheme.Light, UiColorScheme.Dark];
/** Lightness may move only as far as contrast fitting needs. */
const MAXIMUM_LIGHTNESS_SHIFT = 0.08;
/** The light workspace hue must stay in the range of the family name. */
const NAMED_HUE: Readonly<Record<ColorFamilyId, readonly [number, number]>> = {
  [ColorFamilyId.Ocean]: [225, 255],
  [ColorFamilyId.Moss]: [135, 165],
  [ColorFamilyId.Ember]: [15, 45],
  [ColorFamilyId.Grape]: [285, 315],
  [ColorFamilyId.Mustard]: [85, 115],
  [ColorFamilyId.Cocoa]: [40, 70],
};
/** Vivid themes must carry clearly more color in the workspace than soft ones. */
const MINIMUM_VIVID_GAIN = 1.5;

const share = (hex: string) => {
  const color = hexToOklch(hex);
  return color.c / Math.max(maxChroma(color.l, color.h), 1e-6);
};

describe("color family palette", () => {
  it("reproduces Aseprite Classic with the classic hues", () => {
    for (const scheme of SCHEMES) {
      const colors = colorFamilyColors(CLASSIC[scheme], classicFamily(), scheme);
      const changed = Object.entries(CLASSIC[scheme]).filter(([key, value]) => {
        const a = hexToOklch(value);
        const b = hexToOklch(colors[key]);
        return Math.abs(a.l - b.l) > 0.01 || Math.abs(a.c - b.c) > 0.01;
      });
      expect(changed.map(([key]) => `${scheme} ${key}`)).toEqual([]);
    }
  });

  it("keeps the Classic lightness of every color", () => {
    const moved = COLOR_FAMILIES.flatMap((family) =>
      SCHEMES.flatMap((scheme) => {
        const colors = colorFamilyColors(CLASSIC[scheme], family, scheme);
        return Object.entries(CLASSIC[scheme])
          .filter(
            ([key, value]) =>
              Math.abs(hexToOklch(value).l - hexToOklch(colors[key]).l) > MAXIMUM_LIGHTNESS_SHIFT,
          )
          .map(([key]) => `${family.id} ${scheme} ${key}`);
      }),
    );
    expect(moved).toEqual([]);
  });

  it("turns the workspace to the hue the family is named after", () => {
    const off = COLOR_FAMILIES.filter((family) => {
      const colors = colorFamilyColors(CLASSIC[UiColorScheme.Light], family, UiColorScheme.Light);
      const [low, high] = NAMED_HUE[family.family];
      const hue = hexToOklch(colors.workspace).h;
      return hue < low || hue > high;
    }).map((family) => family.id);
    expect(off).toEqual([]);
  });

  it("gives vivid themes more color than soft ones", () => {
    const flat = Object.values(ColorFamilyId).flatMap((id) =>
      SCHEMES.flatMap((scheme) => {
        const [soft, vivid] = [ColorIntensity.Soft, ColorIntensity.Vivid].map((intensity) => {
          const family = COLOR_FAMILIES.find(
            (entry) => entry.family === id && entry.intensity === intensity,
          )!;
          return share(colorFamilyColors(CLASSIC[scheme], family, scheme).face);
        });
        return vivid < soft * MINIMUM_VIVID_GAIN ? [`${id} ${scheme} ${soft} ${vivid}`] : [];
      }),
    );
    expect(flat).toEqual([]);
  });

  it("keeps keys that share a Classic color as one color", () => {
    const split = COLOR_FAMILIES.flatMap((family) =>
      SCHEMES.flatMap((scheme) => {
        const source = CLASSIC[scheme];
        const colors = colorFamilyColors(source, family, scheme);
        const groups = new Map<string, Set<string>>();
        for (const [key, value] of Object.entries(source)) {
          const values = groups.get(value.toLowerCase()) ?? new Set();
          values.add(colors[key]);
          groups.set(value.toLowerCase(), values);
        }
        return [...groups]
          .filter(([, values]) => values.size > 1)
          .map(([value]) => `${family.id} ${scheme} ${value}`);
      }),
    );
    expect(split).toEqual([]);
  });

  it("keeps Classic text contrast", () => {
    const low = COLOR_FAMILIES.flatMap((family) =>
      SCHEMES.flatMap((scheme) => {
        const source = CLASSIC[scheme];
        const colors = colorFamilyColors(source, family, scheme);
        return CONTRAST_PAIRS.filter(([text, face]) => source[text] && source[face])
          .map(([text, face]) => ({
            pair: `${family.id} ${scheme} ${text}/${face}`,
            ratio: contrastRatio(hexToOklch(colors[text]), hexToOklch(colors[face])),
            target: contrastTarget(source[text], source[face]),
          }))
          .filter(({ ratio, target }) => ratio < target - CONTRAST_TOLERANCE)
          .map(({ pair, ratio, target }) => `${pair} ${ratio} < ${target}`);
      }),
    );
    expect(low).toEqual([]);
  });
});
