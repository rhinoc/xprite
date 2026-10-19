import { describe, expect, it } from "vitest";

import {
  applyPixelationGrid,
  defaultPixelationSettings,
  pixelationSizeFromAxis,
} from "$/import-export/image/import/settings";
import { PixelationMode } from "$/import-export/image/import/types";

const image = { width: 200, height: 100 };
const grid = {
  width: 20,
  height: 10,
  cellWidth: 10,
  cellHeight: 10,
  offsetX: 0,
  offsetY: 0,
  confidence: 1,
  reliable: true,
};

describe("shared pixelation settings rules", () => {
  it("recovers a reliable grid and falls back to the plain convert otherwise", () => {
    const base = defaultPixelationSettings(image);
    expect(applyPixelationGrid(base, grid, image)).toMatchObject({
      mode: PixelationMode.RecoverGrid,
      autoGrid: true,
      gridCellWidth: 10,
      gridCellHeight: 10,
    });
    const recovered = applyPixelationGrid(base, grid, image);
    expect(applyPixelationGrid(recovered, { ...grid, reliable: false }, image).mode).toBe(
      PixelationMode.Convert,
    );
  });
  it("keeps the aspect ratio when one dimension is typed and rejects unusable text", () => {
    expect(pixelationSizeFromAxis("width", "40", image)).toEqual({ width: 40, height: 20 });
    expect(pixelationSizeFromAxis("height", "10", image)).toEqual({ width: 20, height: 10 });
    expect(pixelationSizeFromAxis("width", "0", image)).toBeNull();
    expect(pixelationSizeFromAxis("width", "abc", image)).toBeNull();
  });
});
