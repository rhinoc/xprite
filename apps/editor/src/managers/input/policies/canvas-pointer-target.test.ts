import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("canvas finger target priority", () => {
  it("hits objects without changing drafts/history and retains navigation in empty areas", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents:
          'export { RasterEditor } from "./packages/editor-core/src/index.ts"; export { resolveCanvasPointerTarget } from "./apps/editor/src/managers/input/policies/canvas-pointer-target.ts"; export { CanvasPointerTarget } from "./apps/editor/src/managers/input/controllers/pointer-controller.ts";',
        resolveDir: process.cwd(),
      },
      alias: { "@xprite/editor-core": "./packages/editor-core/src/index.ts" },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      RasterEditor,
      resolveCanvasPointerTarget: target,
      CanvasPointerTarget,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const editor = new RasterEditor({
      width: 64,
      height: 64,
      data: new Uint8ClampedArray(64 * 64 * 4),
    });
    editor.drawing.settings.setSettings({ tool: "marquee" });
    const snapshot = editor.getSnapshot();
    const mask = { x: 10, y: 10, width: 2, height: 2, data: new Uint8Array([1, 0, 0, 1]) };
    const selected = { ...snapshot, document: { ...snapshot.document, selection: mask } };
    assert.equal(target(selected, { x: 10.5, y: 10.5 }, false), CanvasPointerTarget.Editable);
    assert.equal(
      target(selected, { x: 11, y: 10 }, false),
      CanvasPointerTarget.Surface,
      "holes in irregular selections remain available for navigation",
    );
    assert.equal(
      target(selected, { x: 10, y: 10, actionModifiers: { subtractSelection: true } }, false),
      CanvasPointerTarget.Surface,
      "subtracting a selection is not misclassified as moving its pixels",
    );
    assert.equal(target(selected, { x: 11, y: 10 }, true), CanvasPointerTarget.Editable);
    assert.equal(target(snapshot, { x: 40, y: 40 }, true), CanvasPointerTarget.Editable);

    const paste = {
      pixels: { width: 3, height: 4, data: new Uint8ClampedArray(48) },
      x: 20,
      y: 20,
    };
    const pasting = { ...snapshot, floatingPaste: paste };
    assert.equal(target(pasting, { x: 21, y: 21 }, false), CanvasPointerTarget.Editable);
    assert.equal(target(pasting, { x: 24, y: 21 }, false), CanvasPointerTarget.Surface);
    assert.equal(
      target(pasting, { x: 24, y: 21 }, true),
      CanvasPointerTarget.Editable,
      "resize/rotate handles extending beyond pasted pixels still own the contact",
    );
    assert.equal(pasting.floatingPaste, paste, "outside hit tests do not commit the paste");

    const text = { bounds: { x: 20, y: 20, width: 8, height: 8 }, text: "A" };
    const writing = { ...snapshot, inlineText: text, view: { ...snapshot.view, zoom: 4 } };
    assert.equal(target(writing, { x: 15, y: 21 }, false), CanvasPointerTarget.Editable);
    assert.equal(target(writing, { x: 11, y: 21 }, false), CanvasPointerTarget.Surface);
    assert.equal(writing.inlineText, text);
    assert.deepEqual(text.bounds, { x: 20, y: 20, width: 8, height: 8 });

    const slicing = {
      ...snapshot,
      settings: { ...snapshot.settings, tool: "slice" },
      selectedSliceIds: ["slice"],
      document: {
        ...snapshot.document,
        timeline: {
          activeFrame: 0,
          slices: [
            { id: "slice", keys: [{ frame: 0, bounds: { x: 20, y: 20, width: 8, height: 8 } }] },
          ],
        },
      },
      view: { ...snapshot.view, zoom: 1 },
    };
    assert.equal(target(slicing, { x: 21, y: 21 }, false), CanvasPointerTarget.Editable);
    assert.equal(target(slicing, { x: 19, y: 21 }, false), CanvasPointerTarget.Editable);
    assert.equal(target(slicing, { x: 10, y: 10 }, false), CanvasPointerTarget.Surface);
    assert.equal(editor.getSnapshot().persistenceRevision, snapshot.persistenceRevision);
    assert.equal(editor.getSnapshot().canUndo, snapshot.canUndo);
  });
});
