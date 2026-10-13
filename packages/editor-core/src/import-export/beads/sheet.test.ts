import { describe, expect, it } from "vitest";

import { beadChartSize } from "$/import-export/beads/chart";
import { mapBeadGrid } from "$/import-export/beads/grid";
import { beadPatternSheetSize, renderBeadPatternSheet } from "$/import-export/beads/sheet";

const colors = [{ code: "H02", name: "Red", rgb: [200, 0, 0] as const }];

describe("bead pattern sheets", () => {
  it("keeps grid colors and empty cells while adding title, coordinates and material swatches", () => {
    const source = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([200, 0, 0, 255, 200, 0, 0, 0]),
    };
    const grid = mapBeadGrid(source, colors);
    const before = grid.cells.slice();
    const layout = beadPatternSheetSize(grid);
    const sheet = renderBeadPatternSheet(grid, "Hama", true, { width: 29, height: 29 });
    const rgba = (x: number, y: number) =>
      Array.from(sheet.data.slice((y * sheet.width + x) * 4, (y * sheet.width + x) * 4 + 4));
    expect(sheet.width).toBeGreaterThan(layout.chart.width);
    expect(sheet.height).toBeGreaterThan(layout.chart.height);
    expect(rgba(layout.chartLeft + 2, layout.chartTop + 2)).toEqual([200, 0, 0, 255]);
    expect(rgba(layout.chartLeft + 42, layout.chartTop + 2)).toEqual([255, 255, 255, 255]);
    expect(rgba(48, 48)).toEqual([0, 0, 0, 255]);
    expect(rgba(50, layout.legendTop + 50)).toEqual([200, 0, 0, 255]);
    expect(grid.cells).toEqual(before);
    expect(source.data).toEqual(new Uint8ClampedArray([200, 0, 0, 255, 200, 0, 0, 0]));
  });
  it("includes annotation space when checking the PNG memory budget", () => {
    const grid = mapBeadGrid(
      { width: 144, height: 144, data: new Uint8ClampedArray(144 * 144 * 4) },
      colors,
    );
    expect(() => beadChartSize(grid)).not.toThrow();
    expect(() => beadPatternSheetSize(grid)).toThrow("The PNG chart is too large.");
  });
});
