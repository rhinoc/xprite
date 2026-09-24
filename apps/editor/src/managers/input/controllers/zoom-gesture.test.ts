import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { CanvasZoomGesture } from "$/managers/input/controllers/zoom-gesture";

describe("zoom tool gestures", () => {
  it("defers a primary or secondary click to release", () => {
    const primary = new CanvasZoomGesture({ x: 20, y: 20 }, 1, 0);
    assert.equal(primary.move({ x: 24, y: 24 }), null);
    assert.equal(primary.finish({ x: 24, y: 24 }), 2);
    const secondary = new CanvasZoomGesture({ x: 20, y: 20 }, 1, 2);
    assert.equal(secondary.finish({ x: 20, y: 20 }), 0.5);
  });

  it("uses the starting zoom and horizontal displacement after activation", () => {
    const gesture = new CanvasZoomGesture({ x: 20, y: 20 }, 1, 0);
    assert.equal(gesture.move({ x: 28, y: 20 }), null);
    assert.equal(gesture.move({ x: 37, y: 20 }), 3);
    assert.equal(gesture.move({ x: 12, y: 20 }), 0.5);
    assert.equal(gesture.finish({ x: 20, y: 20 }), 1);
  });

  it("vertical movement activates dragging without adding a click step", () => {
    const gesture = new CanvasZoomGesture({ x: 20, y: 20 }, 1, 0);
    assert.equal(gesture.move({ x: 20, y: 29 }), 1);
    assert.equal(gesture.finish({ x: 20, y: 20 }), 1);
  });
});
