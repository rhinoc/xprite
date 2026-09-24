import assert from "node:assert/strict";

import { build } from "esbuild";
const b = await build({
  entryPoints: ["packages/editor-core/src/history/history.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { EditorHistory } = await import(
  "data:text/javascript;base64," + Buffer.from(b.outputFiles[0].contents).toString("base64")
);
const pixels = { width: 100, height: 1, data: new Uint8ClampedArray(400) },
  raw = { depth: 8, width: 100, height: 1, data: new Uint8Array(100) },
  layer = { id: "l", name: "Layer", visible: true, locked: false, opacity: 255, flags: 3 };
const doc = {
  name: "Indexed",
  width: 100,
  height: 1,
  selection: null,
  layer: { name: "Layer", visible: true, locked: false, opacity: 255, pixels, x: 0, y: 0 },
  timeline: {
    colorDepth: 8,
    activeFrame: 0,
    activeLayer: 0,
    layers: [layer],
    frames: [
      {
        duration: 100,
        cels: [{ pixels, asepriteSamples: raw, x: 0, y: 0, opacity: 255, zIndex: 0 }],
      },
    ],
  },
};
const h = new EditorHistory(650);
h.reset();
for (let n = 1; n <= 2; n++) {
  h.begin(doc);
  const old = doc.timeline.frames[0].cels[0],
    asepriteSamples = { ...old.asepriteSamples, data: old.asepriteSamples.data.slice() };
  asepriteSamples.data[0] = n;
  doc.timeline = {
    ...doc.timeline,
    frames: [{ duration: 100, cels: [{ ...old, asepriteSamples }] }],
  };
  assert.equal(h.commit(doc), true);
}
assert.equal(raw.data[0], 0);
assert.equal(h.dirty, true);
assert.equal(h.undo(doc), true);
assert.equal(doc.timeline.frames[0].cels[0].asepriteSamples.data[0], 1);
assert.equal(h.canUndo, false, "older sample buffers must be evicted by budget");
assert.equal(h.redo(doc), true);
assert.equal(doc.timeline.frames[0].cels[0].asepriteSamples.data[0], 2);
console.log(
  "Indexed history budget: immutable indexed buffers counted once; raw-only changes are dirty/undoable, older over-budget entries evicted and latest undo/redo retains exact indices.",
);
