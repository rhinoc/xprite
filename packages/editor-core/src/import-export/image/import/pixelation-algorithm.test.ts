import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  addNoise,
  boxBlur,
  checkerboard,
  gradient,
  jitterWithMargin,
  smoothPhoto,
  sprite,
  texturePhoto,
  upscaleBilinear,
  upscaleNearest,
  vectorShapes,
} from "$/import-export/image/import/grid-test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import {
  detectWithAlgorithm,
  getAllAlgorithms,
  getListedAlgorithms,
} from "$/import-export/image/import/pixelation-algorithm-registry";
import {
  CellColorPicker,
  PixelationAlgorithm,
  PixelationMode,
} from "$/import-export/image/import/types";

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
    const grid = detectWithAlgorithm(image, CustomSize, { width: 20, height: 12 });
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
    const common = pixelateImage(image, { ...size, colorPicker: CellColorPicker.MostCommon });
    const average = pixelateImage(image, { ...size, colorPicker: CellColorPicker.Average });
    expect([common.width, common.height]).toEqual([20, 12]);
    expect([average.width, average.height]).toEqual([20, 12]);
    expect(average.data).not.toEqual(common.data);
  });
  test("Resize never claims a grid", () => {
    const result = detectWithAlgorithm(upscaleNearest(art, 16), Resize);
    expect(result.reliable).toBe(false);
    expect(result.confidence).toBe(0);
  });
  test("Auto picks the highest-confidence reliable entry and tags it", () => {
    const image = upscaleNearest(art, 16);
    const auto = detectWithAlgorithm(image, Auto);
    const reliable = [EdgeGrid, UniformGrid]
      .map((id) => detectWithAlgorithm(image, id))
      .filter((result) => result.reliable);
    expect(auto.reliable).toBe(true);
    expect(auto.confidence).toBe(Math.max(...reliable.map((result) => result.confidence)));
    expect([EdgeGrid, UniformGrid]).toContain(auto.algorithm);
  });
  test("Auto falls back to the Resize entry when nothing is reliable", () => {
    const result = detectWithAlgorithm(gradient(512, 512), Auto);
    expect(result.reliable).toBe(false);
    expect(result.algorithm).toBe(Resize);
  });
});

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
    const out = pixelateImage(image, { algorithm: Auto });
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

describe("images that must be refused", () => {
  const refused: [string, PixelBuffer][] = [
    ["512x512 gradient", gradient(512, 512)],
    ["smooth photo-like field", smoothPhoto(512, 512)],
    ["blurred textured photo", boxBlur(texturePhoto(256, 256), 4)],
    ["textured photo", texturePhoto(512, 512)],
    ["heavily blurred sprite", boxBlur(upscaleNearest(art, 16), 6)],
    ["bilinear-upscaled sprite", upscaleBilinear(art, 12)],
    ["hard-edged shapes with no grid", vectorShapes(512, 512)],
  ];
  for (const [name, image] of refused)
    test(name, () => {
      for (const algorithm of [Auto, EdgeGrid, UniformGrid])
        expect(detectWithAlgorithm(image, algorithm).reliable).toBe(false);
    });
  test("pixelateImage with Auto falls back to plain conversion instead of inventing a grid", () => {
    const image = gradient(256, 256);
    const out = pixelateImage(image, { algorithm: Auto });
    expect([out.width, out.height]).toEqual([256, 256]);
    expect(() =>
      pixelateImage(image, { algorithm: Auto, mode: PixelationMode.RecoverGrid }),
    ).toThrow(/No consistent pixel grid/);
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
