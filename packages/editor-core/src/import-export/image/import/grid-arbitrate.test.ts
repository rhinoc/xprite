import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";

import { arbitrateGrids, gridEvidence, twinCuts } from "./grid-arbitrate";
import {
  gradient,
  mush,
  resampleBilinear,
  smoothPhoto,
  sprite,
  upscaleBilinear,
  upscaleNearest,
} from "./grid-test-images";
import { PixelationAlgorithm, type PixelGridAnalysis } from "./types";

const STRIDE = 4;
const OPAQUE_WHITE = 255;

const lattice = (image: PixelBuffer, pitch: number, offset = 0): PixelGridAnalysis => ({
  width: Math.round(image.width / pitch),
  height: Math.round(image.height / pitch),
  cellWidth: pitch,
  cellHeight: pitch,
  offsetX: offset,
  offsetY: offset,
  confidence: 0,
  reliable: false,
  algorithm: PixelationAlgorithm.UniformGrid,
});

/** A square grid given by its cuts, the same on both axes. */
const cutGrid = (cuts: number[]): PixelGridAnalysis => ({
  width: cuts.length - 1,
  height: cuts.length - 1,
  cellWidth: cuts[cuts.length - 1] / (cuts.length - 1),
  cellHeight: cuts[cuts.length - 1] / (cuts.length - 1),
  offsetX: 0,
  offsetY: 0,
  cutsX: cuts,
  cutsY: cuts,
  confidence: 0,
  reliable: false,
  algorithm: PixelationAlgorithm.UniformGrid,
});

/** Cuts every `pitch` pixels from `offset`, inside [0, length]. */
function latticeCuts(pitch: number, offset: number, length: number): number[] {
  const cuts = [0];
  for (let k = 0; ; k++) {
    const at = Math.round(offset + k * pitch);
    if (at >= length) break;
    if (at > 0) cuts.push(at);
  }
  cuts.push(length);
  return cuts;
}

/** The image inside a white border `margin` pixels wide. */
function framed(image: PixelBuffer, margin: number): PixelBuffer {
  const width = image.width + 2 * margin,
    height = image.height + 2 * margin;
  const data = new Uint8ClampedArray(width * height * STRIDE).fill(OPAQUE_WHITE);
  for (let y = 0; y < image.height; y++)
    data.set(
      image.data.subarray(y * image.width * STRIDE, (y + 1) * image.width * STRIDE),
      ((y + margin) * width + margin) * STRIDE,
    );
  return { width, height, data };
}

const octaves = (image: PixelBuffer, pitch: number) =>
  [pitch / 2, pitch, pitch * 2].map((p) => lattice(image, p));

const size = (image: PixelBuffer, grids: readonly PixelGridAnalysis[]) => {
  const result = arbitrateGrids(image, grids);
  return result && [result.grid.width, result.grid.height];
};

describe("twin cuts", () => {
  test("put one cut at each cell middle inside the same extent", () => {
    expect(twinCuts([0, 4, 8, 12])).toEqual([0, 2, 6, 10, 12]);
  });
});

describe("one score over every proposal and the passthrough", () => {
  test("refuses when nothing is proposed", () => {
    expect(arbitrateGrids(upscaleNearest(sprite(32), 4), [])).toBeNull();
  });

  test("a true lattice beats its finer and coarser octaves", () => {
    const image = upscaleNearest(sprite(32), 6);
    expect(size(image, octaves(image, 6))).toEqual([32, 32]);
  });

  test("a bilinear upscale is read at its own pitch, not at half of it", () => {
    const image = resampleBilinear(sprite(32), 12);
    expect(size(image, octaves(image, 12))).toEqual([32, 32]);
  });

  test("a corner-aligned bilinear upscale keeps its pitch, centred on its samples", () => {
    const image = upscaleBilinear(sprite(32), 12);
    const grids = [6, 12, 24].map((pitch) => cutGrid(latticeCuts(pitch, pitch / 2, image.width)));
    expect(size(image, grids)).toEqual([33, 33]);
  });

  test("a blurred, noisy upscale without edges keeps its pitch", () => {
    const image = mush(sprite(32), 12);
    expect(size(image, octaves(image, 12))).toEqual([32, 32]);
  });

  test("a frame around the content does not displace the grid it encloses", () => {
    const pitch = 8,
      cells = 24,
      margin = 3;
    const image = framed(upscaleNearest(sprite(cells), pitch), margin);
    const enclosing = [
      0,
      ...Array.from({ length: cells - 1 }, (_, k) => margin + (k + 1) * pitch),
      image.width,
    ];
    const finer = [pitch / 2, pitch / 3].map((p) => cutGrid(latticeCuts(p, margin, image.width)));
    expect(size(image, [cutGrid(enclosing), ...finer])).toEqual([cells, cells]);
  });

  test("the winner does not depend on the order of the proposals", () => {
    const image = upscaleNearest(sprite(40), 5);
    const grids = octaves(image, 5);
    expect(size(image, [...grids].reverse())).toEqual(size(image, grids));
  });

  test("snapping does not move the cuts of an exact lattice", () => {
    const image = upscaleNearest(sprite(32), 6);
    const result = arbitrateGrids(image, [lattice(image, 6)]);
    expect(result?.grid.cutsX).toEqual(latticeCuts(6, 0, image.width));
  });

  test("native pixel art passes through rather than taking an invented coarse grid", () => {
    const image = sprite(64);
    expect(size(image, [lattice(image, 2), lattice(image, 4)])).toBeNull();
  });

  test.each([
    ["a smooth photo", smoothPhoto(240, 180)],
    ["a gradient", gradient(240, 180)],
  ])("%s carries no phase evidence and passes through", (_, image) => {
    expect(
      size(
        image,
        [4, 6, 8].map((p) => lattice(image, p)),
      ),
    ).toBeNull();
  });

  test("a locked lattice describes the image markedly better than its twin", () => {
    const image = upscaleNearest(sprite(32), 6);
    const { readings, pixels } = gridEvidence(image, [lattice(image, 6)]);
    const [reading] = readings;
    expect(reading.twin).toBeGreaterThan(reading.length);
    expect(reading.length).toBeLessThan(pixels);
  });
});
