// @cpu-intensive
import { describe, expect, test } from "vitest";

import { detectWithAlgorithm } from "$/import-export/image/import/grid/registry";
import {
  addNoise,
  boxBlur,
  checkerboard,
  jitterWithMargin,
  sprite,
  upscaleNearest,
} from "$/import-export/image/import/grid/test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { PixelationAlgorithm } from "$/import-export/image/import/types";

const { Auto, EdgeGrid, UniformGrid } = PixelationAlgorithm;
const art = sprite(64);

describe("grids that must be recovered", () => {
  test("clean 16x checkerboard", () => {
    const result = detectWithAlgorithm(checkerboard(16, 32), Auto);
    expect(result.reliable).toBe(true);
    expect(result.cellWidth).toBeCloseTo(16, 1);
    expect(result.width).toBe(32);
  });
  test("clean 16x sprite restores exactly", () => {
    const out = pixelateImage(upscaleNearest(art, 16), { algorithm: Auto });
    expect(out.width).toBe(64);
    expect(out.height).toBe(64);
    expect(Array.from(out.data)).toEqual(Array.from(art.data));
  });
  test("screenshot-like: sprite upscaled by 6.755 with 2-3px blurred edges", () => {
    const image = boxBlur(upscaleNearest(art, 6.755), 1);
    const result = detectWithAlgorithm(image, Auto);
    expect(result.reliable).toBe(true);
    expect(result.cellWidth).toBeCloseTo(6.755, 1);
    expect(result.cellHeight).toBeCloseTo(6.755, 1);
    expect(Math.abs(result.width - 64)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.height - 64)).toBeLessThanOrEqual(1);
    const out = pixelateImage(image, { algorithm: Auto, grid: result });
    let close = 0;
    for (let i = 0; i < 64 * 64; i++) {
      const o = i * 4;
      if (
        Math.abs(out.data[o] - art.data[o]) <= 24 &&
        Math.abs(out.data[o + 1] - art.data[o + 1]) <= 24 &&
        Math.abs(out.data[o + 2] - art.data[o + 2]) <= 24
      )
        close++;
    }
    expect(close / (64 * 64)).toBeGreaterThan(0.9);
  });
  test("jitter plus margin is found by the edge grid, not the uniform one", () => {
    const image = jitterWithMargin(art);
    expect(detectWithAlgorithm(image, EdgeGrid).reliable).toBe(true);
    expect(detectWithAlgorithm(image, UniformGrid).reliable).toBe(false);
    const result = detectWithAlgorithm(image, Auto);
    expect(result.algorithm).toBe(EdgeGrid);
    expect(Math.abs(result.width - 64)).toBeLessThanOrEqual(3);
  });
  test("JPEG-like noise still recovers 64x64", () => {
    const result = detectWithAlgorithm(addNoise(upscaleNearest(art, 16), 12), Auto);
    expect(result.reliable).toBe(true);
    expect(result.width).toBe(64);
  });
  test("large genuine pixel art is not capped away", () => {
    const big = upscaleNearest(sprite(300, 9), 4);
    const result = detectWithAlgorithm(big, Auto);
    expect(result.reliable).toBe(true);
    expect(result.width).toBe(300);
  });
});
