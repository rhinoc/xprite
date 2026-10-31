import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { recoverWithGrid } from "$/import-export/image/import/pixelation-algorithm-registry";
import { CellColorPicker } from "$/import-export/image/import/types";

const { MostCommon, Average, Median, KMeans, Contrast, Nearest } = CellColorPicker;

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
  test("Contrast follows PixelOE: skewed cells snap to the patch min or max", () => {
    const grey = (values: number[]) => {
      const cell = mixedCell();
      values.forEach((v, i) => cell.data.set([v, v, v, 255], i * 4));
      return (picker: CellColorPicker) => recoverWithGrid(cell, oneCell, picker).data[0];
    };
    // median 100 < mean, max is farther from the median than the min -> the patch minimum (20)
    const skewed = grey([100, 100, 100, 100, 100, 100, 100, 250, 20]);
    expect(skewed(Median)).toBe(100);
    expect(Math.abs(skewed(Contrast) - 20)).toBeLessThanOrEqual(1);
    // median 230 > mean, max is nearer the median than the min -> the patch maximum (230)
    expect(
      Math.abs(grey([230, 230, 230, 230, 230, 230, 20, 20, 20])(Contrast) - 230),
    ).toBeLessThanOrEqual(1);
  });
});
