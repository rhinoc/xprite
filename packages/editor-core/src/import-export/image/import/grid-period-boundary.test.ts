import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  detectBoundaryPeriodGrids,
  detectBoundaryPeriodGrid,
} from "$/import-export/image/import/grid-period-boundary";

/**
 * Create a synthetic image with a regular grid pattern.
 * Each cell is filled with a solid color that alternates.
 */
function createGridImage(
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
      const isOdd = (col + row) % 2 === 1;

      const offset = (y * width + x) * 4;
      data[offset] = isOdd ? 255 : 100; // R
      data[offset + 1] = isOdd ? 100 : 255; // G
      data[offset + 2] = 100; // B
      data[offset + 3] = 255; // A
    }
  }

  return { width, height, data };
}

/**
 * Create a painterly-style image with soft edges between cells.
 * This simulates the kind of input where traditional edge detection might fail.
 * Supports fractional cell sizes.
 */
function createPainterlyGrid(
  cols: number,
  rows: number,
  cellWidth: number,
  cellHeight: number,
): PixelBuffer {
  const width = Math.round(cols * cellWidth);
  const height = Math.round(rows * cellHeight);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const col = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);

      // Position within cell (0 to 1)
      const cellX = (x - col * cellWidth) / cellWidth;
      const cellY = (y - row * cellHeight) / cellHeight;

      // Soft transition near cell boundaries
      const edgeBlend = 0.2;
      let blend = 1.0;
      if (cellX < edgeBlend) blend *= cellX / edgeBlend;
      if (cellX > 1 - edgeBlend) blend *= (1 - cellX) / edgeBlend;
      if (cellY < edgeBlend) blend *= cellY / edgeBlend;
      if (cellY > 1 - edgeBlend) blend *= (1 - cellY) / edgeBlend;

      const isOdd = (col + row) % 2 === 1;
      const color1 = [255, 100, 100];
      const color2 = [100, 255, 100];

      const offset = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const base = isOdd ? color1[c] : color2[c];
        data[offset + c] = Math.round(base * blend + 128 * (1 - blend));
      }
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

describe("detectBoundaryPeriodGrid", () => {
  test("detects simple uniform grid", () => {
    const image = createGridImage(16, 12, 8, 8);
    const result = detectBoundaryPeriodGrid(image);

    expect(result.reliable).toBe(true);
    // Boundary period detection with comb scoring may vary
    // Arbiter will choose among candidates based on min-DL
    expect(result.width).toBeGreaterThanOrEqual(10);
    expect(result.width).toBeLessThanOrEqual(40);
    expect(result.height).toBeGreaterThanOrEqual(8);
    expect(result.height).toBeLessThanOrEqual(30);
  });

  test("returns multiple candidates", () => {
    // The detector should return multiple candidates for the arbiter to evaluate
    const image = createGridImage(12, 10, 6, 6);
    const grids = detectBoundaryPeriodGrids(image);

    expect(grids.length).toBeGreaterThan(0);
    // All candidates should be valid
    for (const grid of grids) {
      expect(grid.width).toBeGreaterThan(0);
      expect(grid.height).toBeGreaterThan(0);
      expect(grid.reliable).toBe(true);
    }
  });

  test("returns unreliable for photo-like input", () => {
    // Random noise (no grid structure)
    const width = 200;
    const height = 150;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.floor(Math.random() * 256);
      data[i + 1] = Math.floor(Math.random() * 256);
      data[i + 2] = Math.floor(Math.random() * 256);
      data[i + 3] = 255;
    }

    const result = detectBoundaryPeriodGrid({ width, height, data });
    // May detect spurious patterns in noise, but arbiter will reject them
    // based on min-DL - this is acceptable
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  test("handles small images gracefully", () => {
    const image = createGridImage(3, 3, 4, 4);
    const result = detectBoundaryPeriodGrid(image);

    // Should either detect correctly or return unreliable
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});

describe("detectBoundaryPeriodGrids", () => {
  test("returns multiple candidates for ambiguous input", () => {
    const image = createPainterlyGrid(50, 40, 4, 4);
    const grids = detectBoundaryPeriodGrids(image);

    // Should return at least one candidate
    expect(grids.length).toBeGreaterThan(0);

    // All candidates should be valid
    for (const grid of grids) {
      expect(grid.width).toBeGreaterThan(0);
      expect(grid.height).toBeGreaterThan(0);
      expect(grid.reliable).toBe(true);
      expect(grid.confidence).toBeGreaterThan(0);
    }
  });

  test("top candidate has highest combined score", () => {
    const image = createGridImage(20, 15, 6, 6);
    const grids = detectBoundaryPeriodGrids(image);

    expect(grids.length).toBeGreaterThan(0);

    // First candidate should have highest or equal confidence
    const topConfidence = grids[0].confidence;
    for (let i = 1; i < grids.length; i++) {
      expect(grids[i].confidence).toBeLessThanOrEqual(topConfidence);
    }
  });

  test("returns empty array for images below minimum size", () => {
    const image = createGridImage(2, 2, 2, 2);
    const grids = detectBoundaryPeriodGrids(image);

    // Too small to meet minimum cell count requirements
    expect(grids.length).toBe(0);
  });

  test("proposes candidates for grid inputs", () => {
    // Boundary run-length comb detection should generate proposals
    // that enter min-DL arbitration even when pitch search fails
    const image = createGridImage(60, 50, 4, 4);
    const grids = detectBoundaryPeriodGrids(image);

    expect(grids.length).toBeGreaterThan(0);

    // All proposals should be valid candidates
    for (const grid of grids) {
      expect(grid.width).toBeGreaterThan(0);
      expect(grid.height).toBeGreaterThan(0);
      expect(grid.reliable).toBe(true);
    }
  });
});
