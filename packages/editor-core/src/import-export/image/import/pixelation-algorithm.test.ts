import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { gradient, upscaleNearest } from "$/import-export/image/import/grid-test-images";
import { sprite } from "$/import-export/image/import/grid-test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import {
  detectWithAlgorithm,
  getAllAlgorithms,
  getListedAlgorithms,
} from "$/import-export/image/import/pixelation-algorithm-registry";
import { CellColorPicker, PixelationAlgorithm } from "$/import-export/image/import/types";

const { Auto, EdgeGrid, UniformGrid, Resize, CustomSize } = PixelationAlgorithm;
const art = sprite(64);

describe("algorithm registry table", () => {
  test("lists every algorithm and rejects unknown ids", () => {
    expect([...getAllAlgorithms()].sort()).toEqual(
      [Auto, CustomSize, EdgeGrid, Resize, UniformGrid].sort(),
    );
    expect(() => detectWithAlgorithm(art, "nope" as PixelationAlgorithm)).toThrow(RangeError);
  });
  test("the dialog offers every entry except the plain Resize fallback", () => {
    expect([...getListedAlgorithms()].sort()).toEqual(
      [Auto, CustomSize, EdgeGrid, UniformGrid].sort(),
    );
  });
  test("Custom size detects the requested block grid and Auto never picks it", () => {
    const image = upscaleNearest(art, 4);
    const grid = detectWithAlgorithm(image, CustomSize, {
      width: 20,
      height: 12,
    });
    expect([grid.width, grid.height, grid.reliable, grid.algorithm]).toEqual([
      20,
      12,
      true,
      CustomSize,
    ]);
    expect(detectWithAlgorithm(image, Auto).algorithm).not.toBe(CustomSize);
  });
  test("block picking sizes the output from the target and applies the chosen colour rule", () => {
    const image = upscaleNearest(art, 4);
    const size = { targetWidth: 20, targetHeight: 12, blockPicker: true };
    const common = pixelateImage(image, {
      ...size,
      colorPicker: CellColorPicker.MostCommon,
    });
    const average = pixelateImage(image, {
      ...size,
      colorPicker: CellColorPicker.Average,
    });
    expect([common.width, common.height]).toEqual([20, 12]);
    expect([average.width, average.height]).toEqual([20, 12]);
    expect(average.data).not.toEqual(common.data);
  });
  test("Resize never claims a grid", () => {
    const result = detectWithAlgorithm(upscaleNearest(art, 16), Resize);
    expect(result.reliable).toBe(false);
    expect(result.confidence).toBe(0);
  });
  test("Auto falls back to the Resize entry when nothing is reliable", () => {
    const result = detectWithAlgorithm(gradient(512, 512), Auto);
    expect(result.reliable).toBe(false);
    expect(result.algorithm).toBe(Resize);
  });
});

// Real images are not in the repository; point XPRITE_REAL_IMAGES at a directory holding
// <name>.rgba (raw RGBA) and <name>.size.json ([width, height]) to run these locally.
const realDirectory = process.env.XPRITE_REAL_IMAGES;
describe.skipIf(!realDirectory || !existsSync(`${realDirectory}/knight.rgba`))(
  "real images",
  () => {
    const load = (name: string): PixelBuffer => {
      const [width, height] = JSON.parse(
        readFileSync(`${realDirectory}/${name}.size.json`, "utf8"),
      );
      return {
        width,
        height,
        data: new Uint8ClampedArray(readFileSync(`${realDirectory}/${name}.rgba`)),
      };
    };
    test("AI-generated knight restores near 90x135", () => {
      const out = pixelateImage(load("knight"), { algorithm: Auto });
      expect(Math.abs(out.width - 90)).toBeLessThanOrEqual(2);
      expect(Math.abs(out.height - 135)).toBeLessThanOrEqual(4);
    });
    test("screenshot duo restores near 185x179", () => {
      const image = load("duo");
      const result = detectWithAlgorithm(image, Auto);
      expect(result.reliable).toBe(true);
      expect(result.cellWidth).toBeCloseTo(6.755, 1);
      const out = pixelateImage(image, { algorithm: Auto });
      expect(Math.abs(out.width - 185)).toBeLessThanOrEqual(3);
      expect(Math.abs(out.height - 179)).toBeLessThanOrEqual(3);
    });
  },
);
