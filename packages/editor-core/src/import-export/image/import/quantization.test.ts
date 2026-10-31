import { describe, expect, test } from "vitest";

import { paletteCoordinates } from "$/import-export/image/import/quantization";

describe("palette coordinates", () => {
  test("black and white keep their Oklab endpoints and opacity", () => {
    expect(paletteCoordinates([0, 0, 0, 255])).toEqual([0, 0, 0, 1]);
    const white = paletteCoordinates([255, 255, 255, 255]);
    expect(white[0]).toBeCloseTo(1, 7);
    expect(white[1]).toBeCloseTo(0, 7);
    expect(white[2]).toBeCloseTo(0, 7);
    expect(white[3]).toBe(1);
    const opaque = paletteCoordinates([64, 128, 192, 255]);
    const opacity = 128 / 255;
    expect(paletteCoordinates([64, 128, 192, 128])).toEqual([
      opaque[0] * opacity,
      opaque[1] * opacity,
      opaque[2] * opacity,
      opacity,
    ]);
  });

  test("fractional and out-of-byte-range channels retain the original conversion", () => {
    const fractional = paletteCoordinates([12.25, 64.5, 200.75, 127.5]);
    const outside = paletteCoordinates([255.5, -1.25, 64.75, 1.5]);
    // Reference vectors from the conversion before byte-table lookup was introduced.
    for (const [actual, expected] of [
      [fractional, [0.22302442903418973, -0.011912759784526078, -0.10737979520447141]],
      [outside, [0.0037232811677901777, 0.0014020941942411895, 0.0005290358485418729]],
    ])
      for (let channel = 0; channel < 3; channel++)
        expect(actual[channel]).toBeCloseTo(expected[channel], 14);
    expect(fractional[3]).toBe(0.5);
    expect(outside[3]).toBe(1.5 / 255);
  });

  test("signed-zero channels and opacity keep their original signs", () => {
    expect(paletteCoordinates([-0, -0, -0, -0]).every((value) => Object.is(value, -0))).toBe(true);
  });
});
