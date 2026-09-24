import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("slice-editor", () => {
  it("slice-editor behavior", async () => {
    const root = new URL("../../../..", import.meta.url).pathname;
    const bundled = await build({
      stdin: {
        contents: `export {RasterEditor} from './packages/editor-core/src/editor/RasterEditor.ts';export {projectFromDocument,projectFromAseprite,asepriteFromProject} from './packages/editor-core/src/import-export/aseprite/project.ts';export {encodeAsepriteSync,decodeAsepriteSync} from './packages/editor-core/src/import-export/aseprite/index.ts';export {sliceMetadataForExport,sliceKeyAt} from './packages/editor-core/src/sprite/slice-metadata.ts';export {renderSpriteSheet,defaultSpriteSheetOptions} from './packages/editor-core/src/import-export/image/export-sheet.ts';export {canExecuteEditorAction} from './packages/editor-core/src/editor/commands/editor-commands.ts';`,
        resolveDir: root,
        sourcefile: "slice-test.ts",
      },
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
      logLevel: "silent",
    });
    const {
      RasterEditor,
      projectFromDocument,
      projectFromAseprite,
      asepriteFromProject,
      encodeAsepriteSync,
      decodeAsepriteSync,
      sliceMetadataForExport,
      sliceKeyAt,
      renderSpriteSheet,
      defaultSpriteSheetOptions,
      canExecuteEditorAction,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`
    );
    const editor = new RasterEditor(
      { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) },
      "slice-test",
    );
    editor.drawing.settings.setSettings({ tool: "slice" });
    const drag = (a, b) => {
      editor.pointerDown({ ...a, button: 0 });
      editor.pointerMove({ ...b, button: 0 });
      editor.pointerUp({ ...b, button: 0 });
    };
    drag({ x: 3, y: 4 }, { x: 15, y: 14 });
    let doc = editor.getSnapshot().document;
    assert.equal(doc.timeline.slices.length, 1);
    const id = doc.timeline.slices[0].id;
    assert.deepEqual(doc.timeline.slices[0].keys[0].bounds, { x: 3, y: 4, width: 13, height: 11 });
    drag({ x: 9, y: 9 }, { x: 11, y: 10 });
    doc = editor.getSnapshot().document;
    assert.deepEqual(doc.timeline.slices[0].keys[0].bounds, { x: 5, y: 5, width: 13, height: 11 });
    editor.history.undo();
    assert.deepEqual(editor.getSnapshot().document.timeline.slices[0].keys[0].bounds, {
      x: 3,
      y: 4,
      width: 13,
      height: 11,
    });
    editor.history.redo();
    editor.sprite.slices.editSliceProperties(id, {
      name: "Panel",
      bounds: { x: 5, y: 5, width: 14, height: 12 },
      center: { x: 1, y: 1, width: 12, height: 10 },
      pivot: { x: 7, y: 6 },
      color: "#123456ff",
      data: "UI",
    });
    const project = projectFromDocument(editor.getSnapshot().document);
    project.timeline = {
      ...project.timeline,
      slices: project.timeline.slices.map((s) => ({ ...s, properties: Uint8Array.of(1, 2, 3, 4) })),
    };
    const bytes = encodeAsepriteSync(asepriteFromProject(project));
    const decoded = decodeAsepriteSync(bytes);
    const imported = projectFromAseprite(decoded);
    assert.equal(imported.timeline.slices[0].name, "Panel");
    assert.deepEqual(imported.timeline.slices[0].keys[0].center, {
      x: 1,
      y: 1,
      width: 12,
      height: 10,
    });
    assert.deepEqual(imported.timeline.slices[0].keys[0].pivot, { x: 7, y: 6 });
    assert.equal(imported.timeline.slices[0].data, "UI");
    assert.deepEqual([...imported.timeline.slices[0].properties], [1, 2, 3, 4]);
    assert.equal(sliceMetadataForExport(imported.timeline.slices)[0].keys[0].bounds.w, 14);
    const sheet = renderSpriteSheet(
      editor.getSnapshot().document,
      defaultSpriteSheetOptions(editor.getSnapshot().document),
    );
    assert.equal(sheet.data.meta.slices[0].keys[0].center.w, 12);
    drag({ x: 6, y: 11 }, { x: 7, y: 11 });
    assert.deepEqual(editor.getSnapshot().document.timeline.slices[0].keys[0].center, {
      x: 2,
      y: 1,
      width: 11,
      height: 10,
    });
    editor.history.undo();
    drag({ x: 19, y: 10 }, { x: 21, y: 10 });
    assert.equal(editor.getSnapshot().document.timeline.slices[0].keys[0].bounds.width, 16);
    drag({ x: 22, y: 22 }, { x: 27, y: 27 });
    assert.equal(editor.getSnapshot().document.timeline.slices.length, 2);
    drag({ x: 0, y: 0 }, { x: 30, y: 30 });
    assert.equal(editor.getSnapshot().selectedSliceIds.length, 2);
    const selected = [...editor.getSnapshot().selectedSliceIds],
      before = editor.getSnapshot().document.timeline.slices.map((s) => s.keys[0].bounds);
    editor.pointerDown({ x: 8, y: 8, button: 0 });
    editor.pointerMove({ x: 9, y: 9, button: 0 });
    editor.cancelGesture();
    assert.deepEqual(
      editor.getSnapshot().document.timeline.slices.map((s) => s.keys[0].bounds),
      before,
      "Cancelling a slice drag restores the pre-gesture document",
    );
    editor.pointerDown({ x: 8, y: 8, button: 2 });
    assert.deepEqual(editor.getSnapshot().selectedSliceIds, selected);
    editor.sprite.slices.editSlicesProperties(selected, { bounds: { x: 8 }, center: { x: 3 } });
    assert.deepEqual(
      editor.getSnapshot().document.timeline.slices.map((s) => s.keys[0].bounds.y),
      before.map((b) => b.y),
    );
    assert.deepEqual(
      editor.getSnapshot().document.timeline.slices.map((s) => s.keys[0].bounds.x),
      [8, 8],
    );
    assert.deepEqual(
      editor.getSnapshot().document.timeline.slices.map((s) => s.keys[0].center.x),
      [3, 3],
    );
    editor.history.undo();
    assert.deepEqual(
      editor.getSnapshot().document.timeline.slices.map((s) => s.keys[0].bounds),
      before,
    );
    editor.sprite.slices.duplicateSlices(selected);
    assert.equal(editor.getSnapshot().document.timeline.slices.length, 4);
    assert.deepEqual(
      editor
        .getSnapshot()
        .document.timeline.slices.slice(2)
        .map((s) => s.name),
      ["Copy of Panel", "Copy of Slice 1"],
    );
    assert.deepEqual(
      editor
        .getSnapshot()
        .document.timeline.slices.slice(2)
        .map((s) => s.keys[0].bounds.x),
      before.map((b) => b.x + 2),
    );
    editor.history.undo();
    assert.equal(editor.getSnapshot().document.timeline.slices.length, 2);
    editor.sprite.slices.selectSlice(selected[0]);
    editor.sprite.slices.selectSlice(selected[1], true);
    assert.equal(canExecuteEditorAction("clear", editor.getSnapshot(), "document"), true);
    editor.selection.clearSelectionPixels();
    assert.equal(editor.getSnapshot().document.timeline.slices.length, 0);
    editor.history.undo();
    assert.equal(editor.getSnapshot().document.timeline.slices.length, 2);
    const keyed = new RasterEditor(
      { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) },
      "keyed",
    );
    keyed.drawing.settings.setSettings({ tool: "slice", sliceUseKeys: true });
    keyed.timeline.addFrame();
    const keyedDrag = (a, b) => {
      keyed.pointerDown({ ...a, button: 0 });
      keyed.pointerMove({ ...b, button: 0 });
      keyed.pointerUp({ ...b, button: 0 });
    };
    keyedDrag({ x: 2, y: 2 }, { x: 10, y: 10 });
    const keyedId = keyed.getSnapshot().document.timeline.slices[0].id;
    assert.equal(keyed.getSnapshot().document.timeline.slices[0].keys[0].frame, 1);
    keyed.timeline.addFrame();
    keyed.sprite.slices.editSliceProperties(keyedId, { bounds: { x: 4 } });
    assert.deepEqual(
      keyed.getSnapshot().document.timeline.slices[0].keys.map((k) => k.frame),
      [1, 2],
    );
    keyed.sprite.slices.selectSlice(keyedId);
    keyed.sprite.slices.deleteSelectedSlices();
    assert.equal(sliceKeyAt(keyed.getSnapshot().document.timeline.slices[0], 2), undefined);
    assert.equal(sliceKeyAt(keyed.getSnapshot().document.timeline.slices[0], 1)?.bounds.x, 2);
    const keyedBytes = encodeAsepriteSync(
      asepriteFromProject(projectFromDocument(keyed.getSnapshot().document)),
    );
    const keyedReopened = projectFromAseprite(decodeAsepriteSync(keyedBytes));
    assert.equal(sliceKeyAt(keyedReopened.timeline.slices[0], 2), undefined);
    assert.equal(sliceKeyAt(keyedReopened.timeline.slices[0], 1)?.bounds.x, 2);
    console.log(
      "Slice creation, selection, movement, resize, undo, properties, ASE and sheet export, deletion PASS",
    );
  }, 60_000);
});
