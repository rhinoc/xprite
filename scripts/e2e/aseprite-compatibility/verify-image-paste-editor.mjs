import assert from "node:assert/strict";

import { build } from "esbuild";
const b = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/editor/RasterEditor.ts";export * from "./packages/editor-core/src/import-export/aseprite/profile-clipboard.ts";export * from "./packages/editor-core/src/import-export/aseprite/project.ts";export * from "./packages/editor-core/src/import-export/aseprite/index.ts";',
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
const palette = [
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 0, 255, 128],
    [0, 0, 0, 0],
    [0, 255, 0, 0],
  ],
  indices = [1, 0, 2, 4, 3],
  pixels = { width: 5, height: 1, data: new Uint8ClampedArray(indices.flatMap((i) => palette[i])) },
  timeline = {
    colorDepth: 8,
    transparentIndex: 3,
    composeGroups: false,
    activeFrame: 0,
    activeLayer: 0,
    layers: [{ id: "l", name: "Source", visible: true, locked: false, opacity: 255, flags: 3 }],
    frames: [
      {
        duration: 100,
        palette,
        cels: [
          {
            pixels,
            asepriteSamples: { depth: 8, width: 5, height: 1, data: new Uint8Array(indices) },
            x: 0,
            y: 0,
            opacity: 255,
            zIndex: 0,
          },
        ],
      },
    ],
  };
const e = new m.RasterEditor();
e.loadTimeline(timeline, 12, 4, "Indexed", palette);
e.setSettings({ tool: "marquee", selectionMode: "replace" });
e.pointerDown({ x: 0, y: 0 });
e.pointerUp({ x: 4, y: 0 });
const copy = e.copySelection();
assert.deepEqual([...copy.asepriteSamples.data], indices);
e.addLayer("Target");
e.markSaved();
assert.equal(e.beginImagePaste(copy, { x: 0, y: 0 }), true);
assert.equal(e.beginSelectionTransform("move", { x: 0, y: 0 }), true);
e.pointerMove({ x: 1, y: 1 });
e.pointerUp();
assert.deepEqual([...e.getSnapshot().floatingPaste.asepriteSamples.data], indices);
assert.equal(e.commitFloatingPaste(), true);
const current = () => {
  const t = e.getSnapshot().document.timeline;
  return t.frames[t.activeFrame].cels[t.activeLayer];
};
assert.deepEqual(
  [...current().asepriteSamples.data],
  [1, 0, 2, 4],
  "trim must retain nonmask alpha0 palette index",
);
assert.equal(current().x, 1);
assert.equal(current().y, 1);
assert.deepEqual(
  current().pixels.data.slice(8, 12),
  palette[2],
  "indexed partialalpha is copied, not composed into a different index",
);
assert.equal(e.getSnapshot().dirty, true);
e.undo();
assert.equal(current(), null);
assert.equal(e.getSnapshot().dirty, false);
e.redo();
assert.deepEqual([...current().asepriteSamples.data], [1, 0, 2, 4]);
e.undo();
e.beginImagePaste(copy, { x: 0, y: 0 });
e.beginSelectionTransform("e", { x: 5, y: 0 });
e.pointerMove({ x: 10, y: 0 });
e.pointerUp();
assert.deepEqual(
  [...e.getSnapshot().floatingPaste.asepriteSamples.data],
  [1, 1, 0, 0, 2, 2, 4, 4, 3, 3],
);
e.commitFloatingPaste();
assert.deepEqual([...current().asepriteSamples.data], [1, 1, 0, 0, 2, 2, 4, 4]);
e.undo();
assert.equal(current(), null);
e.redo();
assert.deepEqual([...current().asepriteSamples.data], [1, 1, 0, 0, 2, 2, 4, 4]);
const project = m.projectFromClipboardImage(copy),
  asepriteProject = m.asepriteFromProject(project),
  round = m.projectFromAseprite(m.decodeAsepriteSync(m.encodeAsepriteSync(asepriteProject)));
assert.equal(round.timeline.colorDepth, 8);
assert.equal(round.timeline.transparentIndex, 3);
assert.deepEqual([...round.timeline.frames[0].cels[0].asepriteSamples.data], indices);
console.log(
  "Xprite image clipboard: duplicate indices/nonzero mask/partialalpha/invisible nonmask slots, move+scale commit, exact undo/redo, Aseprite trim and PasteNewSprite project ASE roundtrip pass.",
);
