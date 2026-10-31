// @cpu-intensive
import { describe, expect, test } from "vitest";

import {
  detectWithAlgorithm,
  detectWithAlgorithmAsync,
} from "$/import-export/image/import/grid/registry";
import { mush, sprite } from "$/import-export/image/import/grid/test-images";
import { PixelationAlgorithm } from "$/import-export/image/import/types";
const { Auto } = PixelationAlgorithm;
describe("soft upscales the edge detectors refuse", () => {
  test("a tilt claimed on soft edges does not hide the upright grid", async () => {
    const image = mush(sprite(56, 53), 14, 54);
    const result = detectWithAlgorithm(image, Auto);
    expect([result.width, result.height]).toEqual([56, 56]);
    expect(result.rotation).toBeUndefined();
    expect(await detectWithAlgorithmAsync(image, Auto)).toEqual(result);
  });
});
