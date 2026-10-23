import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { estimateTilt, straighten } from "$/import-export/image/import/deskew";
import {
  addNoise,
  checkerboard,
  jitterWithMargin,
  sprite,
  texturePhoto,
  upscaleBilinear,
  upscaleNearest,
  vectorShapes,
} from "$/import-export/image/import/grid-test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { detectWithAlgorithm } from "$/import-export/image/import/pixelation-algorithm-registry";
import { pixeloePrepass } from "$/import-export/image/import/pixeloe-prepass";
import {
  applyPixelationGrid,
  defaultPixelationSettings,
  pixelationSettingsOptions,
  updatePixelationSettings,
} from "$/import-export/image/import/settings";
import {
  CellColorPicker,
  LineGuideMode,
  OutlinePrepass,
  PixelationAlgorithm,
  PixelationMethod,
  PixelationMode,
  type PixelationSettings,
} from "$/import-export/image/import/types";

/**
 * The pixelation engine (grid detection, tilt, PixelOE pre-passes and stock PixelOE, colour
 * pickers, colour limits) pinned byte for byte to its output before the speed-up: every digest
 * below was recorded with the previous implementation. Each one hashes the grids and the result
 * pixels of a whole batch of settings, so any changed byte fails the batch it belongs to.
 */
const sha = (...parts: (string | Uint8ClampedArray)[]) => {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex").slice(0, 16);
};
const pixels = (image: PixelBuffer) => `${image.width}x${image.height}:${sha(image.data)}`;

/** Alpha varied per pixel (some fully clear), so translucent pairs take the slow paths. */
function translucent(source: PixelBuffer): PixelBuffer {
  const data = new Uint8ClampedArray(source.data);
  for (let i = 0; i < data.length / 4; i++)
    data[i * 4 + 3] = i % 7 === 0 ? 0 : 128 + ((i * 13) % 128);
  return { ...source, data };
}

const IMAGES: Record<string, () => PixelBuffer> = {
  /** The size of the pixelate tool's example photo. */
  "photo 608x720": () => texturePhoto(608, 720),
  shapes: () => vectorShapes(180, 140),
  "sprite x4": () => upscaleNearest(sprite(32), 4),
  /** Rotated 3°, so detection straightens it first and recovery rotates back. */
  "tilted sprite": () => straighten(upscaleNearest(sprite(40), 8), -3),
  "noisy smooth sprite": () => addNoise(upscaleBilinear(sprite(24), 5), 12),
  "jittered cells": () => jitterWithMargin(upscaleNearest(sprite(12), 1)),
  checkerboard: () => checkerboard(5, 20),
  translucent: () => translucent(upscaleNearest(sprite(30), 5)),
};
const PALETTE = [
  [0, 0, 0, 255],
  [255, 255, 255, 255],
  [200, 40, 40, 255],
  [40, 160, 60, 255],
  [30, 60, 200, 255],
  [240, 200, 60, 255],
] as const;
const COLORS: Partial<PixelationSettings>[] = [
  {},
  { reduceColors: true, maxColors: 8 },
  {
    reduceColors: true,
    palette: PALETTE.map((color) => [...color] as [number, number, number, number]),
  },
];
const PREPASSES: Partial<PixelationSettings>[] = [
  { prepass: OutlinePrepass.None },
  { prepass: OutlinePrepass.Pixeloe },
  { prepass: OutlinePrepass.PixeloeLines, lineGuide: LineGuideMode.Union },
  { prepass: OutlinePrepass.PixeloeLines, lineGuide: LineGuideMode.Replace },
];
/** Settings patches on top of the tool's defaults: every pre-pass, picker, colour limit and method. */
const VARIANTS: Partial<PixelationSettings>[] = [
  ...Object.values(CellColorPicker).flatMap((colorPicker, c) =>
    [PREPASSES[c % PREPASSES.length], PREPASSES[(c + 2) % PREPASSES.length]].map((prepass, p) => ({
      ...prepass,
      colorPicker,
      ...COLORS[(c + p) % COLORS.length],
    })),
  ),
  ...Object.values(PixelationMethod).map((method) => ({
    mode: PixelationMode.Convert,
    prepass: OutlinePrepass.None,
    method,
  })),
  {
    mode: PixelationMode.Convert,
    prepass: OutlinePrepass.None,
    outlineStrength: 60,
    removeNoise: true,
    preserveDimensions: true,
  },
  {
    mode: PixelationMode.Convert,
    prepass: OutlinePrepass.None,
    blockPicker: true,
    colorPicker: CellColorPicker.Median,
    targetWidth: 23,
  },
  { mode: PixelationMode.Convert, prepass: OutlinePrepass.PixeloeLines, targetWidth: 20 },
  {
    mode: PixelationMode.RecoverGrid,
    autoGrid: false,
    gridCellWidth: 9,
    gridCellHeight: 9,
    prepass: OutlinePrepass.Pixeloe,
  },
];
/** The grid an algorithm finds and the result of each variant on it, hashed together. */
function batch(
  image: PixelBuffer,
  algorithm: PixelationAlgorithm,
  patches: Partial<PixelationSettings>[],
) {
  const size =
    algorithm === PixelationAlgorithm.CustomSize
      ? { width: 37, height: Math.max(1, Math.round((37 * image.height) / image.width)) }
      : undefined;
  const grid = detectWithAlgorithm(image, algorithm, size);
  const base = applyPixelationGrid(defaultPixelationSettings(image, grid), grid, image);
  const results = patches.map((patch) => {
    const settings = updatePixelationSettings(base, patch, image);
    return pixels(pixelateImage(image, pixelationSettingsOptions(settings, image, grid)));
  });
  return sha(JSON.stringify(grid), ...results);
}
/** Every algorithm with the tool's defaults; the settings variants on the Auto grid. */
function run(name: string): Record<string, string> {
  const image = IMAGES[name]();
  const out: Record<string, string> = {
    tilt: JSON.stringify(estimateTilt(image)),
    "straightened 2.5°": pixels(straighten(image, 2.5)),
    "pre-pass 2.6": pixels(pixeloePrepass(image, 2.6)),
  };
  for (const algorithm of Object.values(PixelationAlgorithm))
    out[algorithm] = batch(image, algorithm, [{}]);
  out.variants = batch(image, PixelationAlgorithm.Auto, VARIANTS);
  return out;
}

const GOLDEN: Record<string, Record<string, string>> = {
  "photo 608x720": {
    tilt: '{"angle":0,"gain":1,"extreme":false}',
    "straightened 2.5°": "608x720:f4dc2d6d1fc72f17",
    "pre-pass 2.6": "608x720:e9d15d03762c1408",
    auto: "0c4d660e60f47989",
    "edge-grid": "725519a135e56be2",
    "uniform-grid": "a0f5a8eef7885b54",
    "custom-size": "41ee92eadeaaff67",
    resize: "0c4d660e60f47989",
    variants: "79d59fc356adc3d4",
  },
  shapes: {
    tilt: '{"angle":0,"gain":1.0643185298621745,"extreme":false}',
    "straightened 2.5°": "180x140:04651ea26331592c",
    "pre-pass 2.6": "180x140:e80d85a1f1438728",
    auto: "ef59b5420eed55f6",
    "edge-grid": "cde683fb7e67b669",
    "uniform-grid": "c7867f9a0d8d4c94",
    "custom-size": "c387540f6842d929",
    resize: "ef59b5420eed55f6",
    variants: "8bc462c48be191d1",
  },
  "sprite x4": {
    tilt: '{"angle":0,"gain":1,"extreme":false}',
    "straightened 2.5°": "128x128:01e7a61c087b3ea5",
    "pre-pass 2.6": "128x128:cb393a9291f659dc",
    auto: "f87e00f02f92d9ec",
    "edge-grid": "e2ce4778ea6bb302",
    "uniform-grid": "f87e00f02f92d9ec",
    "custom-size": "9cc9af973bb68019",
    resize: "90d1e1812fa65f99",
    variants: "661b285c4275123b",
  },
  "tilted sprite": {
    tilt: '{"angle":3.05,"gain":2.7311209009368556,"extreme":false}',
    "straightened 2.5°": "320x320:f706f0192cccc4f2",
    "pre-pass 2.6": "320x320:874abbc9abcd98c8",
    auto: "92fddb63d2847fe9",
    "edge-grid": "1c7632c47c8b2e84",
    "uniform-grid": "92fddb63d2847fe9",
    "custom-size": "3164a8cde8fa8ab7",
    resize: "686ee193f041b713",
    variants: "b74ae934ac92d9b0",
  },
  "noisy smooth sprite": {
    tilt: '{"angle":0,"gain":1.0018776944915955,"extreme":false}',
    "straightened 2.5°": "120x120:f43dd902f2106741",
    "pre-pass 2.6": "120x120:ce2eb57e349fed5e",
    auto: "14afe3ec138ff69f",
    "edge-grid": "137306c74c677998",
    "uniform-grid": "281489c763f903ea",
    "custom-size": "3a92114a7770b2ad",
    resize: "14afe3ec138ff69f",
    variants: "0a6031e9dda29ede",
  },
  "jittered cells": {
    tilt: '{"angle":0,"gain":1,"extreme":false}',
    "straightened 2.5°": "196x200:f037d049755c60f0",
    "pre-pass 2.6": "196x200:e43e8832da8211bc",
    auto: "ffa9990742656300",
    "edge-grid": "882886cc1ffb7881",
    "uniform-grid": "ffa9990742656300",
    "custom-size": "201717e08ffb8442",
    resize: "9407f6361b91d2ac",
    variants: "b56b484dce12499d",
  },
  checkerboard: {
    tilt: '{"angle":0,"gain":1,"extreme":false}',
    "straightened 2.5°": "100x100:6e5355c69bd41bf2",
    "pre-pass 2.6": "100x100:6de73128d2c04158",
    auto: "8679ec6c534d8726",
    "edge-grid": "76d4ab85ade76de2",
    "uniform-grid": "8679ec6c534d8726",
    "custom-size": "8f163c20f836fa14",
    resize: "193e9a5a38fe369b",
    variants: "cc4e0add2b27808a",
  },
  translucent: {
    tilt: '{"angle":0,"gain":1,"extreme":false}',
    "straightened 2.5°": "150x150:66d4a89484b00fb8",
    "pre-pass 2.6": "150x150:a2c8237184fc5b3e",
    auto: "b762fbd726750f3e",
    "edge-grid": "419fef92b4b3188b",
    "uniform-grid": "2bf3f92797a30924",
    "custom-size": "78ac667a48e9fa1d",
    resize: "b762fbd726750f3e",
    variants: "0a809e5836ae54e5",
  },
};

describe("pixelation engine output (golden, recorded before the speed-up)", () => {
  for (const name of Object.keys(IMAGES))
    test(`${name} is unchanged`, () => expect(run(name)).toEqual(GOLDEN[name]));

  test("results do not depend on what ran before (remembered PixelOE and edge tables)", () => {
    const names = ["tilted sprite", "translucent"];
    const forward = names.map(run);
    const backward = [...names].reverse().map(run).reverse();
    expect(backward).toEqual(forward);
  });
});
