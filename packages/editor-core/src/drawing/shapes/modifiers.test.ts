import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { LibreSpriteTwoPointsController } from "$/drawing/shapes/modifiers";

describe("rectangle corner radius gesture", () => {
  it("freezes the rectangle during radius editing and consumes the release movement", () => {
    const controller = new LibreSpriteTwoPointsController({ x: 0, y: 0 }, false, {
      cornerRadius: 1,
    });
    controller.move({ x: 19, y: 15 });
    const frozen = controller.points.map((point) => ({ ...point }));
    controller.move({ x: 17, y: 14 }, { cornerRadius: true });
    assert.equal(controller.cornerRadius, 4);
    assert.deepEqual(controller.points, frozen);
    controller.move({ x: 18, y: 15 }, { cornerRadius: true });
    assert.equal(controller.cornerRadius, 2);
    controller.move({ x: 25, y: 25 });
    assert.deepEqual(controller.points, frozen);
    controller.move({ x: 26, y: 26 });
    assert.deepEqual(controller.points, [
      { x: 0, y: 0 },
      { x: 26, y: 26 },
    ]);
  });

  it("applies inward deltas in all four drag directions", () => {
    for (const dx of [-1, 1])
      for (const dy of [-1, 1]) {
        const controller = new LibreSpriteTwoPointsController({ x: 20, y: 20 }, false, {
          cornerRadius: 0,
        });
        const edge = { x: 20 + 12 * dx, y: 20 + 12 * dy };
        controller.move(edge);
        controller.move({ x: edge.x - 2 * dx, y: edge.y - dy }, { cornerRadius: true });
        assert.equal(controller.cornerRadius, 3);
      }
  });

  it("gives moving the origin precedence over radius and rotation", () => {
    const controller = new LibreSpriteTwoPointsController({ x: 0, y: 0 }, false, {
      cornerRadius: 3,
    });
    controller.move({ x: 12, y: 12 });
    controller.move({ x: 14, y: 15 }, { moveOrigin: true, cornerRadius: true, rotate: true });
    assert.deepEqual(controller.points, [
      { x: 2, y: 3 },
      { x: 14, y: 15 },
    ]);
    assert.equal(controller.cornerRadius, 3);
    assert.equal(controller.angle, 0);
  });

  it("caps an oversized saved radius only when editing and leaves unsupported tools unchanged", () => {
    const rectangle = new LibreSpriteTwoPointsController({ x: 0, y: 0 }, false, {
      cornerRadius: 80,
    });
    rectangle.move({ x: 7, y: 7 });
    assert.equal(rectangle.cornerRadius, 80);
    rectangle.move({ x: 6, y: 6 }, { cornerRadius: true });
    assert.equal(rectangle.cornerRadius, 4);
    const line = new LibreSpriteTwoPointsController({ x: 0, y: 0 }, true);
    line.move({ x: 10, y: 5 }, { cornerRadius: true });
    assert.deepEqual(line.points, [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
    ]);
  });
});
