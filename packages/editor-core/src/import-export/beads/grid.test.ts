import { describe, expect, it } from "vitest";

import { renderBeadChart } from "$/import-export/beads/chart";
import { BeadError, BeadErrorCode, beadErrorCode } from "$/import-export/beads/errors";
import {
  assertBeadBoardCount,
  beadBoardCount,
  beadBoards,
  beadGridPixels,
  mapBeadGrid,
  MAX_BEAD_BOARDS,
  nearestBeadColor,
  rgbToLab,
} from "$/import-export/beads/grid";
import { encodeBeadPdf } from "$/import-export/beads/pdf";

const colors = [
  { code: "H01", name: "Black", rgb: [0, 0, 0] as const },
  { code: "H02", name: "Red", rgb: [200, 0, 0] as const },
];

describe("bead charts", () => {
  it("treats alpha below 128 as empty, keeps hidden RGB out of usage and never writes input", () => {
    const source = {
      width: 4,
      height: 1,
      data: new Uint8ClampedArray([190, 0, 0, 255, 200, 0, 0, 0, 10, 10, 10, 127, 10, 10, 10, 128]),
    };
    const before = source.data.slice();
    const grid = mapBeadGrid(source, colors);
    expect([...grid.cells]).toEqual([1, -1, -1, 0]);
    expect(grid.usage.map(({ color, quantity }) => [color.code, quantity])).toEqual([
      ["H01", 1],
      ["H02", 1],
    ]);
    expect(grid.total).toBe(2);
    expect(Array.from(beadGridPixels(grid).data)).toEqual([
      200, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255,
    ]);
    expect(source.data).toEqual(before);
  });
  it("matches perceptually in CIELAB where plain RGB distance picks the wrong bead", () => {
    // Dark red is equidistant from black and red in RGB, but perceptually much closer to red.
    const grid = mapBeadGrid(
      { width: 1, height: 1, data: new Uint8ClampedArray([100, 0, 0, 255]) },
      colors,
    );
    expect(grid.usage[0].color.code).toBe("H02");
    // A saturated blue is nearer to a muted blue than to a grey of similar RGB distance.
    const blues = [
      { code: "G", name: "Grey", rgb: [90, 90, 120] as const },
      { code: "B", name: "Blue", rgb: [40, 40, 200] as const },
    ];
    expect(nearestBeadColor(blues, [0, 0, 255])).toBe(1);
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 3);
    expect(rgbToLab(0, 0, 0)).toEqual([0, 0, 0]);
  });
  it("reports typed error codes instead of display text", () => {
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    const failure = (run: () => unknown) => {
      try {
        run();
      } catch (reason) {
        return beadErrorCode(reason);
      }
      return null;
    };
    expect(failure(() => mapBeadGrid(pixels, []))).toBe(BeadErrorCode.MissingPalette);
    expect(failure(() => mapBeadGrid({ ...pixels, width: 2 }, colors))).toBe(
      BeadErrorCode.InvalidSource,
    );
    expect(failure(() => beadBoards(pixels, { width: 0, height: 29 }))).toBe(
      BeadErrorCode.InvalidBoardSize,
    );
    expect(failure(() => beadBoardCount(pixels, { width: 1.5, height: 29 }))).toBe(
      BeadErrorCode.InvalidBoardSize,
    );
    expect(beadErrorCode(new Error("x"))).toBeNull();
  });
  it("counts boards without building them and rejects counts above the PDF limit up front", () => {
    expect(beadBoardCount({ width: 31, height: 30 }, { width: 29, height: 29 })).toBe(4);
    expect(beadBoardCount({ width: 512, height: 512 }, { width: 1, height: 1 })).toBe(262144);
    expect(() =>
      assertBeadBoardCount({ width: 32, height: 32 }, { width: 1, height: 1 }),
    ).not.toThrow();
    expect(() => assertBeadBoardCount({ width: 33, height: 32 }, { width: 1, height: 1 })).toThrow(
      BeadError,
    );
    expect(MAX_BEAD_BOARDS).toBe(1024);
  });
  it("includes both partial edge boards in row-major order", () => {
    expect(beadBoards({ width: 31, height: 30 }, { width: 29, height: 29 })).toEqual([
      { column: 0, row: 0, x: 0, y: 0, width: 29, height: 29 },
      { column: 1, row: 0, x: 29, y: 0, width: 2, height: 29 },
      { column: 0, row: 1, x: 0, y: 29, width: 29, height: 1 },
      { column: 1, row: 1, x: 29, y: 29, width: 2, height: 1 },
    ]);
  });
  it("splits rectangular custom boards independently on both axes", () => {
    expect(beadBoards({ width: 53, height: 58 }, { width: 52, height: 57 })).toEqual([
      { column: 0, row: 0, x: 0, y: 0, width: 52, height: 57 },
      { column: 1, row: 0, x: 52, y: 0, width: 1, height: 57 },
      { column: 0, row: 1, x: 0, y: 57, width: 52, height: 1 },
      { column: 1, row: 1, x: 52, y: 57, width: 1, height: 1 },
    ]);
  });
  it("rasterizes an empty cell as a blank grid cell instead of assigning a bead color", () => {
    const grid = mapBeadGrid(
      { width: 2, height: 1, data: new Uint8ClampedArray([200, 0, 0, 255, 200, 0, 0, 0]) },
      colors,
    );
    const chart = renderBeadChart(grid, false, { width: 29, height: 29 });
    const rgbaAt = (x: number, y: number) =>
      Array.from(chart.data.slice((y * chart.width + x) * 4, (y * chart.width + x) * 4 + 4));
    expect(rgbaAt(24, 24)).toEqual([200, 0, 0, 255]);
    expect(rgbaAt(72, 24)).toEqual([255, 255, 255, 255]);
  });
  it("writes overview, edge boards and material pages with valid PDF object offsets and stream byte lengths", () => {
    const source = { width: 31, height: 30, data: new Uint8ClampedArray(31 * 30 * 4) };
    source.data.set([200, 0, 0, 255], (29 * 31 + 30) * 4);
    const pdf = new TextDecoder().decode(
      encodeBeadPdf(mapBeadGrid(source, colors), "Hama", { width: 29, height: 17 }, true),
    );
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf).toContain("/Count 6");
    expect(pdf).toContain("board row 2, column 2");
    expect(pdf).toContain("B4/4: board row 2, column 2");
    expect(pdf).toContain("(B4)");
    expect(pdf).toContain("Columns 30-31, rows 18-30 | board 29 x 17");
    expect(pdf).toContain("Total: 1 beads");
    expect(pdf).toContain("(31)");
    const xref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    for (const [index, match] of [...pdf.slice(xref).matchAll(/(\d{10}) 00000 n/g)].entries())
      expect(pdf.slice(Number(match[1])).startsWith(`${index + 1} 0 obj`)).toBe(true);
    for (const match of pdf.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g))
      expect(match[2].length).toBe(Number(match[1]));
  });
});
