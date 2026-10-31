// @cpu-intensive
import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  addNoise,
  boxBlur,
  detailedSprite,
  fractionalUpscale,
  jitterUpscale,
  mushWarp,
  softBilinear,
} from "$/import-export/image/import/grid-test-images";
import { detectWithAlgorithm } from "$/import-export/image/import/pixelation-algorithm-registry";
import { PixelationAlgorithm } from "$/import-export/image/import/types";

const { Auto, EdgeGrid } = PixelationAlgorithm;

describe("frame-locked lattices on soft and damaged upscales", () => {
  const recovered: [string, PixelBuffer, number, number][] = [
    ["soft bilinear at 1.94x", softBilinear(detailedSprite(200, 150, 5), 1.94), 200, 150],
    ["warped mush at 3x", mushWarp(detailedSprite(96, 80, 7), 3), 96, 80],
    [
      "noisy 1.94x, cells of 1 and 2 pixels",
      addNoise(fractionalUpscale(detailedSprite(200, 150, 9), 1.94), 40),
      200,
      150,
    ],
    [
      "heavily noisy 2.42x",
      addNoise(fractionalUpscale(detailedSprite(160, 120, 3), 2.42), 60),
      160,
      120,
    ],
    ["blurred 2.42x", boxBlur(fractionalUpscale(detailedSprite(160, 120, 3), 2.42), 1), 160, 120],
  ];
  for (const [name, image, width, height] of recovered)
    test(name, () => {
      const result = detectWithAlgorithm(image, Auto);
      expect(result.reliable).toBe(true);
      expect([result.width, result.height]).toEqual([width, height]);
    });
  test("an edge mesh bent by jittered cuts is replaced", () => {
    const image = jitterUpscale(detailedSprite(160, 120, 5), 2.62, 0.12, 5);
    const edge = detectWithAlgorithm(image, EdgeGrid);
    expect(edge.confidence).toBeGreaterThanOrEqual(0.8);
    expect([edge.width, edge.height]).not.toEqual([160, 120]);
    const result = detectWithAlgorithm(image, Auto);
    expect([result.width, result.height]).toEqual([160, 120]);
  });
  test("a fine frame alias does not displace the jittered grid the edges measure", () => {
    const image = jitterUpscale(detailedSprite(160, 120, 9), 2.42, 0.12, 9);
    const result = detectWithAlgorithm(image, Auto);
    expect([result.width, result.height]).toEqual([160, 120]);
  });
});
