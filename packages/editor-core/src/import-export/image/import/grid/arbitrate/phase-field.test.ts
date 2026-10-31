import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  CutModel,
  describeImage,
  descriptionLength,
} from "$/import-export/image/import/grid/arbitrate/description-length";
import { phaseField } from "$/import-export/image/import/grid/arbitrate/phase-field";
import { StripImage } from "$/import-export/image/import/grid/arbitrate/strip-shift";
import { materializeGridImage } from "$/import-export/image/import/grid/sampling";
import {
  blockResetUpscale,
  sprite,
  upscaleNearest,
} from "$/import-export/image/import/grid/test-images";

const STRIDE = 4;
const PITCH = 6;
const CELLS = 32;
/** Pixels a row drifts at most, beyond half a cell. */
const DRIFT = 5;
const DRIFT_PERIOD = 80;

const cuts = Array.from({ length: CELLS + 1 }, (_, i) => i * PITCH);
const lattice = { cutsX: cuts, cutsY: cuts, model: CutModel.Lattice };
const length = (image: PixelBuffer) => descriptionLength(describeImage(image), lattice);

/** The image with every row moved along x by its shift, in whole pixels. */
function driftRows(image: PixelBuffer, shift: (y: number) => number): PixelBuffer {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = Math.max(0, Math.min(width - 1, x - shift(y)));
      data.set(
        image.data.subarray((y * width + from) * STRIDE, (y * width + from + 1) * STRIDE),
        (y * width + x) * STRIDE,
      );
    }
  return { width, height, data };
}

/** The pixels of an image at least `margin` pixels from its left and right edges. */
function inner(image: PixelBuffer, margin: number): number[] {
  const pixels: number[] = [];
  for (let y = 0; y < image.height; y++)
    for (let x = margin; x < image.width - margin; x++)
      pixels.push(
        ...image.data.subarray((y * image.width + x) * STRIDE, (y * image.width + x + 1) * STRIDE),
      );
  return pixels;
}

describe("phase fields", () => {
  test("leave an exact lattice where it is", () => {
    const image = upscaleNearest(sprite(CELLS), PITCH);
    expect(phaseField(new StripImage(image), cuts, cuts)).toBeNull();
  });

  test("follow rows that drift smoothly further than half a cell", () => {
    const upscale = upscaleNearest(sprite(CELLS), PITCH);
    const drifted = driftRows(upscale, (y) =>
      Math.round(DRIFT * Math.sin((2 * Math.PI * y) / DRIFT_PERIOD)),
    );
    const field = phaseField(new StripImage(drifted), cuts, cuts);
    expect(field && inner(materializeGridImage(field.straight), DRIFT)).toEqual(
      inner(upscale, DRIFT),
    );
  });

  test("straighten an upscale whose blocks sample it at their own phases", () => {
    const upscale = upscaleNearest(sprite(CELLS), PITCH);
    const reset = blockResetUpscale(sprite(CELLS), PITCH, 2);
    const field = phaseField(new StripImage(reset), cuts, cuts);
    expect(field).not.toBeNull();
    const straight = length(materializeGridImage(field!.straight));
    expect(straight - length(upscale)).toBeLessThan((length(reset) - length(upscale)) / 4);
  });
});
