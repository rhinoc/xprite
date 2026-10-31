// @cpu-intensive
import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { detectWithAlgorithm } from "$/import-export/image/import/grid/registry";
import {
  addNoise,
  detailedSprite,
  driftUpscale,
  fractionalUpscale,
} from "$/import-export/image/import/grid/test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { PixelationMode } from "$/import-export/image/import/types";
import { PixelationAlgorithm } from "$/import-export/image/import/types";

const { Auto, EdgeGrid, UniformGrid } = PixelationAlgorithm;

/** Recovery merges near-identical shades such as the fixtures' 0.65 and 0.7 tones of one colour. */
const MERGED_SHADE_DELTA = 12;

describe("uneven cells from non-integer and drifting upscales", () => {
  const uneven: [string, PixelBuffer, PixelBuffer][] = [
    [
      "2.43x, cells of 2 and 3 pixels",
      detailedSprite(120, 90, 3),
      fractionalUpscale(detailedSprite(120, 90, 3), 2.43),
    ],
    [
      "1.86x, cells of 1 and 2 pixels",
      detailedSprite(200, 150, 9),
      fractionalUpscale(detailedSprite(200, 150, 9), 1.86),
    ],
    [
      "cell size drifting 12% at 1.94x",
      detailedSprite(240, 180, 11),
      driftUpscale(detailedSprite(240, 180, 11), 1.94, 0.12, 11),
    ],
    [
      "detailed sprite drifting 25% at 6.7x",
      detailedSprite(120, 74, 3),
      driftUpscale(detailedSprite(120, 74, 3), 6.7, 0.25, 13),
    ],
  ];
  for (const [name, source, image] of uneven)
    test(name, () => {
      const result = detectWithAlgorithm(image, Auto);
      expect(result.reliable).toBe(true);
      expect([result.width, result.height]).toEqual([source.width, source.height]);
      const out = pixelateImage(image, {
        algorithm: Auto,
        mode: PixelationMode.RecoverGrid,
        grid: result,
      });
      const off = out.data.findIndex(
        (value, i) => Math.abs(value - source.data[i]) > MERGED_SHADE_DELTA,
      );
      expect(off).toBe(-1);
    });
  test("a noisy drifting 6.7x upscale keeps the measured mesh size", () => {
    const image = addNoise(driftUpscale(detailedSprite(120, 74, 3), 6.7, 0.25, 13), 24, 3);
    const result = detectWithAlgorithm(image, Auto);
    expect([result.width, result.height]).toEqual([120, 74]);
  });
  test("a drifting grid is no uniform lattice", () => {
    const image = driftUpscale(detailedSprite(120, 90, 1), 4.3, 0.12, 1);
    expect(detectWithAlgorithm(image, UniformGrid).reliable).toBe(false);
    expect(detectWithAlgorithm(image, Auto).algorithm).toBe(EdgeGrid);
  });
});
