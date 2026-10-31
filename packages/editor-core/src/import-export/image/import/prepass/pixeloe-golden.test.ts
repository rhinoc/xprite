import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { blockPartition } from "$/import-export/image/import/grid/lattice";
import { recoverWithGrid } from "$/import-export/image/import/grid/registry";
import {
  sprite,
  texturePhoto,
  upscaleNearest,
  vectorShapes,
} from "$/import-export/image/import/grid/test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { pixeloePrepass } from "$/import-export/image/import/prepass/pixeloe-prepass";
import {
  CellColorPicker,
  OutlinePrepass,
  PixelationAlgorithm,
  PixelationMode,
} from "$/import-export/image/import/types";

const digest = (image: PixelBuffer) =>
  `${image.width}x${image.height}:${createHash("sha256").update(image.data).digest("hex").slice(0, 16)}`;

/**
 * The original PixelOE pre-pass and preset, pinned to their output before line-guided PixelOE
 * was added. The pre-pass itself and every combination the old checkbox offered keep their pixels.
 * The one exception is deliberate: on a plain convert, PixelOE + Contrast (the old preset) now runs
 * stock PixelOE (see outline-prepass.test.ts), so the old preset's pipeline is pinned directly.
 */
const CASES: Record<string, () => PixelBuffer> = {
  "pre-pass alone": () => pixeloePrepass(texturePhoto(96, 80), 6),
  "preset on a convert": () => {
    const image = vectorShapes(150, 120);
    const blocks = { ...blockPartition(image, 30, 24), confidence: 1, reliable: true };
    return recoverWithGrid(pixeloePrepass(image, 5), blocks, CellColorPicker.Contrast);
  },
  "pre-pass on a recovered grid": () =>
    pixelateImage(upscaleNearest(sprite(32), 4), {
      algorithm: PixelationAlgorithm.Auto,
      colorPicker: CellColorPicker.Contrast,
      prepass: OutlinePrepass.Pixeloe,
    }),
  "no pre-pass": () =>
    pixelateImage(vectorShapes(150, 120), {
      mode: PixelationMode.Convert,
      blockPicker: true,
      targetWidth: 30,
      targetHeight: 24,
      colorPicker: CellColorPicker.Median,
    }),
};
const GOLDEN: Record<string, string> = {
  "pre-pass alone": "96x80:e438d7bb3c599a3f",
  "preset on a convert": "30x24:70577d961f0006d7",
  "pre-pass on a recovered grid": "32x32:7e742a3c6e711342",
  "no pre-pass": "30x24:3e6e0be4e6f6d888",
};

describe("original PixelOE pre-pass (golden)", () => {
  for (const [name, run] of Object.entries(CASES))
    test(`${name} is unchanged`, () => expect(digest(run())).toBe(GOLDEN[name]));
});
