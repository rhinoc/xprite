import assert from "node:assert/strict";

import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/history/history.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { EditorHistory } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const document = {
  name: "Selection memory fixture",
  width: 16,
  height: 16,
  layer: {
    name: "Layer1",
    x: 0,
    y: 0,
    visible: true,
    locked: false,
    pixels: { width: 16, height: 16, data: new Uint8ClampedArray(1024) },
  },
  selection: null,
};
const history = new EditorHistory(1024);
history.reset();
for (let i = 0; i < 8; i++) {
  history.begin(document);
  document.selection = {
    x: 0,
    y: 0,
    width: 16,
    height: 16,
    data: new Uint8Array(256).fill(i + 1),
  };
  history.commit(document);
}
let undone = 0;
while (history.canUndo) {
  history.undo(document);
  undone++;
}
assert.equal(
  undone,
  3,
  "selection commands retain four unique256-byte masks without retaining the live image",
);
assert.equal(document.selection.data[0], 5);
while (history.canRedo) history.redo(document);
assert.equal(document.selection.data[0], 8, "Retained selection transactions redo correctly");
const tiny = new EditorHistory(1);
tiny.reset();
tiny.begin(document);
document.layer = { ...document.layer, locked: true };
tiny.commit(document);
assert.equal(tiny.canUndo, true, "Preserve latest transaction even when it exceeds cap");
tiny.undo(document);
assert.equal(document.layer.locked, false);
console.log(
  "History budget checks pass: selection buffers counted once, older transactions evicted, retained undo/redo intact, latest oversized transaction preserved.",
);
{
  const active = { width: 16, height: 16, data: new Uint8ClampedArray(1024) };
  const hidden = { width: 32, height: 16, data: new Uint8ClampedArray(2048) };
  const doc = {
    name: "Linked frame budget",
    width: 16,
    height: 16,
    layer: { name: "Layer1", x: 0, y: 0, visible: true, locked: false, pixels: active },
    selection: null,
    timeline: {
      activeLayer: 0,
      activeFrame: 0,
      layers: [
        { id: "a", name: "Layer1", visible: true, locked: false, opacity: 255, flags: 3 },
        { id: "b", name: "Other", visible: false, locked: false, opacity: 255, flags: 2 },
      ],
      frames: Array.from({ length: 30 }, () => ({
        duration: 100,
        cels: [
          { pixels: active, x: 0, y: 0, opacity: 255, zIndex: 0 },
          { pixels: hidden, x: 0, y: 0, opacity: 255, zIndex: 0 },
        ],
      })),
    },
  };
  const history = new EditorHistory(1024);
  for (let i = 0; i < 8; i++) {
    history.begin(doc);
    doc.selection = { x: 0, y: 0, width: 16, height: 16, data: new Uint8Array(256).fill(i + 1) };
    history.commit(doc);
  }
  let count = 0;
  while (history.canUndo) {
    history.undo(doc);
    count++;
  }
  assert.equal(
    count,
    3,
    "selection-only commands retain masks without retaining unrelated linked cel images",
  );
  while (history.canRedo) history.redo(doc);
  assert.equal(doc.selection.data[0], 8);
  console.log("Selection-only command budget excludes unrelated linked-frame images.");
}
