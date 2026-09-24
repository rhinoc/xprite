import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { selectionCursorDirection } from "$/adapters/input/selection-cursor-direction";

describe("signed selection handle cursor directions", () => {
  it("retains resize cursors after crossing either opposite anchor", () => {
    assert.equal(selectionCursorDirection("se", 10, 10, 0), "se");
    assert.equal(selectionCursorDirection("se", -10, 10, 0), "sw");
    assert.equal(selectionCursorDirection("se", 10, -10, 0), "ne");
    assert.equal(selectionCursorDirection("s", 10, 10, 0), "s");
    assert.equal(selectionCursorDirection("s", 10, -10, 0), "n");
  });

  it("keeps a resize cursor at a zero axis and rotates signed directions", () => {
    assert.equal(selectionCursorDirection("e", 0, 10, 0), "e");
    assert.equal(selectionCursorDirection("e", -10, 10, Math.PI / 2), "n");
  });
});
