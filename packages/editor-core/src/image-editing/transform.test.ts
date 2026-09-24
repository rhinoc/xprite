import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("document-transforms", () => {
  it("document-transforms behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor, executeEditorCommand } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const blank = { width: 8, height: 6, data: new Uint8ClampedArray(8 * 6 * 4) };
    const editor = new RasterEditor(blank);
    editor.selection.invert();
    assert.equal(editor.getSnapshot().document.selection.data.length, 48);
    editor.selection.invert();
    assert.equal(editor.getSnapshot().document.selection, null);
    assert.equal(editor.getSnapshot().dirty, false);
    editor.drawing.settings.setSettings({ tool: "lasso" });
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerMove({ x: 5, y: 1 });
    editor.pointerMove({ x: 1, y: 4 });
    editor.pointerUp();
    const selection = editor.getSnapshot().document.selection;
    assert.ok(selection);
    const contains = (mask, x, y) =>
      !!(
        mask &&
        x >= mask.x &&
        y >= mask.y &&
        x < mask.x + mask.width &&
        y < mask.y + mask.height &&
        mask.data[(y - mask.y) * mask.width + x - mask.x]
      );
    editor.selection.invert();
    const inverted = editor.getSnapshot().document.selection;
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 8; x++)
        assert.equal(contains(inverted, x, y), !contains(selection, x, y));
    editor.history.undo();
    assert.equal(editor.getSnapshot().document.selection, selection);
    assert.equal(editor.getSnapshot().dirty, false);

    const pixels = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255]),
    };
    editor.document.loadTimeline(
      {
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          { id: "a", name: "Locked", visible: true, locked: true, opacity: 255, flags: 1 },
          { id: "b", name: "Hidden", visible: false, locked: false, opacity: 255, flags: 2 },
        ],
        frames: [
          {
            duration: 100,
            cels: [
              { pixels, x: 1, y: 2, opacity: 255, zIndex: 0 },
              { pixels, x: -1, y: 0, opacity: 255, zIndex: 0 },
            ],
          },
          { duration: 150, cels: [{ pixels, x: 4, y: 3, opacity: 255, zIndex: 0 }, null] },
        ],
      },
      8,
      6,
      "Linked.aseprite",
    );
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerUp({ x: 2, y: 3 });
    const originalMask = editor.getSnapshot().document.selection;
    const before = editor.getSnapshot().document.timeline;
    editor.history.markSaved();
    editor.imageEditing.flipCanvas("horizontal");
    let doc = editor.getSnapshot().document;
    const flipped = doc.timeline;
    assert.deepEqual(
      [...flipped.frames[0].cels[0].pixels.data].filter((_, i) => i % 4 === 0),
      [2, 1, 4, 3],
    );
    assert.equal(flipped.frames[0].cels[0].x, 5);
    assert.equal(flipped.frames[0].cels[1].x, 7);
    assert.equal(flipped.frames[1].cels[0].x, 2);
    assert.equal(flipped.frames[1].cels[1], null);
    assert.equal(flipped.frames[0].cels[0].pixels, flipped.frames[1].cels[0].pixels);
    assert.equal(flipped.frames[0].cels[0].pixels, flipped.frames[0].cels[1].pixels);
    assert.equal(doc.selection.x, 8 - originalMask.x - originalMask.width);
    assert.equal(editor.getSnapshot().dirty, true);
    editor.history.undo();
    assert.equal(editor.getSnapshot().dirty, false);
    assert.equal(editor.getSnapshot().document.timeline.frames, before.frames);
    assert.equal(editor.getSnapshot().document.selection, originalMask);
    editor.history.redo();
    editor.imageEditing.flipCanvas("vertical");
    doc = editor.getSnapshot().document;
    assert.deepEqual(
      [...doc.layer.pixels.data].filter((_, i) => i % 4 === 0),
      [4, 3, 2, 1],
    );
    assert.equal(doc.timeline.frames[1].cels[0].y, 1);
    assert.equal(doc.timeline.layers[0].locked, true);
    assert.equal(doc.timeline.layers[1].visible, false);
    assert.equal(
      executeEditorCommand(
        editor,
        { type: "invert-selection" },
        { scene: "home", viewport: { width: 100, height: 100 } },
      ).kind,
      "unavailable",
    );
    console.log(
      "Document transforms: irregular inversion, clean selection undo, canvas flips across hidden/locked layers and linked frames, offsets, empty cels, masks and undo/redo pass.",
    );
  }, 60_000);
});
