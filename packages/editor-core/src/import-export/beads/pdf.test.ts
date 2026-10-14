import { describe, expect, it } from "vitest";

import type { ExportRasterText } from "$/import-export/attribution";
import { BeadError, BeadErrorCode, beadErrorCode } from "$/import-export/beads/errors";
import { mapBeadGrid } from "$/import-export/beads/grid";
import { ENGLISH_BEAD_LABELS, type BeadDocumentLabels } from "$/import-export/beads/labels";
import { encodeBeadPdf, encodeBeadPdfAsync } from "$/import-export/beads/pdf";

const colors = [{ code: "H02", name: "Red", rgb: [200, 0, 0] as const }];
const source = { width: 31, height: 30, data: new Uint8ClampedArray(31 * 30 * 4) };
source.data.set([200, 0, 0, 255], (29 * 31 + 30) * 4);
const grid = mapBeadGrid(source, colors);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A 2×2-pixel ink box per character, standing in for canvas text in tests. */
const fakeRasterText: ExportRasterText = {
  measure: (value, size) => ({
    width: value.length * 2,
    height: Math.max(2, Math.round(size / 8)),
  }),
  draw(target, value, x, y, _size, rgb) {
    for (let index = 0; index < value.length; index++) {
      const offset = (y * target.width + x + index * 2) * 4;
      target.data.set([rgb[0], rgb[1], rgb[2], 255], offset);
    }
  },
};

describe("bead PDF", () => {
  it("prints caller-supplied labels instead of fixed English", () => {
    const labels: BeadDocumentLabels = {
      ...ENGLISH_BEAD_LABELS,
      overview: ({ brand }) => `${brand} - VISTA`,
      boardPage: ({ index, count }) => `PLACA ${index} DE ${count}`,
      total: ({ beads }) => `TOTAL ${beads}`,
      quantity: "CANTIDAD",
    };
    const pdf = decode(encodeBeadPdf(grid, "Hama", { width: 29, height: 17 }, true, { labels }));
    expect(pdf).toContain("(Hama - VISTA)");
    expect(pdf).toContain("(PLACA 4 DE 4)");
    expect(pdf).toContain("(TOTAL 1)");
    expect(pdf).toContain("(CANTIDAD)");
    expect(pdf).not.toContain("overview");
  });
  it("draws non-ASCII labels as vector runs instead of question marks", () => {
    const labels: BeadDocumentLabels = { ...ENGLISH_BEAD_LABELS, quantity: "Количество" };
    const withRaster = decode(
      encodeBeadPdf(grid, "Hama", { width: 29, height: 29 }, false, {
        labels,
        rasterText: fakeRasterText,
      }),
    );
    expect(withRaster).not.toContain("(??????????)");
    expect(withRaster).toMatch(/0 0 0 rg [\d.]+ [\d.]+ [\d.]+ 0\.25 re f/);
    const withoutRaster = decode(
      encodeBeadPdf(grid, "Hama", { width: 29, height: 29 }, false, { labels }),
    );
    expect(withoutRaster).toContain("(??????????)");
  });
  it("produces identical bytes asynchronously while reporting monotonic progress", async () => {
    const options = { labels: ENGLISH_BEAD_LABELS };
    const size = { width: 4, height: 4 };
    const progress: number[] = [];
    let yields = 0;
    const bytes = await encodeBeadPdfAsync(grid, "Hama", size, true, {
      ...options,
      onProgress: (value) => progress.push(value),
      yieldToHost: async () => {
        yields++;
      },
    });
    expect(bytes).toEqual(encodeBeadPdf(grid, "Hama", size, true, options));
    expect(yields).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(1);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });
  it("rejects too many boards before rendering any page", async () => {
    const tiny = { width: 1, height: 1 };
    const large = mapBeadGrid(
      { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4) },
      colors,
    );
    let reason: unknown;
    try {
      encodeBeadPdf(large, "Hama", tiny, false);
    } catch (error) {
      reason = error;
    }
    expect(reason).toBeInstanceOf(BeadError);
    expect(beadErrorCode(reason)).toBe(BeadErrorCode.TooManyBoards);
    let rendered = false;
    await expect(
      encodeBeadPdfAsync(large, "Hama", tiny, false, {
        onProgress: () => {
          rendered = true;
        },
      }),
    ).rejects.toBeInstanceOf(BeadError);
    expect(rendered).toBe(false);
  });
});
