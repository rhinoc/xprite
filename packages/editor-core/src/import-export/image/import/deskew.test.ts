// @cpu-intensive
import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  MAX_TILT_DEGREES,
  MIN_TILT_DEGREES,
  estimateTilt,
  straighten,
} from "$/import-export/image/import/deskew";
import {
  addNoise,
  gradient,
  sprite,
  texturePhoto,
  upscaleNearest,
} from "$/import-export/image/import/grid-test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { detectWithAlgorithm } from "$/import-export/image/import/pixelation-algorithm-registry";
import {
  PixelationAlgorithm,
  PixelationMode,
  type PixelGridAnalysis,
} from "$/import-export/image/import/types";

/** Independent reference rotation (nearest neighbour, repeated border) used to tilt test images. */
function tilt(source: PixelBuffer, degrees: number): PixelBuffer {
  const { width, height } = source;
  const out = new Uint8ClampedArray(source.data.length);
  const r = (degrees * Math.PI) / 180;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2,
        dy = y - height / 2;
      const sx = Math.min(
        width - 1,
        Math.max(0, Math.round(width / 2 + dx * Math.cos(r) + dy * Math.sin(r))),
      );
      const sy = Math.min(
        height - 1,
        Math.max(0, Math.round(height / 2 - dx * Math.sin(r) + dy * Math.cos(r))),
      );
      out.set(
        source.data.subarray((sy * width + sx) * 4, (sy * width + sx) * 4 + 4),
        (y * width + x) * 4,
      );
    }
  return { width, height, data: out };
}
const art = sprite(64);
const upright = upscaleNearest(art, 16);
const same = (a: PixelBuffer, b: PixelBuffer) => {
  let equal = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (
      a.data[i] === b.data[i] &&
      a.data[i + 1] === b.data[i + 1] &&
      a.data[i + 2] === b.data[i + 2]
    )
      equal++;
  return equal / (a.data.length / 4);
};

describe("tilt estimation", () => {
  test.each([0.6, 1.2, -2.5, 4, -7.5, 9])("finds a %f° tilt", (degrees) => {
    const found = estimateTilt(tilt(upright, degrees));
    expect(found.extreme).toBe(false);
    // The returned angle is what `straighten` needs to undo the tilt.
    expect(Math.abs(found.angle - degrees)).toBeLessThan(0.1);
    expect(found.gain).toBeGreaterThan(1.25);
  });
  test("aligned images, photos and gradients are left alone (angle 0)", () => {
    for (const image of [
      upright,
      upscaleNearest(art, 7.3),
      addNoise(upright, 10),
      texturePhoto(400, 300),
      gradient(300, 300),
    ])
      expect(estimateTilt(image).angle).toBe(0);
  });
  test("a tilt below the minimum is ignored", () => {
    expect(MIN_TILT_DEGREES).toBeGreaterThan(0.1);
    expect(estimateTilt(tilt(upright, 0.05)).angle).toBe(0);
  });
  test("a tilt beyond the search range is flagged as extreme", () => {
    const found = estimateTilt(tilt(upright, MAX_TILT_DEGREES + 4));
    expect(found.extreme).toBe(true);
    expect(found.angle).toBe(0);
  });
  test("straighten is a no-op at 0° and keeps the canvas size", () => {
    expect(straighten(upright, 0)).toBe(upright);
    const out = straighten(upright, 3);
    expect([out.width, out.height]).toEqual([upright.width, upright.height]);
  });
  test("straighten undoes the estimated tilt", () => {
    const tilted = tilt(upright, 3);
    const flat = straighten(tilted, estimateTilt(tilted).angle);
    expect(same(flat, upright)).toBeGreaterThan(0.93);
  });
});

const tiltedGrids = new Map<number, { image: PixelBuffer; grid: PixelGridAnalysis }>();
/** One Auto detection per tilt; recovery straightens on its grid, as the tools pass it. */
function tiltedGrid(degrees: number) {
  let found = tiltedGrids.get(degrees);
  if (!found) {
    const image = tilt(upright, degrees);
    found = { image, grid: detectWithAlgorithm(image, PixelationAlgorithm.Auto) };
    tiltedGrids.set(degrees, found);
  }
  return found;
}

describe("grid recovery from a tilted image", () => {
  test.each([1.2, -3, 6])("recovers the 64x64 grid of a %f° tilted sprite", (degrees) => {
    const { image, grid } = tiltedGrid(degrees);
    expect(grid.reliable).toBe(true);
    expect([grid.width, grid.height]).toEqual([64, 64]);
    expect(Math.abs((grid.rotation ?? 0) - degrees)).toBeLessThan(0.1);
    const out = pixelateImage(image, { algorithm: PixelationAlgorithm.Auto, grid });
    expect([out.width, out.height]).toEqual([64, 64]);
    // Only the cells along the replicated border and the staircase edges may differ.
    expect(same(out, art)).toBeGreaterThan(0.97);
  });
  test("aligned images are not rotated", () => {
    const grid = detectWithAlgorithm(upright, PixelationAlgorithm.Auto);
    expect(grid.reliable).toBe(true);
    expect(grid.rotation).toBeUndefined();
    expect(
      Array.from(pixelateImage(upright, { algorithm: PixelationAlgorithm.Auto, grid }).data),
    ).toEqual(Array.from(art.data));
  });
  test("a tilt beyond the search range is refused", () => {
    const grid = detectWithAlgorithm(tilt(upright, 14), PixelationAlgorithm.Auto);
    expect(grid.reliable).toBe(false);
    // The explicit Recover pixel grid action then reports the existing "no grid" error.
    expect(() =>
      pixelateImage(tilt(upright, 14), {
        algorithm: PixelationAlgorithm.Auto,
        mode: PixelationMode.RecoverGrid,
      }),
    ).toThrow(/No consistent pixel grid/);
  });
  test("a photo is never straightened into a grid", () => {
    const grid = detectWithAlgorithm(texturePhoto(400, 300), PixelationAlgorithm.Auto);
    expect(grid.reliable).toBe(false);
    expect(grid.rotation).toBeUndefined();
  });
});
