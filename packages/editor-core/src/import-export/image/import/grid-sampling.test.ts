import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { describeImage } from "$/import-export/image/import/grid-description-length";
import {
  materializeGridImage,
  prepareGridSampling,
  shiftedGridImage,
} from "$/import-export/image/import/grid-sampling";
import { linePrefix } from "$/import-export/image/import/grid-strip-shift";
import { sprite, upscaleNearest } from "$/import-export/image/import/grid-test-images";
import { pixelateImage, pixelateImageAsync } from "$/import-export/image/import/pixelate";
import {
  detectWithAlgorithm,
  recoverWithGrid,
} from "$/import-export/image/import/pixelation-algorithm-registry";
import {
  CellColorPicker,
  PixelationAlgorithm,
  PixelationMode,
  PixelGridSamplingAxis,
  type PixelGridAnalysis,
} from "$/import-export/image/import/types";

const STRIDE = 4;
const PITCH = 6;
const CELLS = 32;
const DRIFT = 5;
const PERIOD = 80;

/** Compare every color channel, leaving the edge cells whose source pixels were clipped. */
function interior(image: PixelBuffer): number[] {
  const values: number[] = [];
  for (let y = 0; y < image.height; y++)
    for (let x = 1; x < image.width - 1; x++)
      values.push(
        ...image.data.subarray((y * image.width + x) * STRIDE, (y * image.width + x + 1) * STRIDE),
      );
  return values;
}

function driftRows(image: PixelBuffer): PixelBuffer {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < height; y++) {
    const shift = Math.round(DRIFT * Math.sin((2 * Math.PI * y) / PERIOD));
    for (let x = 0; x < width; x++) {
      const from = (y * width + Math.max(0, Math.min(width - 1, x - shift))) * STRIDE;
      data.set(image.data.subarray(from, from + STRIDE), (y * width + x) * STRIDE);
    }
  }
  return { width, height, data };
}

describe("compact inverse grid sampling", () => {
  test("large distinct shift patterns keep source ownership and per-stage clamping", () => {
    const size = 600;
    const source = { width: size, height: size, data: new Uint8ClampedArray(size * size * STRIDE) };
    const view = shiftedGridImage(source, {
      axis: PixelGridSamplingAxis.Horizontal,
      bands: [0, size],
      across: Array.from({ length: size + 1 }, (_, i) => i),
      shifts: [Array.from({ length: size }, (_, i) => i - size / 2)],
    });
    expect(view.data).toBe(source.data);
    expect(view.offset!(0, 0)).toBe(0);
    expect(view.offset!(599, 0)).toBe(299 * STRIDE);
    expect(view.offset!(300, 300)).toBe((300 * size + 300) * STRIDE);
    expect(view.offset!(0, 599)).toBe((599 * size + 299) * STRIDE);
    expect(view.offset!(599, 599)).toBe((size * size - 1) * STRIDE);
  });

  test("an invalid shift matrix fails when read instead of substituting pixel zero", () => {
    const source = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * STRIDE) };
    const view = shiftedGridImage(source, {
      axis: PixelGridSamplingAxis.Horizontal,
      bands: [0, 4],
      across: [0, 4],
      shifts: [],
    });
    expect(view.data).toBe(source.data);
    expect(() => view.offset!(0, 0)).toThrow(TypeError);
  });

  test("interval lookup keeps the later band at equal and fractional boundaries", () => {
    const source = {
      width: 5,
      height: 1,
      data: Uint8ClampedArray.from([10, 20, 30, 40, 50].flatMap((r) => [r, 0, 0, 255])),
    };
    const view = shiftedGridImage(source, {
      axis: PixelGridSamplingAxis.Horizontal,
      bands: [0, 2, 2, 3.2, 5],
      across: [0, 1],
      shifts: [[0], [-1], [1], [-2]],
    });
    expect(Array.from(materializeGridImage(view).data).filter((_, i) => i % STRIDE === 0)).toEqual([
      10, 20, 40, 50, 30,
    ]);
  });

  test("composes both axes in order and clamps each intermediate coordinate", () => {
    const source = {
      width: 4,
      height: 3,
      data: Uint8ClampedArray.from(Array.from({ length: 12 }, (_, i) => [i + 1, 0, 0, 255]).flat()),
    };
    const horizontal = shiftedGridImage(source, {
      axis: PixelGridSamplingAxis.Horizontal,
      bands: [0, 4],
      across: [0, 1, 3],
      shifts: [[1, -1]],
    });
    const both = shiftedGridImage(horizontal, {
      axis: PixelGridSamplingAxis.Vertical,
      bands: [0, 3],
      across: [0, 2, 4],
      shifts: [[1, -1]],
    });
    expect(both.data).toBe(source.data);
    const output = materializeGridImage(both);
    expect(Array.from(output.data).filter((_, i) => i % STRIDE === 0)).toEqual([
      5, 5, 4, 4, 9, 9, 4, 4, 9, 9, 6, 7,
    ]);
    expect(describeImage(both).values).toEqual(describeImage(output).values);
    expect(linePrefix(both, false)).toEqual(linePrefix(output, false));
    expect(linePrefix(both, true)).toEqual(linePrefix(output, true));
    const grid: PixelGridAnalysis = {
      width: 4,
      height: 3,
      cellWidth: 1,
      cellHeight: 1,
      offsetX: 0,
      offsetY: 0,
      confidence: 1,
      reliable: true,
      sampling: structuredClone(both.sampling),
    };
    expect(prepareGridSampling(source, grid)).toEqual(output);
    expect(prepareGridSampling(source, { ...grid, confidence: 0.35 })).toEqual(output);
    expect(prepareGridSampling(source, { ...grid, confidence: 0.34 })).toBe(source);
  });

  test("frame cropping describes mapped pixels with their original source stride", () => {
    const source = { width: 6, height: 6, data: new Uint8ClampedArray(6 * 6 * STRIDE).fill(255) };
    for (let y = 1; y < 5; y++)
      for (let x = 1; x < 5; x++) {
        const at = (y * source.width + x) * STRIDE;
        source.data[at] = x * 20;
        source.data[at + 1] = y * 20;
      }
    const view = shiftedGridImage(source, {
      axis: PixelGridSamplingAxis.Horizontal,
      bands: [0, 6],
      across: [0, 6],
      shifts: [[1]],
    });
    const lazy = describeImage(view);
    const eager = describeImage(materializeGridImage(view));
    expect(lazy.content.width).toBeLessThan(source.width);
    expect(lazy.top).toBe(1);
    expect(lazy.content.data).toBe(source.data);
    expect([lazy.left, lazy.top, lazy.content.width, lazy.content.height]).toEqual([
      eager.left,
      eager.top,
      eager.content.width,
      eager.content.height,
    ]);
    expect(lazy.values).toEqual(eager.values);
  });

  test("Auto's mapped reading reaches actual sync and async colors", async () => {
    const original = sprite(CELLS);
    const warped = driftRows(upscaleNearest(original, PITCH));
    const grid = detectWithAlgorithm(warped, PixelationAlgorithm.Auto);
    expect([grid.width, grid.height]).toEqual([CELLS, CELLS]);
    expect(grid.confidence).toBeGreaterThanOrEqual(0.35);
    expect(grid.sampling?.length).toBeGreaterThan(0);
    const options = {
      mode: PixelationMode.RecoverGrid,
      algorithm: PixelationAlgorithm.Auto,
      colorPicker: CellColorPicker.TwoStage,
      grid: structuredClone(grid),
    };
    const expected = interior(original);
    expect(interior(recoverWithGrid(warped, grid, CellColorPicker.TwoStage))).toEqual(expected);
    expect(interior(pixelateImage(warped, options))).toEqual(expected);
    expect(interior(await pixelateImageAsync(warped, options))).toEqual(expected);
    expect(interior(await pixelateImageAsync(warped, { ...options, grid: undefined }))).toEqual(
      expected,
    );
    const unmapped = pixelateImage(warped, { ...options, grid: { ...grid, sampling: undefined } });
    expect(interior(unmapped)).not.toEqual(expected);
  });
});
