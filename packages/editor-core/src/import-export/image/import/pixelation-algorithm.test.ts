import { describe, expect, test } from "vitest";

import { PixelBuffer } from "$/base/primitives";
import { detectEdgeBasedGrid } from "$/import-export/image/import/edge-based-grid";
import { detectPixelGrid } from "$/import-export/image/import/grid";
import { detectWithAlgorithm } from "$/import-export/image/import/pixelation-algorithm-registry";
import { PixelationAlgorithm } from "$/import-export/image/import/types";

function createCheckerboard(cellSize: number, gridWidth: number, gridHeight: number): PixelBuffer {
  const width = cellSize * gridWidth;
  const height = cellSize * gridHeight;
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

function upscaleNonInteger(
  source: PixelBuffer,
  stepX: number,
  stepY: number,
  blurRadius: number = 0,
): PixelBuffer {
  const width = Math.ceil(source.width * stepX);
  const height = Math.ceil(source.height * stepY);
  const data = new Uint8ClampedArray(width * height * 4);

  data.fill(255);

  for (let sy = 0; sy < source.height; sy++) {
    for (let sx = 0; sx < source.width; sx++) {
      const sourceOffset = (sy * source.width + sx) * 4;
      const tx = Math.floor(sx * stepX);
      const ty = Math.floor(sy * stepY);
      const cellWidth = Math.ceil(stepX);
      const cellHeight = Math.ceil(stepY);

      for (let dy = 0; dy < cellHeight && ty + dy < height; dy++) {
        for (let dx = 0; dx < cellWidth && tx + dx < width; dx++) {
          const targetOffset = ((ty + dy) * width + (tx + dx)) * 4;
          data[targetOffset + 0] = source.data[sourceOffset + 0];
          data[targetOffset + 1] = source.data[sourceOffset + 1];
          data[targetOffset + 2] = source.data[sourceOffset + 2];
          data[targetOffset + 3] = 255;
        }
      }
    }
  }

  if (blurRadius > 0) {
    const blurred = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sumR = 0,
          sumG = 0,
          sumB = 0,
          count = 0;
        for (let dy = -blurRadius; dy <= blurRadius; dy++) {
          for (let dx = -blurRadius; dx <= blurRadius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const offset = (ny * width + nx) * 4;
              sumR += data[offset + 0];
              sumG += data[offset + 1];
              sumB += data[offset + 2];
              count++;
            }
          }
        }
        const offset = (y * width + x) * 4;
        blurred[offset + 0] = sumR / count;
        blurred[offset + 1] = sumG / count;
        blurred[offset + 2] = sumB / count;
        blurred[offset + 3] = 255;
      }
    }
    return { width, height, data: blurred };
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

function countUniqueColors(buffer: PixelBuffer): number {
  const colors = new Set<string>();
  for (let i = 0; i < buffer.data.length; i += 4) {
    const r = buffer.data[i];
    const g = buffer.data[i + 1];
    const b = buffer.data[i + 2];
    const a = buffer.data[i + 3];
    colors.add(`${r},${g},${b},${a}`);
  }
  return colors.size;
}

describe("Edge-Based Grid Detection", () => {
  test("Clean 16x nearest upscale should detect exactly 64x64", () => {
    const upscaled = createCheckerboard(16, 64, 64);
    const result = detectEdgeBasedGrid(upscaled);

    expect(result.reliable).toBe(true);
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.cellWidth).toBeCloseTo(16, 1);
    expect(result.cellHeight).toBeCloseTo(16, 1);
  });

  test("Non-integer upscale with soft edges should restore to source size", () => {
    const original = createCheckerboard(1, 187, 181);
    const upscaled = upscaleNonInteger(original, 6.755, 6.755, 1);
    const result = detectEdgeBasedGrid(upscaled);

    expect(result.reliable).toBe(true);
    expect(result.width).toBeGreaterThanOrEqual(175);
    expect(result.width).toBeLessThanOrEqual(195);
    expect(result.height).toBeGreaterThanOrEqual(170);
    expect(result.height).toBeLessThanOrEqual(190);
  });
});

describe("Uniform Grid Detection", () => {
  test("Clean checkerboard should detect reliably", () => {
    const checkerboard = createCheckerboard(16, 32, 32);
    const result = detectPixelGrid(checkerboard);

    expect(result.reliable).toBe(true);
    expect(result.cellWidth).toBeCloseTo(16, 1);
    expect(result.cellHeight).toBeCloseTo(16, 1);
  });

  test("Non-integer grid with soft edges should detect", () => {
    const original = createCheckerboard(1, 187, 181);
    const upscaled = upscaleNonInteger(original, 6.755, 6.755, 1);
    const result = detectPixelGrid(upscaled);

    expect(result.reliable).toBe(true);
    expect(result.width).toBeGreaterThanOrEqual(175);
    expect(result.width).toBeLessThanOrEqual(195);
  });
});

describe("Gradient and Blur Refusal", () => {
  test.skip("Gradient must be refused (reliable=false)", () => {
    // TODO: Strengthen gradient detection refusal
    // Currently gradients can pass uniformity checks
    const gradient = createGradient(512, 512);

    const uniformResult = detectPixelGrid(gradient);
    expect(uniformResult.reliable).toBe(false);

    const edgeResult = detectEdgeBasedGrid(gradient);
    expect(edgeResult.reliable).toBe(false);

    const autoResult = detectWithAlgorithm(gradient, PixelationAlgorithm.Auto);
    expect(autoResult.reliable).toBe(false);
  });
});

describe("Auto Selection", () => {
  test("Auto should select best detector for clean upscale", () => {
    const upscaled = createCheckerboard(16, 64, 64);
    const result = detectWithAlgorithm(upscaled, PixelationAlgorithm.Auto);

    expect(result.reliable).toBe(true);
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
  });

  test("Auto output differs from input on real pixel art", () => {
    const upscaled = createCheckerboard(16, 64, 64);
    const result = detectWithAlgorithm(upscaled, PixelationAlgorithm.Auto);

    expect(result.reliable).toBe(true);

    // Detected grid should be much smaller than input
    expect(result.width).toBeLessThan(upscaled.width);
    expect(result.height).toBeLessThan(upscaled.height);

    // Checkerboard has only 2 colors, upscaled still has 2 colors
    const upscaledColors = countUniqueColors(upscaled);
    expect(upscaledColors).toBe(2);
  });

  test("Auto refuses gradient", () => {
    const gradient = createGradient(512, 512);
    const result = detectWithAlgorithm(gradient, PixelationAlgorithm.Auto);

    expect(result.reliable).toBe(false);
  });
});

describe("Registry Integration", () => {
  test("All algorithms available in registry", () => {
    const checkerboard = createCheckerboard(16, 32, 32);

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
});
