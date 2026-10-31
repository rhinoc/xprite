import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  addNoise,
  boxBlur,
  checkerboard,
  detailedSprite,
  driftUpscale,
  fractionalUpscale,
  gradient,
  jitterUpscale,
  jitterWithMargin,
  mush,
  mushWarp,
  resampleBilinear,
  smoothPhoto,
  softBilinear,
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

/** Recovery merges near-identical shades such as the fixtures' 0.65 and 0.7 tones of one colour. */
const MERGED_SHADE_DELTA = 12;

describe("uneven cells from non-integer and drifting upscales", () => {
  const uneven: [string, PixelBuffer, PixelBuffer][] = [
    [
      "2.43x, cells of 2 and 3 pixels",
      detailedSprite(120, 90, 3),
      fractionalUpscale(detailedSprite(120, 90, 3), 2.43),
    ],
    ["2.56x blocky sprite", sprite(80, 6), fractionalUpscale(sprite(80, 6), 2.56)],
    [
      "4.37x detailed sprite",
      detailedSprite(96, 80, 5),
      fractionalUpscale(detailedSprite(96, 80, 5), 4.37),
    ],
    [
      "cell size drifting 12% at 4.3x",
      detailedSprite(120, 90, 1),
      driftUpscale(detailedSprite(120, 90, 1), 4.3, 0.12, 1),
    ],
    [
      "cell size drifting 12% at 3.3x",
      detailedSprite(160, 120, 7),
      driftUpscale(detailedSprite(160, 120, 7), 3.3, 0.12, 7),
    ],
    ["blocky sprite drifting at 6.4x", sprite(64, 4), driftUpscale(sprite(64, 4), 6.4, 0.12, 4)],
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
      const out = pixelateImage(image, { algorithm: Auto, mode: PixelationMode.RecoverGrid });
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

describe("soft upscales the edge detectors refuse", () => {
  const soft: [string, PixelBuffer, number, number][] = [
    ["bilinear-upscaled sprite", upscaleBilinear(art, 12), 12, 64],
    ["heavily blurred sprite", boxBlur(upscaleNearest(art, 16), 6), 16, 64],
    ["centred bilinear at 6.5x", resampleBilinear(sprite(32, 7), 6.5), 6.5, 32],
    ["centred bilinear at 9.3x", resampleBilinear(sprite(48, 13), 9.3), 9.3, 48],
    ["mush at 5x", mush(sprite(48, 29), 5), 5, 48],
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
  test("a tilt claimed on soft edges does not hide the upright grid", () => {
    const result = detectWithAlgorithm(mush(sprite(56, 53), 14, 54), Auto);
    expect([result.width, result.height]).toEqual([56, 56]);
    expect(result.rotation).toBeUndefined();
  });
  test("a low-confidence edge grid that missed cuts is replaced", () => {
    const image = boxBlur(upscaleNearest(sprite(36, 83), 7.75), 1);
    const edge = detectWithAlgorithm(image, EdgeGrid);
    expect(edge.reliable).toBe(true);
    expect([edge.width, edge.height]).not.toEqual([36, 36]);
    expect([
      detectWithAlgorithm(image, Auto).width,
      detectWithAlgorithm(image, Auto).height,
    ]).toEqual([36, 36]);
  });
});

describe("frame-locked lattices on soft and damaged upscales", () => {
  const recovered: [string, PixelBuffer, number, number][] = [
    ["soft bilinear at 2.62x", softBilinear(detailedSprite(120, 90, 3), 2.62), 120, 90],
    ["soft bilinear at 1.94x", softBilinear(detailedSprite(200, 150, 5), 1.94), 200, 150],
    ["soft bilinear at 4.84x", softBilinear(sprite(64, 9), 4.84), 64, 64],
    ["warped mush at 3x", mushWarp(detailedSprite(96, 80, 7), 3), 96, 80],
    ["warped mush at 5x", mushWarp(sprite(64, 11), 5), 64, 64],
    [
      "noisy 1.94x, cells of 1 and 2 pixels",
      addNoise(fractionalUpscale(detailedSprite(200, 150, 9), 1.94), 40),
      200,
      150,
    ],
    ["noisy 2.62x", addNoise(fractionalUpscale(detailedSprite(160, 120, 9), 2.62), 40), 160, 120],
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

describe("images that must be refused", () => {
  const refused: [string, PixelBuffer][] = [
    ["512x512 gradient", gradient(512, 512)],
    ["smooth photo-like field", smoothPhoto(512, 512)],
    ["blurred textured photo", boxBlur(texturePhoto(256, 256), 4)],
    ["textured photo", texturePhoto(512, 512)],
    ["periodic smooth field", smoothPhoto(700, 500)],
    ["hard-edged shapes with no grid", vectorShapes(512, 512)],
    ["small hard-edged shapes", vectorShapes(180, 140)],
    ["native detailed pixel art", detailedSprite(220, 150, 1)],
    ["native blocky pixel art", sprite(200, 2)],
    ["native blocky pixel art, other shapes", sprite(240, 4)],
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
      pixelateImage(image, {
        algorithm: Auto,
        mode: PixelationMode.RecoverGrid,
      }),
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
