import { describe, expect, it } from "vitest";

import { FontRole, UiFontRenderer } from "$/base/theme/theme-types";
import { asepriteTypography } from "$/base/theme/themes/aseprite/typography";

const FUSION_PIXEL_8_GRID = 8;

describe("aseprite typography", () => {
  it("draws compact Chinese from the 8px face scaled 1.25x to a 10px-equivalent em", () => {
    const mini = asepriteTypography[FontRole.Compact];
    expect(mini.cjkFontFamily).toBe("FusionPixel8");
    expect(mini.cjkFontSize / FUSION_PIXEL_8_GRID).toBe(1.25);
    // One full-width glyph is 8 design pixels, so its advance stays on the 10px grid.
    expect(mini.cjkAdvance).toBe(mini.cjkFontSize);
    expect(mini.cjkAdvance).toBe(10);
  });

  it("keeps the compact CJK line box and baseline inside the Latin mini line", () => {
    const mini = asepriteTypography[FontRole.Compact];
    if (mini.renderer !== UiFontRenderer.Bitmap) throw new Error("expected bitmap font");
    expect(mini.lineHeight).toBe(10);
    // Fusion Pixel 8 puts its baseline 8.75 of 10 down at this size, and ink descends 1.25 below it.
    expect(mini.cjkBaseline).toBe(Math.round(8.75));
    expect(mini.cjkBaseline).toBeLessThanOrEqual(mini.lineHeight);
  });

  it("binarises scaled compact glyphs below half coverage so thin strokes survive", () => {
    const mini = asepriteTypography[FontRole.Compact];
    expect(mini.cjkCoverageThreshold).toBeGreaterThan(0);
    expect(mini.cjkCoverageThreshold).toBeLessThan(128);
  });

  it("leaves primary Chinese on the shifted 10px face at 1.4x", () => {
    const primary = asepriteTypography[FontRole.Primary];
    expect(primary.cjkFontFamily).toBe("FusionPixel10Aseprite");
    expect(primary.cjkFontSize / 10).toBe(1.4);
    expect(primary.cjkCoverageThreshold).toBeUndefined();
  });
});
