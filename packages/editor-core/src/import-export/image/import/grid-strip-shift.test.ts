import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { StripImage, stripShear } from "$/import-export/image/import/grid-strip-shift";
import { sprite, upscaleNearest } from "$/import-export/image/import/grid-test-images";

const STRIDE = 4;
const PITCH = 6;
const CELLS = 24;

const cuts = Array.from({ length: CELLS + 1 }, (_, i) => i * PITCH);

/** The image with every row of cells moved along x by its shift, in whole pixels. */
function shiftRows(image: PixelBuffer, shifts: readonly number[]): PixelBuffer {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = Math.max(0, Math.min(width - 1, x - shifts[Math.floor(y / PITCH)]));
      data.set(
        image.data.subarray((y * width + from) * STRIDE, (y * width + from + 1) * STRIDE),
        (y * width + x) * STRIDE,
      );
    }
  return { width, height, data };
}

describe("strip shifts", () => {
  test("leave an exact lattice where it is", () => {
    const image = upscaleNearest(sprite(CELLS), PITCH);
    expect(stripShear(new StripImage(image), cuts, cuts)).toBeNull();
  });

  test("straighten an upscale whose rows of cells moved by whole pixels", () => {
    const upscale = upscaleNearest(sprite(CELLS), PITCH);
    const shifts = Array.from({ length: CELLS }, (_, k) => ((k * 7) % 5) - 2);
    const shear = stripShear(new StripImage(shiftRows(upscale, shifts)), cuts, cuts);
    expect(shear?.straight.data).toEqual(upscale.data);
  });
});
