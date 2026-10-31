import { beforeEach, describe, expect, test, vi } from "vitest";

import type { PixelBuffer, Rgba } from "$/base/primitives";
import { recoverGrid } from "$/import-export/image/import/grid-sample";
import { samplePixelation } from "$/import-export/image/import/sampling";
import {
  CellColorPicker,
  PixelationMethod,
  type PixelGridGeometry,
} from "$/import-export/image/import/types";

vi.mock("$/import-export/image/import/sampling", () => ({ samplePixelation: vi.fn() }));

const RED: Rgba = [160, 0, 0, 255];
const BLUE: Rgba = [0, 0, 160, 255];
const CLEAR: Rgba = [255, 255, 255, 0];
const TRANSLUCENT_RED: Rgba = [160, 0, 0, 1];

function pixels(width: number, colors: readonly Rgba[]): PixelBuffer {
  return {
    width,
    height: colors.length / width,
    data: new Uint8ClampedArray(colors.flat()),
  };
}

function dual(
  input: PixelBuffer,
  cutsX: readonly number[],
  cutsY: readonly number[],
  structure: PixelBuffer,
  twoStage: PixelBuffer,
): PixelBuffer {
  vi.mocked(samplePixelation).mockImplementation((_image, _width, _height, method) =>
    method === PixelationMethod.Structure ? structure : twoStage,
  );
  const grid: PixelGridGeometry = {
    width: cutsX.length - 1,
    height: cutsY.length - 1,
    cellWidth: input.width / (cutsX.length - 1),
    cellHeight: input.height / (cutsY.length - 1),
    offsetX: 0,
    offsetY: 0,
    cutsX,
    cutsY,
  };
  return recoverGrid(input, grid, CellColorPicker.DualRtTwoStage);
}

describe("Dual RT cell lookup", () => {
  beforeEach(() => vi.clearAllMocks());

  test("fractional cuts classify integer positions without rounding the boundary down", () => {
    const structure = pixels(2, [RED, RED]);
    const twoStage = pixels(2, [RED, BLUE]);
    expect(dual(pixels(3, [RED, RED, BLUE]), [0, 1.2, 3], [0, 1], structure, twoStage)).toBe(
      twoStage,
    );
  });

  test("the same half-open membership applies to rows and exact boundaries", () => {
    const structure = pixels(1, [RED, RED]);
    const twoStage = pixels(1, [RED, BLUE]);
    expect(dual(pixels(1, [RED, RED, BLUE]), [0, 1], [0, 1.2, 3], structure, twoStage)).toBe(
      twoStage,
    );
    expect(dual(pixels(1, [RED, BLUE]), [0, 1], [0, 1, 2], structure, twoStage)).toBe(twoStage);
  });

  test("positions outside the cuts retain the original fallback to cell zero", () => {
    const structure = pixels(2, [BLUE, BLUE]);
    const twoStage = pixels(2, [BLUE, RED]);
    expect(
      dual(pixels(4, [BLUE, BLUE, RED, BLUE]), [0.2, 1.5, 2.8], [0, 1], structure, twoStage),
    ).toBe(twoStage);
  });

  test("zero-width intervals are skipped without shifting later cell indices", () => {
    const structure = pixels(3, [RED, RED, RED]);
    const twoStage = pixels(3, [RED, RED, BLUE]);
    expect(dual(pixels(3, [RED, BLUE, BLUE]), [0, 1, 1, 3], [0, 1], structure, twoStage)).toBe(
      twoStage,
    );
  });

  test("clear pixels do not vote and nonzero alpha participates", () => {
    const structure = pixels(2, [RED, BLUE]);
    const twoStage = pixels(2, [BLUE, RED]);
    expect(dual(pixels(2, [TRANSLUCENT_RED, CLEAR]), [0, 1, 2], [0, 1], structure, twoStage)).toBe(
      structure,
    );
    expect(dual(pixels(2, [CLEAR, TRANSLUCENT_RED]), [0, 1, 2], [0, 1], structure, twoStage)).toBe(
      twoStage,
    );
  });

  test("RGB error is not weighted by nonzero alpha", () => {
    const structure = pixels(3, [RED, RED, RED]);
    const twoStage = pixels(3, [BLUE, BLUE, BLUE]);
    expect(
      dual(
        pixels(3, [TRANSLUCENT_RED, TRANSLUCENT_RED, BLUE]),
        [0, 1, 2, 3],
        [0, 1],
        structure,
        twoStage,
      ),
    ).toBe(structure);
  });

  test("ties, including an entirely transparent image, keep Structure", () => {
    const structure = pixels(2, [RED, BLUE]);
    const twoStage = pixels(2, [BLUE, RED]);
    expect(dual(pixels(2, [RED, RED]), [0, 1, 2], [0, 1], structure, twoStage)).toBe(structure);
    expect(dual(pixels(2, [CLEAR, CLEAR]), [0, 1, 2], [0, 1], structure, twoStage)).toBe(structure);
  });
});
