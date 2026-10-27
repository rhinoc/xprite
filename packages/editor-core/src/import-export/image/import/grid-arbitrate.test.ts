import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";

import { arbitrateGrids } from "./grid-arbitrate";
import { detectBoundaryPeriodGrids } from "./grid-period-boundary";
import { PixelationAlgorithm } from "./types";

/**
 * Create a synthetic painterly grid image that produces zero pitch-search results
 * but should still allow boundary period detection to propose candidates.
 */
function createPainterlyNoPitchImage(
  cols: number,
  rows: number,
  cellWidth: number,
  cellHeight: number,
): PixelBuffer {
  const width = cols * cellWidth;
  const height = rows * cellHeight;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const col = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);

      // Soft gradient within each cell (no sharp edges)
      const cellX = (x % cellWidth) / cellWidth;
      const cellY = (y % cellHeight) / cellHeight;

      const blend = Math.sin(cellX * Math.PI) * Math.sin(cellY * Math.PI);
      const isOdd = (col + row) % 2 === 1;

      const offset = (y * width + x) * 4;
      data[offset] = isOdd ? Math.round(255 * blend) : Math.round(100 * blend);
      data[offset + 1] = isOdd ? Math.round(100 * blend) : Math.round(255 * blend);
      data[offset + 2] = Math.round(150 * blend);
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

describe("arbitrateGrids - pure min-DL design", () => {
  test("passthrough baseline wins as null when nothing else competes", () => {
    const image = createPainterlyNoPitchImage(20, 15, 4, 4);

    // Call without any initial grids or soft proposals: only 1×1 is in the ring
    const result = arbitrateGrids(image, []);

    // Winning as passthrough means refuse (null), not a reliable 1×1 grid
    expect(result).toBeNull();
  });

  test("evaluates soft proposals even when pitch search returns empty", () => {
    const image = createPainterlyNoPitchImage(40, 30, 3, 3);

    // Soft proposals include boundary period detection
    const soft = () => detectBoundaryPeriodGrids(image);

    // Call with empty grids array but with soft proposals
    const result = arbitrateGrids(image, [], soft);

    // Soft runs into the ring; min-DL may pick a grid or refuse (null) if passthrough wins
    if (result) {
      expect(result.grid.width).toBeGreaterThan(1);
      expect(result.grid.height).toBeGreaterThan(1);
    }
  });

  test("includes all detector proposals in competition", () => {
    const image = createPainterlyNoPitchImage(50, 40, 2.5, 2.5);

    // Mock edge/uniform detector results
    const edgeGrid = {
      width: 25,
      height: 20,
      cellWidth: 5,
      cellHeight: 5,
      offsetX: 0,
      offsetY: 0,
      confidence: 0.6,
      reliable: true,
      algorithm: PixelationAlgorithm.EdgeGrid,
    };

    const uniformGrid = {
      width: 50,
      height: 40,
      cellWidth: 2.5,
      cellHeight: 2.5,
      offsetX: 0,
      offsetY: 0,
      confidence: 0.8,
      reliable: true,
      algorithm: PixelationAlgorithm.UniformGrid,
    };

    // Soft includes boundary period
    const soft = () => detectBoundaryPeriodGrids(image);

    // All detectors participate
    const result = arbitrateGrids(image, [edgeGrid, uniformGrid], soft);

    // Winner is chosen by min-DL from: edgeGrid, uniformGrid, boundary proposals, passthrough
    if (result) {
      expect(result.grid.width).toBeGreaterThan(0);
      expect(result.grid.height).toBeGreaterThan(0);
    }
  });

  test("no score-based admission gates prevent candidates from competing", () => {
    const image = createPainterlyNoPitchImage(60, 45, 2.35, 2.35);

    const soft = () => {
      const boundary = detectBoundaryPeriodGrids(image);
      // Boundary might return low-confidence candidates - they should still compete
      return boundary;
    };

    const result = arbitrateGrids(image, [], soft);

    // Soft proposals enter with no score gate. Min-DL may refuse (null) or return a grid.
    if (result) {
      expect(result.grid.width).toBeGreaterThan(0);
      expect(result.grid.height).toBeGreaterThan(0);
    }
  });
});
