import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { Rgba } from "$/base/primitives";
import { paletteColorIndex } from "$/color/palette-commands";
import { exactPaletteColorIndex } from "$/color/palette-warning";

/** Near-miss RGB: not an exact palette entry, but fuzzy best-fit still finds a neighbor. */
const NEAR_MISS: Rgba = [240, 15, 3, 255];
const PALETTE: readonly Rgba[] = [
  [0, 0, 0, 255],
  [255, 0, 0, 255],
  [0, 255, 0, 255],
];

describe("palette warning exact-vs-fuzzy (CI guard)", () => {
  it("near-miss: exactPaletteColorIndex is -1 while fuzzy paletteColorIndex best-fits", () => {
    assert.equal(
      exactPaletteColorIndex(PALETTE, NEAR_MISS),
      -1,
      "exact match must miss near-miss colors so PaletteWarning can show",
    );
    const fuzzy = paletteColorIndex(PALETTE, NEAR_MISS);
    assert.ok(
      fuzzy >= 0,
      `fuzzy best-fit must still return an index for near-miss colors (got ${fuzzy})`,
    );
    assert.notEqual(
      exactPaletteColorIndex(PALETTE, NEAR_MISS),
      fuzzy,
      "exact and fuzzy must disagree on near-miss — otherwise the warning export was swapped",
    );
  });

  it("exact hit still returns the palette index", () => {
    assert.equal(exactPaletteColorIndex(PALETTE, PALETTE[1]), 1);
    assert.equal(paletteColorIndex(PALETTE, PALETTE[1]), 1);
  });
});
