import assert from "node:assert/strict";

import { build } from "esbuild";
const b = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/color/operations/color-mode.ts";export * from "./packages/editor-core/src/canvas/raster/index.ts";export * from "./packages/editor-core/src/history/history.ts";export * from "./packages/editor-core/src/timeline/timeline.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const m = await import(
  "data:text/javascript;base64," + Buffer.from(b.outputFiles[0].contents).toString("base64")
);
const p0 = [
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 0, 0, 0],
  ],
  p1 = [
    [0, 0, 255, 255],
    [0, 255, 0, 255],
    [0, 0, 0, 0],
  ],
  pixels = (colors) => ({
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([...colors[0], ...colors[0]]),
  }),
  a = pixels(p0),
  b1 = pixels(p1),
  raw = { depth: 8, width: 2, height: 1, data: new Uint8Array([0, 0]) };
const doc = {
  name: "Dup",
  width: 4,
  height: 2,
  palette: p0,
  selection: null,
  layer: { name: "Layer", visible: true, locked: false, opacity: 255, pixels: a, x: 0, y: 0 },
  timeline: {
    colorDepth: 8,
    transparentIndex: 2,
    activeFrame: 0,
    activeLayer: 0,
    layers: [{ id: "l", name: "Layer", visible: true, locked: false, opacity: 255, flags: 3 }],
    frames: [
      {
        duration: 100,
        palette: p0,
        cels: [{ pixels: a, asepriteSamples: raw, x: 0, y: 0, opacity: 255, zIndex: 0 }],
      },
      {
        duration: 100,
        palette: p1,
        cels: [{ pixels: b1, asepriteSamples: raw, x: 0, y: 0, opacity: 255, zIndex: 0 }],
      },
    ],
  },
};
const h = new m.EditorHistory();
h.reset();
h.begin(doc);
let writes = 0;
const w = m.createAsepriteIndexWriter(doc, 1);
const result = m.paintStroke(doc.layer.pixels, [{ x: 0, y: 0 }], {
  color: p0[1],
  brush: { shape: "square", size: 1, angle: 0 },
  indexedPixelWriter: w,
  beforeWrite: (r) => {
    writes++;
    h.capture(doc.layer.pixels, r);
  },
});
assert.ok(result.dirty);
assert.equal(writes, 1);
assert.equal(raw.data[0], 0, "source bytes immutable");
assert.equal(doc.timeline.frames[0].cels[0].asepriteSamples.data[0], 1);
assert.deepEqual(doc.timeline.frames[1].cels[0].pixels.data.slice(0, 4), p1[1]);
m.syncTimeline(doc);
m.normalizeAsepriteDocument(doc);
h.commit(doc);
assert.equal(h.dirty, true);
h.undo(doc);
assert.equal(doc.timeline.frames[0].cels[0].asepriteSamples.data[0], 0);
assert.deepEqual(doc.timeline.frames[1].cels[0].pixels.data.slice(0, 4), p1[0]);
h.redo(doc);
assert.equal(doc.timeline.frames[0].cels[0].asepriteSamples.data[0], 1);
// Growing a cel retains old duplicate indices at shifted positions, including links.
h.begin(doc);
const before = doc.layer.pixels,
  wide = { width: 3, height: 1, data: new Uint8ClampedArray(12) };
wide.data.set(before.data, 4);
doc.layer = { ...doc.layer, pixels: wide, x: -1 };
const grow = m.createAsepriteIndexWriter(doc, 1);
m.paintStroke(wide, [{ x: 0, y: 0 }], {
  color: p0[1],
  brush: { shape: "square", size: 1, angle: 0 },
  indexedPixelWriter: grow,
  beforeWrite: (r) => h.capture(wide, r),
});
m.syncTimeline(doc);
m.normalizeAsepriteDocument(doc);
h.commit(doc);
assert.deepEqual([...doc.timeline.frames[0].cels[0].asepriteSamples.data], [1, 1, 0]);
assert.equal(doc.timeline.frames[1].cels[0].x, -1);
h.undo(doc);
assert.deepEqual([...doc.timeline.frames[0].cels[0].asepriteSamples.data], [1, 0]);
assert.equal(doc.timeline.frames[1].cels[0].x, 0);
console.log(
  "Aseprite indexed editing: same-RGBA duplicate index is dirty/history-visible, immutable oldbytes, differently-paletted links updated, undo/redo exact, cel growth retains duplicate indices+linked origins.",
);
