import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { CanvasBrushSizeDrag } from "$/managers/input/controllers/brush-size-drag";

describe("brush size drag projection", () => {
  it("changes one size unit per four GUI pixels and keeps its initial anchor", () => {
    const drag = new CanvasBrushSizeDrag({ x: 20, y: 20 }, 5, [{ x: 4, y: 0 }]);
    assert.equal(drag.move({ x: 32, y: 20 }), 8);
    assert.equal(drag.move({ x: 16, y: 20 }), 4);
    assert.equal(drag.move({ x: 20, y: 20 }), 5);
  });

  it("projects onto an upward custom direction and clamps without losing the origin", () => {
    const drag = new CanvasBrushSizeDrag({ x: 20, y: 20 }, 5, [{ x: 0, y: 2 }]);
    assert.equal(drag.move({ x: 100, y: 14 }), 8);
    assert.equal(drag.move({ x: 20, y: -200 }), 64);
    assert.equal(drag.move({ x: 20, y: 500 }), 1);
    assert.equal(drag.move({ x: 20, y: 20 }), 5);
  });
});
