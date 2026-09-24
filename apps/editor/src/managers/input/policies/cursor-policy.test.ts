import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-cursors", () => {
  it("editor-cursors behavior", async () => {
    const bundle = await build({
      entryPoints: ["apps/editor/src/managers/input/policies/cursor-policy.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const cursorBundle = await build({
      entryPoints: ["apps/editor/src/adapters/input/selection-cursor-direction.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const { cursorNeedsWhite, usesBrushBoundaryCursor } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    );
    const { selectionCursorDirection } = await import(
      `data:text/javascript;base64,${Buffer.from(cursorBundle.outputFiles[0].text).toString("base64")}`
    );

    assert.equal(cursorNeedsWhite(0, 0, 0), true);
    assert.equal(cursorNeedsWhite(127, 127, 127), true);
    assert.equal(cursorNeedsWhite(128, 128, 128), false);
    assert.equal(cursorNeedsWhite(255, 255, 255), false);
    assert.equal(cursorNeedsWhite(255, 0, 0), true);

    assert.equal(usesBrushBoundaryCursor("pencil", 64, 64, true, false), false);
    assert.equal(usesBrushBoundaryCursor("pencil", 1, 2, true, true), true);
    assert.equal(usesBrushBoundaryCursor("pencil", 1, 2, false, true), false);
    assert.equal(usesBrushBoundaryCursor("eraser", 1, 1, true, false), false);
    assert.equal(usesBrushBoundaryCursor("eraser", 1, 2, true, false), true);
    assert.equal(usesBrushBoundaryCursor("blur", 1, 2, true, false), true);
    assert.equal(usesBrushBoundaryCursor("bucket", 64, 1, true, true), false);
    assert.equal(usesBrushBoundaryCursor("bucket", 64, 2, true, true), true);

    assert.equal(selectionCursorDirection("nw", 10, 10, 0), "nw");
    assert.equal(selectionCursorDirection("nw", 100, 10, 0), "w");
    assert.equal(selectionCursorDirection("nw", 10, 100, 0), "n");
    assert.equal(selectionCursorDirection("ne", 100, 10, 0), "e");
    assert.equal(selectionCursorDirection("rotate-ne", 10, 10, Math.PI / 4), "e");
    assert.equal(selectionCursorDirection("s", 10, 10, 0), "se");
    assert.equal(selectionCursorDirection("unknown", 10, 10, 0), null);

    console.log(
      "Editor cursor contrast, Aseprite FULL brush-boundary and rotated-handle rules pass.",
    );
  }, 60_000);
});
