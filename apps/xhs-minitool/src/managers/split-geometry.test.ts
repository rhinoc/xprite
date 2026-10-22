import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  Corner,
  DEFAULT_SPLIT,
  knobAngle,
  labelCorners,
  movedPosition,
  normalizeAngle,
  positionThrough,
  rotateSplit,
  snapAngle,
  splitHandle,
  splitSegment,
  splitShape,
  SplitLine,
  type SplitState,
} from "$/managers/split-geometry";

const rect = { x: 0, y: 0, width: 300, height: 400 };
const placement = { x: 0, y: 0, cell: 10, columns: 30, rows: 40 };
const split = (patch: Partial<SplitState> = {}): SplitState => ({ ...DEFAULT_SPLIT, ...patch });
const near = (actual: number, expected: number, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≉ ${expected}`);

describe("split geometry", () => {
  it("starts as a vertical line through the centre with stepped edges", () => {
    assert.equal(DEFAULT_SPLIT.angle, 0);
    assert.equal(DEFAULT_SPLIT.position, 0.5);
    assert.equal(DEFAULT_SPLIT.line, SplitLine.Steps);
    assert.equal(DEFAULT_SPLIT.labels, false);
    const segment = splitSegment(DEFAULT_SPLIT, rect);
    assert.ok(segment);
    near(segment[0].x, 150);
    near(segment[0].y, 0);
    near(segment[1].x, 150);
    near(segment[1].y, 400);
    const handle = splitHandle(DEFAULT_SPLIT, rect);
    near(handle.x, 150);
    near(handle.y, 200);
  });

  it("moves along the normal and stays inside the picture", () => {
    near(movedPosition(split(), { x: 75, y: 0 }, rect), 0.75);
    near(movedPosition(split(), { x: 0, y: 75 }, rect), 0.5);
    assert.equal(movedPosition(split(), { x: -900, y: 0 }, rect), 0);
    assert.equal(movedPosition(split(), { x: 900, y: 0 }, rect), 1);
  });

  it("finds the position that puts a line through a point", () => {
    const point = { x: 100, y: 120 };
    for (const angle of [-60, 0, 30, 45, 90]) {
      const position = positionThrough(angle, point, rect);
      const segment = splitSegment({ angle, position }, rect);
      assert.ok(segment);
      const [a, b] = segment;
      const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
      near(cross / Math.hypot(b.x - a.x, b.y - a.y), 0, 1e-6);
    }
  });

  it("wraps angles past ±90° and swaps sides to keep each picture in place", () => {
    assert.deepEqual(normalizeAngle(45), { angle: 45, flipped: false });
    assert.deepEqual(normalizeAngle(120), { angle: -60, flipped: true });
    assert.deepEqual(normalizeAngle(-135), { angle: 45, flipped: true });
    assert.deepEqual(normalizeAngle(-90), { angle: -90, flipped: false });
    assert.deepEqual(normalizeAngle(-270), { angle: 90, flipped: false });
  });

  it("snaps to the chip angles", () => {
    assert.equal(snapAngle(43.2), 45);
    assert.equal(snapAngle(-2), 0);
    assert.equal(snapAngle(88), 90);
    assert.equal(snapAngle(30.4), 30);
  });

  it("rotates about the handle and follows the knob", () => {
    const pivot = splitHandle(split({ position: 0.3 }), rect);
    const rotated = rotateSplit(split({ position: 0.3 }), 30, pivot, rect);
    assert.equal(rotated.angle, 30);
    near(splitHandle(rotated, rect).x, pivot.x, 60);
    const through = positionThrough(30, pivot, rect);
    near(rotated.position, through);
    // Knob straight above the pivot is 0°; to the upper left is counter-clockwise (positive).
    near(knobAngle({ x: 0, y: 0 }, { x: 0, y: -10 }, 1), 0);
    near(knobAngle({ x: 0, y: 0 }, { x: -10, y: -10 }, 1), 45);
    near(knobAngle({ x: 0, y: 0 }, { x: 10, y: -10 }, 1), -45);
    near(knobAngle({ x: 0, y: 0 }, { x: -10, y: 10 }, -1), -45);
  });

  it("puts the pixelated side right of a vertical line unless swapped", () => {
    assert.deepEqual(labelCorners(split(), rect), {
      original: Corner.BottomLeft,
      pixels: Corner.BottomRight,
    });
    assert.deepEqual(labelCorners(split({ swapped: true }), rect), {
      original: Corner.BottomRight,
      pixels: Corner.BottomLeft,
    });
  });

  it("steps the divider along block edges", () => {
    const shape = splitShape(split({ angle: 30 }), rect, placement);
    assert.equal(shape.line.length, 2 * placement.rows);
    for (const point of shape.line) {
      assert.equal(point.x % placement.cell, 0);
      assert.equal(point.y % placement.cell, 0);
    }
    for (let index = 0; index < shape.line.length; index += 2) {
      assert.equal(shape.line[index].x, shape.line[index + 1].x);
    }
    const flat = splitShape(split({ angle: 80 }), rect, placement);
    assert.equal(flat.line.length, 2 * placement.columns);
    const straight = splitShape(split({ line: SplitLine.Thin }), rect, placement);
    assert.equal(straight.line.length, 2);
    assert.equal(straight.pixels.length, 4);
  });
});
