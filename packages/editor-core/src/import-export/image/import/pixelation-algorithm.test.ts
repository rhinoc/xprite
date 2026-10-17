import { describe, expect, test } from "vitest";

import { PixelBuffer } from "$/base/primitives";
import { detectEdgeBasedGrid } from "$/import-export/image/import/edge-based-grid";
import { detectPixelGrid } from "$/import-export/image/import/grid";
import { detectWithAlgorithm } from "$/import-export/image/import/pixelation-algorithm-registry";
import { PixelationAlgorithm } from "$/import-export/image/import/types";

function createCheckerboard(cellSize: number, cells: number): PixelBuffer {
  const width = cellSize * cells;
  const height = cellSize * cells;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cellX = Math.floor(x / cellSize);
      const cellY = Math.floor(y / cellSize);
      const isBlack = (cellX + cellY) % 2 === 0;
      const offset = (y * width + x) * 4;
      const value = isBlack ? 0 : 255;
      data[offset + 0] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

function upscaleBilinear(source: PixelBuffer, scale: number): PixelBuffer {
  const width = source.width * scale;
  const height = source.height * scale;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x / scale;
      const sy = y / scale;
      const sx0 = Math.floor(sx);
      const sy0 = Math.floor(sy);
      const sx1 = Math.min(source.width - 1, sx0 + 1);
      const sy1 = Math.min(source.height - 1, sy0 + 1);
      const fx = sx - sx0;
      const fy = sy - sy0;

      const offset00 = (sy0 * source.width + sx0) * 4;
      const offset10 = (sy0 * source.width + sx1) * 4;
      const offset01 = (sy1 * source.width + sx0) * 4;
      const offset11 = (sy1 * source.width + sx1) * 4;

      const targetOffset = (y * width + x) * 4;

      for (let c = 0; c < 4; c++) {
        const c00 = source.data[offset00 + c];
        const c10 = source.data[offset10 + c];
        const c01 = source.data[offset01 + c];
        const c11 = source.data[offset11 + c];
        const top = c00 * (1 - fx) + c10 * fx;
        const bottom = c01 * (1 - fx) + c11 * fx;
        data[targetOffset + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }

  return { width, height, data };
}

function createGradient(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data[offset + 0] = Math.floor((x / width) * 255);
      data[offset + 1] = Math.floor((y / height) * 255);
      data[offset + 2] = 128;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

describe("Pixelation Algorithm - Uniform Grid Detector", () => {
  test("Clean checkerboard 16x should detect grid", () => {
    const checkerboard = createCheckerboard(16, 32);
    const result = detectPixelGrid(checkerboard);

    expect(result.reliable).toBe(true);
    expect(result.cellWidth).toBeCloseTo(16, 1);
    expect(result.cellHeight).toBeCloseTo(16, 1);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  test("Bilinear blur reduces uniformity", () => {
    const checkerboard = createCheckerboard(8, 32);
    const blurred = upscaleBilinear(checkerboard, 2);
    const result = detectPixelGrid(blurred);

    expect(result.confidence).toBeLessThan(1.0);
  });

  test("Gradient should have lower confidence than checkerboard", () => {
    const gradient = createGradient(512, 512);
    const result = detectPixelGrid(gradient);

    const checkerboard = createCheckerboard(16, 32);
    const checkerResult = detectPixelGrid(checkerboard);

    expect(result.confidence).toBeLessThan(checkerResult.confidence);
  });
});

describe("Pixelation Algorithm - Auto Selection", () => {
  test("Auto should return a reliable result for checkerboard", () => {
    const checkerboard = createCheckerboard(16, 32);
    const result = detectWithAlgorithm(checkerboard, PixelationAlgorithm.Auto);

    expect(result.reliable).toBe(true);
    expect(result.cellWidth).toBeGreaterThanOrEqual(14);
    expect(result.cellWidth).toBeLessThanOrEqual(18);
  });

  test("Auto should work on gradient (even if confidence is lower)", () => {
    const gradient = createGradient(512, 512);
    const result = detectWithAlgorithm(gradient, PixelationAlgorithm.Auto);

    expect(result).toBeDefined();
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});

describe("Pixelation Algorithm - Registry Integration", () => {
  test("All algorithms should be available in registry", () => {
    const checkerboard = createCheckerboard(16, 32);

    const autoResult = detectWithAlgorithm(checkerboard, PixelationAlgorithm.Auto);
    const uniformResult = detectWithAlgorithm(checkerboard, PixelationAlgorithm.UniformGrid);
    const edgeResult = detectWithAlgorithm(checkerboard, PixelationAlgorithm.EdgeGrid);
    const resizeResult = detectWithAlgorithm(checkerboard, PixelationAlgorithm.Resize);

    expect(autoResult).toBeDefined();
    expect(uniformResult).toBeDefined();
    expect(edgeResult).toBeDefined();
    expect(resizeResult).toBeDefined();

    expect(resizeResult.width).toBe(1);
    expect(resizeResult.height).toBe(1);
    expect(resizeResult.reliable).toBe(false);
  });

  test("Auto selects the detector with highest confidence among reliable results", () => {
    const checkerboard = createCheckerboard(16, 32);

    const autoResult = detectWithAlgorithm(checkerboard, PixelationAlgorithm.Auto);
    const uniformResult = detectPixelGrid(checkerboard);
    const edgeResult = detectEdgeBasedGrid(checkerboard);

    const reliableResults = [uniformResult, edgeResult].filter((r) => r.reliable);

    if (reliableResults.length > 0) {
      const bestManual = reliableResults.reduce((a, b) => (a.confidence >= b.confidence ? a : b));

      expect(autoResult.confidence).toBeGreaterThanOrEqual(bestManual.confidence * 0.99);
    }
  });
});
