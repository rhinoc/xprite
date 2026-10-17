import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { getAllColorPickers } from "$/import-export/image/import/cell-color-picker";
import { addNoise, sprite, upscaleNearest } from "$/import-export/image/import/grid-test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import {
  detectWithAlgorithm,
  getAllAlgorithms,
  recoverWithGrid,
} from "$/import-export/image/import/pixelation-algorithm-registry";
import {
  CellColorPicker,
  PixelationAlgorithm,
  PixelationMode,
} from "$/import-export/image/import/types";

const { MostCommon, Average, Median, KMeans, Contrast, Nearest } = CellColorPicker;
const noisy = addNoise(upscaleNearest(sprite(64), 12), 24);
const gridAlgorithms = getAllAlgorithms().filter((id) => id !== PixelationAlgorithm.Resize);

/** One 3x3 cell: six red pixels and three blue ones. */
function mixedCell(): PixelBuffer {
  const data = new Uint8ClampedArray(3 * 3 * 4);
  for (let i = 0; i < 9; i++) data.set(i < 6 ? [200, 0, 0, 255] : [0, 0, 200, 255], i * 4);
  return { width: 3, height: 3, data };
}
const oneCell = { width: 1, height: 1, cellWidth: 3, cellHeight: 3, offsetX: 0, offsetY: 0 };

describe("cell colour pickers", () => {
  test("each picker follows its own rule", () => {
    const pick = (picker: CellColorPicker) =>
      Array.from(recoverWithGrid(mixedCell(), oneCell, picker).data);
    expect(pick(MostCommon)).toEqual([200, 0, 0, 255]);
    expect(pick(Median)).toEqual([200, 0, 0, 255]);
    expect(pick(Average)).toEqual([133, 0, 67, 255]);
    expect(pick(KMeans)).toEqual([200, 0, 0, 255]);
    expect(pick(Nearest)).toEqual([200, 0, 0, 255]);
  });
  test("Nearest takes the cell-centre pixel", () => {
    const cell = mixedCell();
    cell.data.set([10, 20, 30, 255], 4 * 4);
    expect(Array.from(recoverWithGrid(cell, oneCell, Nearest).data)).toEqual([10, 20, 30, 255]);
  });
  test("Contrast keeps a line's lightness a Median cell would wash out", () => {
    const cell = mixedCell();
    for (let i = 0; i < 9; i++)
      cell.data.set(i < 6 ? [230, 230, 230, 255] : [20, 20, 20, 255], i * 4);
    const light = (picker: CellColorPicker) => recoverWithGrid(cell, oneCell, picker).data[0];
    expect(light(Median)).toBe(230);
    expect(light(Contrast)).toBeLessThan(230);
    expect(light(Contrast)).toBeGreaterThan(20);
  });
  test("the picker table lists every picker", () => {
    expect([...getAllColorPickers()].sort()).toEqual(
      [Average, MostCommon, Median, KMeans, Contrast, Nearest].sort(),
    );
  });
  test("every grid detector composes with every picker", () => {
    for (const algorithm of gridAlgorithms) {
      const grid = detectWithAlgorithm(noisy, algorithm);
      expect(grid.reliable, algorithm).toBe(true);
      for (const picker of getAllColorPickers()) {
        const out = pixelateImage(noisy, {
          mode: PixelationMode.RecoverGrid,
          algorithm,
          colorPicker: picker,
        });
        expect([out.width, out.height], `${algorithm}+${picker}`).toEqual([
          grid.width,
          grid.height,
        ]);
      }
    }
  });
  test("different pickers give different pixels on every detector's grid", () => {
    for (const algorithm of gridAlgorithms) {
      const outputs = getAllColorPickers().map((picker) =>
        Array.from(
          pixelateImage(noisy, { mode: PixelationMode.RecoverGrid, algorithm, colorPicker: picker })
            .data,
        ).join(","),
      );
      expect(new Set(outputs).size, algorithm).toBe(outputs.length);
    }
  });
  test("different pickers give different pixels on the same grid", () => {
    const run = (picker: CellColorPicker) =>
      pixelateImage(noisy, {
        mode: PixelationMode.RecoverGrid,
        algorithm: PixelationAlgorithm.UniformGrid,
        colorPicker: picker,
      }).data;
    const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
      a.length === b.length && a.every((value, i) => value === b[i]);
    const pickers = getAllColorPickers();
    for (let i = 0; i < pickers.length; i++)
      for (let j = i + 1; j < pickers.length; j++)
        expect(same(run(pickers[i]), run(pickers[j])), `${pickers[i]} vs ${pickers[j]}`).toBe(
          false,
        );
  });
});
