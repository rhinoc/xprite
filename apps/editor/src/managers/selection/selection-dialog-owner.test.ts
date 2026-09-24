import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("selection-dialog-owner [feature-1-6]", () => {
  it("selection-dialog-owner behavior", async () => {
    const compile = async (file) => {
      const { outputFiles } = await build({
        entryPoints: [file],
        bundle: true,
        format: "esm",
        write: false,
      });
      return import(
        `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
      );
    };
    const { RasterEditor } = await compile("packages/editor-core/src/editor/RasterEditor.ts");
    const { selectionDialogMatchesOwner: matches } = await compile(
      "apps/editor/src/managers/selection/selection-dialog-owner.ts",
    );
    const pixels = () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) });
    const first = new RasterEditor(pixels(), "same.png"),
      second = new RasterEditor(pixels(), "same.png");
    const id = first.getSnapshot().document.id;
    assert.equal(
      second.getSnapshot().document.id,
      id,
      "Regression fixture: editor-local IDs collide",
    );
    assert.equal(matches(first, first, id), true);
    assert.equal(
      matches(first, second, id),
      false,
      "Dialog must never transfer to another tab with matching document ID/name",
    );
    assert.equal(matches(first, null, id), false);
    assert.equal(matches(null, first, id), false);
    first.document.loadImage(pixels(), "same.png");
    assert.equal(
      matches(first, first, id),
      false,
      "Newly installed document in same editor does not inherit draft",
    );
    const next = first.getSnapshot().document.id;
    assert.equal(matches(first, first, next), true);
    first.document.close();
    assert.equal(matches(first, first, next), false, "Closing document invalidates owner");
    console.log(
      "Selection modal ownership passed: identical tab IDs/names, editor replacement, document replacement, closed document",
    );
  }, 60_000);
});
