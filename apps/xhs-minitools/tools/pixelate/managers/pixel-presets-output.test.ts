import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PIXEL_PRESETS, PixelPreset, presetPlan } from "$/tools/pixelate/managers/pixel-presets";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  applyPixelationGrid,
  detectWithAlgorithm,
  pixelateImage,
  PixelationAlgorithm,
  PixelationMode,
  pixelationSettingsOptions,
  type PixelationSettings,
  type PixelGridAnalysis,
} from "@xprite/editor-core/import-export";

/**
 * What each preset shows, byte for byte, as recorded before the engine speed-up: the result after
 * the preset is applied (and, for a recovered grid, regridded to its custom size) and its
 * thumbnail's settings.
 */
function noise(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
/** A smooth, noisy photo with soft blobs: no pixel grid, so it converts. */
function photo(width: number, height: number): PixelBuffer {
  const random = noise(5);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4,
        u = x / width,
        v = y / height;
      const blob = Math.exp(-((u - 0.4) ** 2 + (v - 0.35) ** 2) * 18);
      data[o] = 60 + 150 * u + 40 * blob + (random() - 0.5) * 30;
      data[o + 1] = 90 + 100 * Math.sin(v * 5) * blob + (random() - 0.5) * 30;
      data[o + 2] = 170 - 120 * v + (random() - 0.5) * 30;
      data[o + 3] = 255;
    }
  return { width, height, data };
}
/** Pixel art of `cells` blocks, each `scale` pixels: a reliable grid to recover. */
function blocks(cells: number, scale: number): PixelBuffer {
  const random = noise(9);
  const colours = Array.from({ length: cells * cells }, () => [random(), random(), random()]);
  const size = cells * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const colour = colours[Math.floor(y / scale) * cells + Math.floor(x / scale)];
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = Math.round(colour[c] * 4) * 60;
      data[o + 3] = 255;
    }
  return { width: size, height: size, data };
}
const digest = (image: PixelBuffer) =>
  `${image.width}x${image.height}:${createHash("sha256").update(image.data).digest("hex").slice(0, 16)}`;

function presetResults(image: PixelBuffer) {
  const auto = detectWithAlgorithm(image);
  const convert = (settings: PixelationSettings, grid: PixelGridAnalysis) =>
    digest(pixelateImage(image, pixelationSettingsOptions(settings, image, grid)));
  const out: Record<string, string> = {};
  for (const preset of PIXEL_PRESETS) {
    const plan = presetPlan(preset, image, auto);
    out[preset] = convert(plan.settings, auto);
    if (plan.customGrid) {
      // The editor then detects the custom size and converts again, as the manager does.
      const grid = detectWithAlgorithm(image, PixelationAlgorithm.CustomSize, plan.customGrid);
      out[`${preset} regridded`] = convert(applyPixelationGrid(plan.settings, grid, image), grid);
      out[`${preset} thumbnail`] = convert(
        {
          ...plan.settings,
          mode: PixelationMode.Convert,
          targetWidth: plan.customGrid.width,
          targetHeight: plan.customGrid.height,
        },
        auto,
      );
    }
  }
  return out;
}

const GOLDEN: Record<string, Record<string, string>> = {
  photo: {
    default: "53x64:406f1dbb676702cd",
    clear: "80x96:c678896d6875eb27",
    retro: "32x38:120dd0aa577fb055",
    "few-colors": "53x64:8bdd68ef61e88825",
  },
  "pixel art": {
    default: "24x24:b494bc2993594b6d",
    clear: "24x24:b494bc2993594b6d",
    "clear regridded": "36x36:4e1214f5996786a9",
    "clear thumbnail": "36x36:4e1214f5996786a9",
    retro: "24x24:b494bc2993594b6d",
    "retro regridded": "14x14:22c4ceba5fe71bfe",
    "retro thumbnail": "14x14:22c4ceba5fe71bfe",
    "few-colors": "24x24:64212b546546510b",
  },
};

describe("pixel preset output (golden)", () => {
  it("is unchanged on a photo", () => expect(presetResults(photo(300, 360))).toEqual(GOLDEN.photo));
  it("is unchanged on pixel art", () =>
    expect(presetResults(blocks(24, 7))).toEqual(GOLDEN["pixel art"]));
  it("covers every preset", () =>
    expect(Object.keys(GOLDEN.photo).filter((key) => !key.includes(" "))).toEqual(
      Object.values(PixelPreset),
    ));
});
