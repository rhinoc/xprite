import { describe, expect, test } from "vitest";

import {
  fitWarp,
  solveBanded,
  warpAt,
  warpInverse,
  warpPitch,
  type WarpEdge,
} from "$/import-export/image/import/grid-warp";

const MIN_PITCH = 2;

/** Cut positions of `cells` cells whose size follows `size(t)` for t in [0, 1), rounded to pixels. */
function cuts(cells: number, size: (t: number) => number): number[] {
  const positions = [0];
  for (let i = 0; i < cells; i++) positions.push(positions[i] + size(i / cells));
  return positions.map(Math.round);
}

/** Every cut except those a flat run hides: a fixed, irregular pattern drops about half. */
function visibleEdges(positions: readonly number[]): WarpEdge[] {
  return positions
    .filter((_, i) => i === 0 || i === positions.length - 1 || (i * 7919) % 11 < 6)
    .map((position) => ({ position, weight: 1 }));
}

function expectLabelled(positions: readonly number[], length: number, proposed: number) {
  const warp = fitWarp(visibleEdges(positions), length, proposed, MIN_PITCH, true);
  expect(warp).not.toBeNull();
  if (!warp) return;
  for (let index = 0; index < positions.length; index++)
    expect(Math.abs(warpAt(warp, positions[index]) - index)).toBeLessThan(0.5);
}

describe("warped lattice", () => {
  test("labels a fractional lattice whose cells alternate between 2 and 3 pixels", () => {
    const positions = cuts(60, () => 2.43);
    expectLabelled(positions, positions[positions.length - 1], 2.43);
  });
  test("labels a lattice whose cell size drifts by 12%", () => {
    const positions = cuts(80, (t) => 4.3 * (1 + 0.12 * Math.sin(2 * Math.PI * t * 1.3)));
    expectLabelled(positions, positions[positions.length - 1], 4.3);
  });
  test("recovers the local pitch and inverts the warp", () => {
    const positions = cuts(50, () => 5.5);
    const length = positions[positions.length - 1];
    const warp = fitWarp(visibleEdges(positions), length, 5.5, MIN_PITCH, true);
    expect(warp).not.toBeNull();
    if (!warp) return;
    expect(warpPitch(warp, length / 2)).toBeCloseTo(5.5, 1);
    expect(warpInverse(warp, 20, 0, length)).toBeCloseTo(110, 0);
    expect(warpInverse(warp, 80, 0, length)).toBeNaN();
  });
  test("needs at least three edges", () => {
    expect(
      fitWarp(
        [
          { position: 0, weight: 1 },
          { position: 4, weight: 1 },
        ],
        8,
        4,
        MIN_PITCH,
        true,
      ),
    ).toBeNull();
  });
  test("the banded solver matches a dense solve", () => {
    const n = 7;
    const diag = Float64Array.from({ length: n }, (_, i) => 6 + i);
    const off1 = Float64Array.from({ length: n }, (_, i) => -2 + 0.1 * i);
    const off2 = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.05 * i);
    const expected = Float64Array.from({ length: n }, (_, i) => i - 3);
    const at = (r: number, c: number) => {
      const d = Math.abs(r - c),
        low = Math.min(r, c);
      return d === 0 ? diag[r] : d === 1 ? off1[low] : d === 2 ? off2[low] : 0;
    };
    const rhs = Float64Array.from({ length: n }, (_, r) =>
      expected.reduce((sum, value, c) => sum + at(r, c) * value, 0),
    );
    const solved = solveBanded(diag, off1, off2, rhs);
    for (let i = 0; i < n; i++) expect(solved[i]).toBeCloseTo(expected[i], 9);
  });
});
