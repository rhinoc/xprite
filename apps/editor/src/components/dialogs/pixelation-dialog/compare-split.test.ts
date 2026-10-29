import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  clampSplit,
  resultClipLeft,
  splitFromKey,
  splitFromPointer,
  SPLIT_MAX,
  SPLIT_MIN,
} from "$/components/dialogs/pixelation-dialog/compare-split";

describe("import compare split", () => {
  it("maps pointer and keys onto the divider percent", () => {
    assert.equal(splitFromPointer(50, { left: 0, width: 100 }), 50);
    assert.equal(splitFromPointer(-10, { left: 0, width: 100 }), SPLIT_MIN);
    assert.equal(splitFromPointer(200, { left: 0, width: 100 }), SPLIT_MAX);
    assert.equal(splitFromKey(50, "ArrowLeft"), 45);
    assert.equal(splitFromKey(50, "Home"), SPLIT_MIN);
    assert.equal(splitFromKey(50, "End"), SPLIT_MAX);
    assert.equal(splitFromKey(50, "a"), null);
  });

  it("clips the result layer to the divider in the zoomed layer's local space", () => {
    assert.equal(resultClipLeft(50, 200, { left: 0, width: 200 }), 100);
    assert.equal(resultClipLeft(25, 200, { left: 40, width: 160 }), 10);
    assert.equal(resultClipLeft(10, 200, { left: 50, width: 100 }), 0);
    assert.equal(clampSplit(Number.NaN), 50);
  });
});
