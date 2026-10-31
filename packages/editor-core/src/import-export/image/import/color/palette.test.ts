import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  extractPalette,
  extractPixelationPalette,
} from "$/import-export/image/import/color/palette";

const CHANNELS = 4;
const OPAQUE = 255;
const EXACT_COLOR_LIMIT = 16_384;
const HISTOGRAM_WIDTH = 129;
const HISTOGRAM_HEIGHT = 128;

/** Previous pixelation palette generation normalized alpha in a separate image. */
function copiedPalette(image: PixelBuffer) {
  const data = new Uint8ClampedArray(image.data);
  for (let offset = 3; offset < data.length; offset += CHANNELS)
    if (data[offset]) data[offset] = OPAQUE;
  return extractPalette({ ...image, data }, { maxColors: 16, ignoreTransparent: true });
}

describe("pixelation palette alpha reads", () => {
  test("counts RGB independently of opacity and keeps ordinary palette RGBA counts", () => {
    const image = {
      width: 4,
      height: 1,
      data: new Uint8ClampedArray([
        30,
        60,
        90,
        1,
        30,
        60,
        90,
        128,
        30,
        60,
        90,
        OPAQUE,
        200,
        100,
        0,
        0,
      ]),
    };
    const original = new Uint8ClampedArray(image.data);
    expect(extractPixelationPalette(image, { maxColors: 16 })).toEqual([
      { color: [30, 60, 90, OPAQUE], count: 3, coverage: 1 },
    ]);
    expect(
      extractPalette(image, { ignoreTransparent: true }).map((entry) => entry.color[3]),
    ).toEqual([1, 128, OPAQUE]);
    expect(image.data).toEqual(original);
  });

  test.each([EXACT_COLOR_LIMIT, EXACT_COLOR_LIMIT + 1])(
    "%i visible RGB colours preserve palette counts and alpha across the histogram boundary",
    (visibleColors) => {
      const image = {
        width: HISTOGRAM_WIDTH,
        height: HISTOGRAM_HEIGHT,
        data: new Uint8ClampedArray(HISTOGRAM_WIDTH * HISTOGRAM_HEIGHT * CHANNELS),
      };
      for (let index = 0; index < image.width * image.height; index++)
        image.data.set(
          [
            index >>> 8,
            index & OPAQUE,
            (index * 17) & OPAQUE,
            index < visibleColors ? 1 + (index % OPAQUE) : 0,
          ],
          index * CHANNELS,
        );
      const original = new Uint8ClampedArray(image.data);
      const palette = extractPixelationPalette(image, { maxColors: 16 });
      expect(palette).toEqual(copiedPalette(image));
      expect(palette.reduce((sum, entry) => sum + entry.count, 0)).toBe(visibleColors);
      expect(palette.every((entry) => entry.color[3] === OPAQUE)).toBe(true);
      expect(image.data).toEqual(original);
    },
  );

  test("retains the all-transparent fallback and ignores hidden RGB", () => {
    const image = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 0]),
    };
    expect(extractPixelationPalette(image)).toEqual([
      { color: [0, 0, 0, 0], count: 2, coverage: 1 },
    ]);
  });
});
