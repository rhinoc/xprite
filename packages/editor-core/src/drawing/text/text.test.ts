import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("bitmap-text-support", () => {
  it("bitmap-text-support behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: "export * from './packages/editor-core/src/index.ts';",
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor, paintText, measureBitmapText, validateBitmapText } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const glyph = { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) };
    const font = { height: 1, lineHeight: 1, glyphs: { A: glyph, "?": glyph } };
    const image = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
    assert.equal(validateBitmapText("A\n\r\u0014A", font), null);
    assert.equal(validateBitmapText("A\0☃", font), null);
    assert.match(validateBitmapText("A☃", font), /U\+2603/);
    assert.match(validateBitmapText("A\t", font), /U\+0009/);
    assert.throws(
      () =>
        paintText(image, { x: 0, y: 0 }, "A☃", font, 1, {
          color: [255, 255, 255, 255],
          brush: { size: 1, shape: "square", angle: 0 },
        }),
      RangeError,
    );
    assert.equal(image.data.some(Boolean), false, "Reject before drawing preceding valid glyph");
    assert.throws(() => measureBitmapText("A☃", font, 1), RangeError);
    const editor = new RasterEditor(image);
    editor.drawing.settings.setSettings({ font });
    assert.equal(editor.drawing.text.beginTextPaste("A", 1, { x: 1, y: 1 }), true);
    const before = editor.getSnapshot();
    const pixels = editor.canvas.composite().data.slice();
    assert.equal(editor.drawing.text.beginTextPaste("A☃", 1), false);
    assert.equal(
      editor.getSnapshot(),
      before,
      "Invalid paste must preserve floating paste, history and settings",
    );
    assert.deepEqual(editor.canvas.composite().data, pixels);
    assert.equal(
      editor.drawing.text.beginTextPasteInViewport("A☃", 1, { width: 8, height: 8 }),
      false,
    );
    assert.equal(editor.getSnapshot(), before);
    assert.equal(editor.clipboard.commitFloatingPaste(), true);
    editor.history.undo();
    assert.equal(editor.canvas.composite().data.some(Boolean), false);
    console.log("Bitmap text support: 15 validation, atomic rejection and history checks passed.");
  }, 60_000);
});
