import assert from "node:assert/strict";

import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/history/history.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { EditorHistory, CommandTransaction } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const doc = {
  name: "History",
  width: 1,
  height: 1,
  layer: {
    name: "Layer",
    x: 0,
    y: 0,
    visible: true,
    locked: false,
    pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
  },
  selection: null,
};
const history = new EditorHistory();
history.reset();
assert.equal(history.getOptions().maxBytes, 0, "Aseprite default has no memory limit");
history.setOptions({ allowNonlinearHistory: true });
const add = (label, x) => {
  history.begin(doc, label);
  doc.layer = { ...doc.layer, x };
  assert.equal(history.commit(doc), true);
};
add("One", 1);
add("Two", 2);
history.undo(doc);
add("Branch", 3);
add("Four", 4);
assert.deepEqual(
  history.getStates().map((state) => state.label),
  ["One", "Two", "Branch", "Four"],
);
for (const x of [3, 2, 1, 0]) {
  assert.equal(history.undo(doc), true);
  assert.equal(doc.layer.x, x);
}
assert.equal(history.canUndo, false);
for (const x of [1, 2, 3, 4]) {
  assert.equal(history.redo(doc), true);
  assert.equal(doc.layer.x, x);
}
assert.equal(history.canRedo, false);
history.moveToState(doc, 1);
assert.equal(doc.layer.x, 2, "jump to alternate branch");
history.moveToState(doc, 3);
assert.equal(doc.layer.x, 4, "return across branches");
history.markSaved();
assert.equal(history.dirty, false);
history.undo(doc);
assert.equal(history.dirty, true);
history.redo(doc);
assert.equal(history.dirty, false);

history.setOptions({ allowNonlinearHistory: false });
history.undo(doc);
history.undo(doc);
add("Replacement", 5);
assert.deepEqual(
  history.getStates().map((state) => state.label),
  ["One", "Two", "Replacement"],
  "linear edit clears later states",
);
assert.equal(history.canRedo, false);
assert.equal(
  history.getHistorySnapshot().savedStateLost,
  true,
  "discarding saved redo marks the save point lost",
);
assert.equal(history.dirty, true);

const pixels = {
  ...doc,
  layer: { ...doc.layer, x: 0, pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) } },
};
const raster = new EditorHistory();
raster.reset();
raster.begin(pixels, "Paint");
raster.capture(pixels.layer.pixels, { x: 0, y: 0, width: 1, height: 1 });
pixels.layer.pixels.data.set([255, 20, 10, 255]);
raster.commit(pixels);
assert.ok(raster.getStates().length === 1);
assert.deepEqual(
  raster.past[0].command.commands.map((command) => command.constructor.name),
  ["PatchCommand"],
  "pure painting retains only a pixel command",
);
raster.undo(pixels);
assert.deepEqual(
  [...pixels.layer.pixels.data],
  [0, 0, 0, 0],
  "region command exchanges with original pixels",
);
raster.redo(pixels);
assert.deepEqual(
  [...pixels.layer.pixels.data],
  [255, 20, 10, 255],
  "redo exchanges the same buffer back",
);
const branched = new EditorHistory();
branched.reset();
branched.setOptions({ allowNonlinearHistory: true });
const bitmap = {
  ...pixels,
  layer: { ...pixels.layer, pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) } },
};
const paint = (name, red) => {
  branched.begin(bitmap, name);
  branched.capture(bitmap.layer.pixels, { x: 0, y: 0, width: 1, height: 1 });
  bitmap.layer.pixels.data.set([red, 0, 0, 255]);
  branched.commit(bitmap);
};
paint("Red", 80);
paint("Blue", 120);
branched.undo(bitmap);
paint("Green", 160);
branched.undo(bitmap);
assert.equal(bitmap.layer.pixels.data[0], 120, "nonlinear undo crosses pixel branches");
branched.redo(bitmap);
assert.equal(bitmap.layer.pixels.data[0], 160, "nonlinear redo returns through the shared image");
branched.moveToState(bitmap, 0);
assert.equal(bitmap.layer.pixels.data[0], 80);
branched.moveToState(bitmap, 1);
assert.equal(bitmap.layer.pixels.data[0], 120);
const coreBundle = await build({
  entryPoints: ["packages/editor-core/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { RasterEditor } = await import(
  `data:text/javascript;base64,${Buffer.from(coreBundle.outputFiles[0].contents).toString("base64")}`
);
const editor = new RasterEditor({ width: 4, height: 4, data: new Uint8ClampedArray(64) });
editor.addFrame(false);
editor.selectFrame(0);
editor.setUndoOptions({ gotoModified: false, showTooltip: false });
editor.pointerDown({ x: 1, y: 1 });
editor.pointerUp();
editor.selectFrame(1);
editor.undo();
assert.equal(
  editor.getSnapshot().document.timeline.activeFrame,
  1,
  "disabled goto-modified keeps the current frame",
);
assert.equal(editor.getSnapshot().status, "Undid Pencil", "disabled tooltip uses status text");
editor.setUndoOptions({ gotoModified: true, showTooltip: true });
editor.redo();
assert.equal(
  editor.getSnapshot().document.timeline.activeFrame,
  0,
  "source default goto-modified focuses the edited frame",
);
assert.equal(editor.getSnapshot().undoNotice?.text, "Redid Pencil");
assert.equal(editor.getSnapshot().status, "Ready");
assert.equal(typeof CommandTransaction, "function");
console.log(
  "Aseprite command history: transactions, reversible region exchange, chronological nonlinear traversal, direct state jumps, save-point loss and unlimited default pass.",
);
