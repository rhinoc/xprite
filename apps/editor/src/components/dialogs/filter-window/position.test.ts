import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { clampFilterWindowPosition } from "$/components/dialogs/filter-window/position";

describe("filter window position clamping", () => {
  it("keeps positions that fit inside the viewport", () => {
    assert.deepEqual(
      clampFilterWindowPosition(
        { x: 140, y: 90 },
        { width: 400, height: 260 },
        { width: 1280, height: 720 },
      ),
      { x: 140, y: 90 },
    );
  });

  it("clamps off-screen positions back into the usable viewport", () => {
    assert.deepEqual(
      clampFilterWindowPosition(
        { x: 1100, y: 600 },
        { width: 400, height: 260 },
        { width: 1280, height: 720 },
      ),
      { x: 880, y: 460 },
    );
    assert.deepEqual(
      clampFilterWindowPosition(
        { x: -48, y: -12 },
        { width: 400, height: 260 },
        { width: 1280, height: 720 },
      ),
      { x: 0, y: 0 },
    );
  });

  it("pins to the origin when the dialog exceeds the viewport", () => {
    assert.deepEqual(
      clampFilterWindowPosition(
        { x: 200, y: 150 },
        { width: 500, height: 400 },
        { width: 360, height: 320 },
      ),
      { x: 0, y: 0 },
    );
  });
});
