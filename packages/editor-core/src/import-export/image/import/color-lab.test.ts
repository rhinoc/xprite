import { expect, test } from "vitest";

import { labToRgb, rgbToLab } from "$/import-export/image/import/color-lab";

test("white, black and red land on the known L*a*b* values", () => {
  expect(rgbToLab(255, 255, 255).map((v) => Math.round(v) + 0)).toEqual([100, 0, 0]);
  expect(rgbToLab(0, 0, 0).map((v) => Math.round(v) + 0)).toEqual([0, 0, 0]);
  expect(rgbToLab(255, 0, 0).map((v) => Math.round(v) + 0)).toEqual([53, 80, 67]);
});
test("round trip returns the same 8-bit colour", () => {
  for (const [r, g, b] of [
    [12, 200, 99],
    [255, 128, 0],
    [3, 3, 250],
    [128, 128, 128],
  ])
    expect(labToRgb(...rgbToLab(r, g, b))).toEqual([r, g, b]);
});
