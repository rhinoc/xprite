import { describe, expect, it } from "vitest";

import { CANVAS_IMAGE_LIMITS, imageDimensionsWithinLimits } from "./image-dimensions";

describe("canvas image allocation bounds", () => {
  it.each([
    [16384, 1, true],
    [1, 16384, true],
    [16385, 1, false],
    [1, 16385, false],
    [8192, 8192, true],
    [8193, 8192, false],
    [20480, 2560, false],
    [0, 1, false],
    [1.5, 1, false],
    [NaN, 1, false],
  ])("checks %s × %s without allocating", (width, height, valid) => {
    expect(imageDimensionsWithinLimits(width, height, CANVAS_IMAGE_LIMITS)).toBe(valid);
  });
});
