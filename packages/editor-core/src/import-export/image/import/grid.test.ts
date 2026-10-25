import { describe, expect, test } from "vitest";

import { pixelGridCuts } from "$/import-export/image/import/grid";

describe("pixel grid cuts", () => {
  test("each cut takes the pixels whose centres fall past the lattice line", () => {
    expect(pixelGridCuts(20, 2.5, 0.6)).toEqual([0, 1, 3, 6, 8, 11, 13, 16, 18, 20]);
  });
  test("a phase too small for a first cell still shifts every later cut", () => {
    expect(pixelGridCuts(20, 2.5, 0.1)).toEqual([0, 3, 5, 8, 10, 13, 15, 18, 20]);
  });
});
