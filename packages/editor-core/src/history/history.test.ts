import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("palette-history", () => {
  it("palette-history behavior", async () => {
    const bundled = await build({
      entryPoints: [
        "packages/editor-core/src/index.ts",
        "packages/editor-core/src/history/history.ts",
      ],
      bundle: true,
      platform: "node",
      format: "esm",
      outdir: "unused",
      write: false,
    });
    const modules = await Promise.all(
      bundled.outputFiles.map(
        (file) =>
          import(`data:text/javascript;base64,${Buffer.from(file.contents).toString("base64")}`),
      ),
    );
    const { RasterEditor } = modules.find((module) => module.RasterEditor);
    const { EditorHistory } = modules.find((module) => module.EditorHistory);
    const image = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    const initial = [[0, 0, 0, 255]];
    const added = [
      [0, 0, 0, 255],
      [50, 100, 150, 255],
    ];
    const editor = new RasterEditor();
    editor.document.loadImage(image, "Palette fixture", initial);
    const composite = editor.canvas.composite();
    const revision = editor.getSnapshot().pixelRevision;
    const unchangedRaster = () => {
      assert.equal(editor.getSnapshot().pixelRevision, revision);
      assert.equal(editor.canvas.composite(), composite);
      assert.deepEqual(editor.canvas.composite().data, image.data);
    };
    editor.color.setPalette(added);
    assert.equal(editor.getSnapshot().dirty, true);
    assert.equal(editor.getSnapshot().canUndo, true);
    assert.deepEqual(editor.getSnapshot().palette, added);
    unchangedRaster();
    // Caller mutations must not rewrite retained transaction state.
    added[1][0] = 200;
    assert.equal(editor.getSnapshot().palette[1][0], 50);
    editor.history.undo();
    assert.deepEqual(editor.getSnapshot().palette, initial);
    assert.equal(editor.getSnapshot().dirty, false);
    unchangedRaster();
    editor.history.redo();
    assert.equal(editor.getSnapshot().palette[1][0], 50);
    assert.equal(editor.getSnapshot().dirty, true);
    unchangedRaster();
    editor.history.markSaved();
    editor.color.setPalette(editor.getSnapshot().palette.map((color) => [...color]));
    assert.equal(editor.getSnapshot().dirty, false, "Equal palette is a no-op");
    editor.history.undo();
    assert.deepEqual(editor.getSnapshot().palette, initial, "No-op did not consume an undo entry");
    assert.equal(editor.getSnapshot().dirty, true, "Undo away from saved palette marks dirty");
    editor.history.redo();
    assert.equal(editor.getSnapshot().dirty, false);
    // Palette and pixel commands share one ordered history.
    editor.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 0, 255] });
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerUp();
    const painted = editor.canvas.composite();
    const paintedRevision = editor.getSnapshot().pixelRevision;
    editor.color.setPalette([[9, 8, 7, 255]]);
    assert.equal(editor.canvas.composite(), painted);
    editor.history.undo();
    assert.equal(editor.getSnapshot().pixelRevision, paintedRevision);
    assert.equal(editor.canvas.composite(), painted);
    editor.history.undo();
    assert.deepEqual(editor.canvas.composite().data, image.data);
    editor.history.redo();
    assert.deepEqual(editor.canvas.composite().data, painted.data);
    editor.history.redo();
    assert.deepEqual(editor.getSnapshot().palette, [[9, 8, 7, 255]]);
    editor.history.undo();
    editor.color.setPalette([[1, 2, 3, 255]]);
    assert.equal(editor.getSnapshot().canRedo, false, "New palette truncates redo branch");
    editor.document.loadImage(image, "Replacement", initial);
    assert.equal(editor.getSnapshot().canUndo, false, "Import palette creates no history");
    assert.equal(editor.getSnapshot().dirty, false);
    // Budget includes all retained palette numeric payloads, once per shared tuple.
    const document = {
      ...editor.getSnapshot().document,
      palette: [[0, 0, 0, 255]],
    };
    const history = new EditorHistory(112); // 16 raster bytes plus 3 palettes × 32.
    history.reset();
    for (let n = 1; n <= 8; n++) {
      history.begin(document);
      document.palette = [[n, n, n, 255]];
      history.commit(document);
    }
    let count = 0;
    while (history.undo(document)) count++;
    assert.equal(count, 2, "Palette memory evicts older transactions");
    assert.equal(document.palette[0][0], 6);
    while (history.redo(document)) {}
    assert.equal(document.palette[0][0], 8);
    const tiny = new EditorHistory(1);
    tiny.reset();
    tiny.begin(document);
    document.palette = [[9, 9, 9, 255]];
    tiny.commit(document);
    assert.equal(tiny.undo(document), true, "Newest oversized transaction remains undoable");
    assert.equal(document.palette[0][0], 8);
    console.log(
      "Palette history passes: source-style dirty/undo/redo, no-op and import semantics, immutable snapshots, raster cache preservation, mixed history and palette budget eviction.",
    );
  }, 60_000);
});
