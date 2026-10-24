import { describe, expect, test } from "vitest";

import {
  ARBITER_FLOOR,
  arbitrateGrids,
  challengeGrid,
  pitchSearchGrids,
  scoreHypothesis,
} from "$/import-export/image/import/grid-arbitrate";
import { searchGridPitches } from "$/import-export/image/import/grid-pitch-search";
import {
  boxBlur,
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
  test("photos, gradients and vector shapes yield no winner", () => {
    for (const image of [
      gradient(400, 300),
      texturePhoto(400, 300, 8),
      smoothPhoto(700, 500),
      vectorShapes(512, 512),
    ])
      expect(arbitrateGrids(image)).toBeNull();
  });
  test("the winner is the coarsest lattice the image supports", () => {
    const image = resampleBilinear(sprite(32, 29), 12);
    const winner = arbitrateGrids(image);
    expect(winner?.grid.width).toBe(32);
    expect(winner?.grid.height).toBe(32);
    expect(pitchSearchGrids(image).some((grid) => grid.width > 32)).toBe(true);
  });
});

describe("second opinion on an accepted grid", () => {
  test("keeps an incumbent the challenger would only subdivide", () => {
    const image = resampleBilinear(sprite(32, 7), 8);
    const coarse = {
      ...lattice(image.width, image.height, 16),
      confidence: 0.5,
    };
    expect(challengeGrid(image, coarse)).toBe(coarse);
  });
  test("replaces an incumbent whose cells span several real ones on one axis", () => {
    const image = resampleBilinear(sprite(36, 13), 8);
    const wrong: PixelGridAnalysis = {
      ...lattice(image.width, image.height, 8),
      height: 20,
      cellHeight: image.height / 20,
      confidence: 0.5,
    };
    const result = challengeGrid(image, wrong);
    expect([result.width, result.height]).toEqual([36, 36]);
  });
});
