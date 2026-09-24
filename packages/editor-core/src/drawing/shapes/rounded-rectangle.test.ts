import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { roundedRectanglePixels } from "$/drawing/shapes/rounded-rectangle";

describe("rounded rectangle raster", () => {
  it("uses integer circular arcs rather than a distance cutoff", () => {
    const pixels = roundedRectanglePixels({ x: 0, y: 0 }, { x: 8, y: 8 }, 2, true);
    const top = [...new Set(pixels.filter((point) => point.y === 0).map((point) => point.x))].sort(
      (a, b) => a - b,
    );
    assert.deepEqual(top, [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(
      pixels.some((point) => point.x === 0 && point.y === 0),
      false,
    );
    assert.equal(
      pixels.some((point) => point.x === 4 && point.y === 4),
      true,
    );
  });

  it("preserves rounded bounds when the original shape extends outside the canvas", () => {
    const pixels = roundedRectanglePixels({ x: -4, y: -4 }, { x: 8, y: 8 }, 4, true);
    assert.equal(
      pixels.some((point) => point.x === 0 && point.y === 0),
      true,
    );
    assert.equal(
      pixels.some((point) => point.x === -4 && point.y === -4),
      false,
    );
  });

  it("caps even sized rectangles at half their inclusive short dimension", () => {
    const pixels = (radius: number) =>
      new Set(
        roundedRectanglePixels({ x: 0, y: 0 }, { x: 7, y: 7 }, radius, true).map(
          (point) => `${point.x},${point.y}`,
        ),
      );
    assert.deepEqual(pixels(999), pixels(4));
    assert.notDeepEqual(pixels(4), pixels(3));
  });

  it("keeps rounded outlines hollow and fills the rotated center", () => {
    const center = { x: 8, y: 8 };
    for (const angle of [0, Math.PI / 4, -Math.PI / 4]) {
      const pixels = (filled: boolean) =>
        roundedRectanglePixels({ x: 0, y: 0 }, { x: 16, y: 16 }, 3, filled, angle);
      const containsCenter = (filled: boolean) =>
        pixels(filled).some((point) => point.x === center.x && point.y === center.y);
      assert.equal(containsCenter(false), false);
      assert.equal(containsCenter(true), true);
    }
  });
});
