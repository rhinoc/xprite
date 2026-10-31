// @cpu-intensive
import { describe, expect, test } from "vitest";

import { boxBlur, sprite, upscaleNearest } from "$/import-export/image/import/grid-test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { detectWithAlgorithm } from "$/import-export/image/import/pixelation-algorithm-registry";
import { PixelationAlgorithm, PixelationMode } from "$/import-export/image/import/types";
describe("soft upscales the edge detectors refuse", () => {
  test("heavily blurred sprite", () => {
    const image = boxBlur(upscaleNearest(sprite(64), 16), 6);
    for (const algorithm of [PixelationAlgorithm.EdgeGrid, PixelationAlgorithm.UniformGrid])
      expect(detectWithAlgorithm(image, algorithm).reliable).toBe(false);
    const grid = detectWithAlgorithm(image, PixelationAlgorithm.Auto);
    expect(grid.reliable).toBe(true);
    expect(grid.cellWidth).toBeCloseTo(16, 0);
    expect(grid.cellHeight).toBeCloseTo(16, 0);
    expect(Math.abs(grid.width - 64)).toBeLessThanOrEqual(1);
    expect(Math.abs(grid.height - 64)).toBeLessThanOrEqual(1);
    const out = pixelateImage(image, {
      algorithm: PixelationAlgorithm.Auto,
      mode: PixelationMode.RecoverGrid,
      grid,
    });
    expect([out.width, out.height]).toEqual([grid.width, grid.height]);
  });
});
