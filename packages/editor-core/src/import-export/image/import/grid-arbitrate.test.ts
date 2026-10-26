import { describe, expect, test } from "vitest";

import {
  ARBITER_FLOOR,
  arbitrateGrids,
  pitchSearchGrids,
  scoreHypothesis,
} from "$/import-export/image/import/grid-arbitrate";
import { MIN_PHASE_CONTRAST } from "$/import-export/image/import/grid-arbitrate";
import { detectMeshGrid } from "$/import-export/image/import/grid-detect";
import { searchGridPitches } from "$/import-export/image/import/grid-pitch-search";
import {
  boxBlur,
  detailedSprite,
  driftUpscale,
  gradient,
  mush,
  resampleBilinear,
  smoothPhoto,
  sprite,
  texturePhoto,
  upscaleNearest,
  vectorShapes,
} from "$/import-export/image/import/grid-test-images";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

const lattice = (width: number, height: number, pitch: number): PixelGridAnalysis => ({
  width: Math.round(width / pitch),
  height: Math.round(height / pitch),
  cellWidth: pitch,
  cellHeight: pitch,
  offsetX: 0,
  offsetY: 0,
  confidence: 1,
  reliable: true,
  algorithm: PixelationAlgorithm.UniformGrid,
});

describe("pitch search", () => {
  test.each([
    ["centred bilinear", resampleBilinear(sprite(32, 7), 6.5), 6.5],
    ["mush", mush(sprite(32, 13), 9.3), 9.3],
    ["blurred nearest", boxBlur(upscaleNearest(sprite(40, 3), 10), 2), 10],
  ])("proposes the pitch of a %s upscale", (_, image, pitch) => {
    const pitches = searchGridPitches(image).map((candidate) => candidate.pitch);
    expect(pitches.some((found) => Math.abs(found - pitch) / pitch < 0.05)).toBe(true);
  });
  test.each([
    ["gradient", gradient(512, 512)],
    ["textured photo", texturePhoto(512, 512)],
    ["blurred textured photo", boxBlur(texturePhoto(256, 256), 4)],
  ])("proposes nothing for a %s", (_, image) => {
    expect(searchGridPitches(image)).toEqual([]);
  });
});

describe("arbiter scoring", () => {
  test("the true lattice passes every gate", () => {
    const image = resampleBilinear(sprite(48, 7), 8);
    const scored = scoreHypothesis(image, lattice(image.width, image.height, 8));
    expect(scored.score).toBeGreaterThan(ARBITER_FLOOR);
    expect(scored.contrast).toBeGreaterThan(0.3);
  });
  test("a lattice on smooth content fails the phase null test even when its cells look flat", () => {
    const image = smoothPhoto(512, 512);
    const scored = scoreHypothesis(image, lattice(512, 512, 32));
    expect(scored.purity).toBeGreaterThan(0.9);
    expect(scored.contrast).toBeLessThan(0.15);
    expect(scored.score).toBe(0);
  });
  test("a low phase-contrast lattice is admitted to the ring and can compete on description length", () => {
    const image = resampleBilinear(sprite(32, 13), 8);
    const trueGrid = lattice(image.width, image.height, 8);
    const lowContrast: PixelGridAnalysis = {
      ...lattice(image.width, image.height, 9),
      confidence: 1,
    };
    const scored = scoreHypothesis(image, lowContrast);
    expect(scored.contrast).toBeLessThan(MIN_PHASE_CONTRAST);
    const winner = arbitrateGrids(image, [trueGrid, lowContrast]);
    expect(winner).not.toBeNull();
    expect(winner?.grid.cellWidth).toBeCloseTo(8, 0);
  });
  test("soft path admits candidates without quality gates and competes on DL", () => {
    const image = resampleBilinear(sprite(24, 7), 5);
    const winner = arbitrateGrids(image, [], () => []);
    expect(winner).not.toBeNull();
  });
  test("half a cell off the grid loses the phase contrast", () => {
    const image = resampleBilinear(sprite(32, 13), 12);
    const aligned = scoreHypothesis(image, lattice(image.width, image.height, 12));
    const shifted = scoreHypothesis(image, {
      ...lattice(image.width, image.height, 12),
      offsetX: 6,
      offsetY: 6,
    });
    expect(aligned.score).toBeGreaterThan(shifted.score);
  });
  test("smooth photos and gradients may produce coarse grids if they compress better than passthrough", () => {
    const smooth = arbitrateGrids(smoothPhoto(700, 500), [], () => []);
    const texture = arbitrateGrids(texturePhoto(400, 300, 8), [], () => []);
    expect(smooth === null || smooth.grid.width < 50).toBe(true);
    expect(texture === null || texture.grid.width < 50).toBe(true);
  });
  test("vector shapes may produce coarse grids if they compress better than passthrough", () => {
    const result = arbitrateGrids(vectorShapes(512, 512), [], () => []);
    expect(result === null || result.grid.width < 50).toBe(true);
  });
  test("the winner is the coarsest lattice the image supports", () => {
    const image = resampleBilinear(sprite(32, 29), 12);
    const winner = arbitrateGrids(image, [], () => []);
    expect(winner?.grid.width).toBe(32);
    expect(winner?.grid.height).toBe(32);
    expect(pitchSearchGrids(image).some((grid) => grid.width > 32)).toBe(true);
  });
});

describe("one scoring ring for every hypothesis", () => {
  test("a proposed grid that only spans pairs of cells loses to the true lattice", () => {
    const image = resampleBilinear(sprite(32, 7), 8);
    const coarse = { ...lattice(image.width, image.height, 16), confidence: 1 };
    const winner = arbitrateGrids(image, [coarse, ...pitchSearchGrids(image)]);
    expect([winner?.grid.width, winner?.grid.height]).toEqual([32, 32]);
  });
  test("a proposed grid whose cells span several real ones on one axis loses", () => {
    const image = resampleBilinear(sprite(36, 13), 8);
    const wrong: PixelGridAnalysis = {
      ...lattice(image.width, image.height, 8),
      height: 20,
      cellHeight: image.height / 20,
      confidence: 1,
    };
    const winner = arbitrateGrids(image, [wrong, ...pitchSearchGrids(image)]);
    expect([winner?.grid.width, winner?.grid.height]).toEqual([36, 36]);
  });
  test("a drifting mesh beats a coarse lattice whatever confidence either reports", () => {
    const image = driftUpscale(detailedSprite(120, 74, 3), 6.7, 0.25, 13);
    const mesh = { ...detectMeshGrid(image), algorithm: PixelationAlgorithm.EdgeGrid };
    const coarse = lattice(image.width, image.height, image.width / 51);
    for (const [meshConfidence, coarseConfidence] of [
      [0.3, 1],
      [1, 0.3],
    ]) {
      const winner = arbitrateGrids(image, [
        { ...mesh, confidence: meshConfidence },
        { ...coarse, confidence: coarseConfidence },
      ]);
      expect([winner?.grid.width, winner?.grid.height]).toEqual([120, 74]);
    }
  });
  test("a winning proposed grid is returned as proposed", () => {
    const image = upscaleNearest(sprite(40, 3), 8);
    const proposed = { ...lattice(image.width, image.height, 8), confidence: 0.42 };
    expect(arbitrateGrids(image, [proposed])?.grid).toBe(proposed);
  });
});
