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

describe("silhouette alpha", () => {
  const SOFT_RED: Rgba = [160, 0, 0, 40];
  const cells: PixelGridGeometry = {
    width: 2,
    height: 1,
    cellWidth: 2,
    cellHeight: 2,
    offsetX: 0,
    offsetY: 0,
    cutsX: [0, 2, 4],
    cutsY: [0, 2],
  };

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import("$/import-export/image/import/sampling")>(
      "$/import-export/image/import/sampling",
    );
    vi.mocked(samplePixelation).mockImplementation(actual.samplePixelation);
  });

  test("a cell mostly covered by the art keeps the art's alpha", () => {
    const image = pixels(4, [RED, RED, RED, SOFT_RED, RED, SOFT_RED, CLEAR, CLEAR]);
    const out = recoverGrid(image, cells, CellColorPicker.Average);
    expect(out.data[3]).toBe(255);
  });

  test("a cell mostly outside the art is clear", () => {
    const image = pixels(4, [RED, CLEAR, RED, RED, SOFT_RED, CLEAR, RED, RED]);
    const out = recoverGrid(image, cells, CellColorPicker.TwoStage);
    expect(Array.from(out.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(out.data[7]).toBe(255);
  });

  test("a cell that is translucent throughout keeps its alpha", () => {
    const image = pixels(4, [SOFT_RED, SOFT_RED, RED, RED, SOFT_RED, SOFT_RED, RED, RED]);
    const out = recoverGrid(image, cells, CellColorPicker.Average);
    expect(out.data[3]).toBe(40);
  });

  test("almost opaque art becomes opaque", () => {
    const NEAR_RED: Rgba = [160, 0, 0, 252];
    const image = pixels(4, [
      NEAR_RED,
      NEAR_RED,
      NEAR_RED,
      NEAR_RED,
      NEAR_RED,
      NEAR_RED,
      CLEAR,
      CLEAR,
    ]);
    const out = recoverGrid(image, cells, CellColorPicker.Average);
    expect([out.data[3], out.data[7]]).toEqual([255, 255]);
  });

  test("translucent art keeps the alpha of its covered pixels", () => {
    const GLASS: Rgba = [160, 0, 0, 180];
    const image = pixels(4, [GLASS, GLASS, GLASS, GLASS, GLASS, CLEAR, GLASS, GLASS]);
    const out = recoverGrid(image, cells, CellColorPicker.Average);
    expect([out.data[3], out.data[7]]).toEqual([180, 180]);
  });
});
