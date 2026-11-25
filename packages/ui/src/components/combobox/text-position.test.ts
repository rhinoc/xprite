import { describe, expect, it } from "vitest";

import { asepriteTypography } from "$/base/theme/themes/aseprite/typography";
import { macintoshGeometry } from "$/base/theme/themes/macintosh/geometry";
import { macintoshTypography } from "$/base/theme/themes/macintosh/typography";
import { FIELD_ROW_HEIGHT, RASTER_SCALE } from "$/components/canvas-surface";
import { comboboxNaturalHeight, comboboxTextOffsetY } from "$/components/combobox/text-position";

const ASEPRITE_THEME_METRICS = {
  dimensions: {},
  parts: {
    sunken2_normal: {
      x: 0,
      y: 64,
      width: 16,
      height: 16,
      slices: [5, 6, 5, 5, 6, 5],
    },
  },
  controlParts: {},
};

const MACINTOSH_THEME_METRICS = {
  dimensions: macintoshGeometry.dimensions,
  parts: macintoshGeometry.parts,
  controlParts: {
    combobox: {
      popupMenu: true,
      faceNormal: "drop_down_button_left_normal" as const,
    },
  },
};

describe("combobox natural height and trigger text positioning", () => {
  it("defaults Aseprite comboboxes to the standard field row height so CJK glyphs fit inside sunken2", () => {
    expect(comboboxNaturalHeight(undefined, ASEPRITE_THEME_METRICS)).toBe(FIELD_ROW_HEIGHT);
    expect(FIELD_ROW_HEIGHT).toBe(32);
  });

  it("preserves explicit pixelSize and Macintosh theme combobox_height", () => {
    expect(comboboxNaturalHeight(undefined, MACINTOSH_THEME_METRICS)).toBe(18);
    expect(comboboxNaturalHeight({ width: 80, height: 15 }, ASEPRITE_THEME_METRICS)).toBe(30);
  });

  it("keeps compact 30px Aseprite combobox labels clear of the top inner shadow and bottom border", () => {
    const fontHeight = asepriteTypography.primary.lineHeight;
    const clearFaceTop = 5 * RASTER_SCALE;
    const bottomBorderTop = 30 - 6;
    const y = comboboxTextOffsetY({ y: 0, height: 30 }, fontHeight, ASEPRITE_THEME_METRICS);

    expect(y).toBe(10);
    expect(y).toBeGreaterThanOrEqual(clearFaceTop);
    expect(y + fontHeight).toBeLessThanOrEqual(bottomBorderTop);
  });

  it("preserves 32px Aseprite and 18px Macintosh vertical text positions", () => {
    expect(
      comboboxTextOffsetY(
        { y: 0, height: 32 },
        asepriteTypography.primary.lineHeight,
        ASEPRITE_THEME_METRICS,
      ),
    ).toBe(10);
    expect(
      comboboxTextOffsetY(
        { y: 0, height: 18 },
        macintoshTypography.primary.lineHeight,
        MACINTOSH_THEME_METRICS,
      ),
    ).toBe(3);
  });

  it("stays invariant to odd parent bounds.y offsets", () => {
    const fontHeight = asepriteTypography.primary.lineHeight;
    expect(comboboxTextOffsetY({ y: 13, height: 30 }, fontHeight, ASEPRITE_THEME_METRICS)).toBe(
      comboboxTextOffsetY({ y: 0, height: 30 }, fontHeight, ASEPRITE_THEME_METRICS),
    );
  });
});
