// @cpu-intensive
import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { detectWithAlgorithm } from "$/import-export/image/import/grid/registry";
import {
  boxBlur,
  mush,
  resampleBilinear,
  sprite,
  upscaleBilinear,
  upscaleNearest,
} from "$/import-export/image/import/grid/test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { CellColorPicker, PixelationMode } from "$/import-export/image/import/types";
import { PixelationAlgorithm } from "$/import-export/image/import/types";

const { Auto, EdgeGrid, UniformGrid } = PixelationAlgorithm;
const art = sprite(64);

describe("soft upscales the edge detectors refuse", () => {
  const soft: [string, PixelBuffer, number, number][] = [
    ["bilinear-upscaled sprite", upscaleBilinear(art, 12), 12, 64],
    ["centred bilinear at 6.5x", resampleBilinear(sprite(32, 7), 6.5), 6.5, 32],
    ["mush at 12x", mush(sprite(32, 7), 12), 12, 32],
  ];
  for (const [name, image, pitch, cells] of soft)
    test(name, () => {
      for (const algorithm of [EdgeGrid, UniformGrid])
        expect(detectWithAlgorithm(image, algorithm).reliable).toBe(false);
      const result = detectWithAlgorithm(image, Auto);
      expect(result.reliable).toBe(true);
      expect(result.cellWidth).toBeCloseTo(pitch, 0);
      expect(result.cellHeight).toBeCloseTo(pitch, 0);
      expect(Math.abs(result.width - cells)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.height - cells)).toBeLessThanOrEqual(1);
      const out = pixelateImage(image, {
        algorithm: Auto,
        mode: PixelationMode.RecoverGrid,
        grid: result,
      });
      expect([out.width, out.height]).toEqual([result.width, result.height]);
    });
  test("the recovered colours match the source sprite", () => {
    const source = sprite(40, 41);
    const out = pixelateImage(resampleBilinear(source, 7.25), {
      algorithm: Auto,
      colorPicker: CellColorPicker.Median,
    });
    expect([out.width, out.height]).toEqual([40, 40]);
    let close = 0;
    for (let i = 0; i < 40 * 40; i++) {
      let error = 0;
      for (let c = 0; c < 3; c++)
        error = Math.max(error, Math.abs(out.data[i * 4 + c] - source.data[i * 4 + c]));
      if (error <= 24) close++;
    }
    expect(close / (40 * 40)).toBeGreaterThan(0.85);
  });
  test("a soft grid is not split into half cells", () => {
    const result = detectWithAlgorithm(resampleBilinear(sprite(32, 13), 8), Auto);
    expect([result.width, result.height]).toEqual([32, 32]);
  });
  test("a low-confidence edge grid that missed cuts is replaced", () => {
    const image = boxBlur(upscaleNearest(sprite(36, 83), 7.75), 1);
    const edge = detectWithAlgorithm(image, EdgeGrid);
    expect(edge.reliable).toBe(true);
    expect([edge.width, edge.height]).not.toEqual([36, 36]);
    const result = detectWithAlgorithm(image, Auto);
    expect([result.width, result.height]).toEqual([36, 36]);
  });
});
