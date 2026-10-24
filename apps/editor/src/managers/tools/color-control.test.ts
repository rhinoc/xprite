import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { findEditorPaletteColor } from "$/managers/tools/color-control";
import { exactPaletteColorIndex, paletteColorIndex, type Rgba } from "@xprite/editor-core";

/** Near-miss RGB: not an exact palette entry; fuzzy best-fit still finds a neighbor. */
const NEAR_MISS: Rgba = [240, 15, 3, 255];
const PALETTE: readonly Rgba[] = [
  [0, 0, 0, 255],
  [255, 0, 0, 255],
  [0, 255, 0, 255],
];

describe("findEditorPaletteColor (PaletteWarning !)", () => {
  it("returns -1 for a near-miss color that fuzzy lookup would still match", () => {
    assert.equal(exactPaletteColorIndex(PALETTE, NEAR_MISS), -1);
    assert.ok(paletteColorIndex(PALETTE, NEAR_MISS) >= 0);
    assert.equal(
      findEditorPaletteColor(PALETTE, NEAR_MISS),
      -1,
      "ColorFields shows PaletteWarning when findEditorPaletteColor < 0; must use exact match, not fuzzy paletteColorIndex",
    );
  });

  it("returns the index for an exact palette color", () => {
    assert.equal(findEditorPaletteColor(PALETTE, PALETTE[2]), 2);
  });
});
