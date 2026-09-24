import assert from "node:assert/strict";

import { build } from "esbuild";
const b = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/clipboard/image.ts";export * from "./packages/editor-core/src/import-export/aseprite/profile-clipboard.ts";export * from "./packages/editor-core/src/import-export/aseprite/project.ts";export * from "./packages/editor-core/src/import-export/aseprite/index.ts";export * from "./packages/editor-core/src/selection/transform.ts";',
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
    [0, 0, 255, 255],
    [0, 0, 0, 0],
  ],
  pixels = {
    width: 4,
    height: 1,
    data: new Uint8ClampedArray([...palette[2], ...palette[1], ...palette[0], ...palette[2]]),
  },
  asepriteSamples = { depth: 8, width: 4, height: 1, data: new Uint8Array([2, 1, 0, 2]) };
const doc = {
  name: "Indexed",
  width: 4,
  height: 1,
  palette,
  selection: { x: 1, y: 0, width: 3, height: 1, data: new Uint8Array([255, 255, 255]) },
  layer: { name: "L", visible: true, locked: false, x: 0, y: 0, pixels },
  timeline: {
    colorDepth: 8,
    transparentIndex: 3,
    activeFrame: 0,
    activeLayer: 0,
    layers: [{ id: "l", name: "L", visible: true, locked: false, opacity: 255, flags: 3 }],
    frames: [
      {
        duration: 100,
        palette,
        cels: [{ pixels, asepriteSamples, x: 0, y: 0, opacity: 255, zIndex: 0 }],
      },
    ],
  },
};
const copied = m.copyDocumentSelection(doc);
assert.deepEqual([...copied.asepriteSamples.data], [1, 0, 2]);
const clone = m.cloneClipboardImage(copied);
clone.asepriteSamples.data[0] = 0;
assert.equal(copied.asepriteSamples.data[0], 1);
assert.equal(asepriteSamples.data[1], 1);
const prepared = m.prepareImageClipboardForDocument(copied, doc);
assert.deepEqual([...prepared.asepriteSamples.data], [1, 0, 2]);
const transform = {
  source: prepared.pixels,
  mask: { ...copied.mask, x: 0, y: 0 },
  bounds: { x: 0, y: 0, width: 6, height: 2 },
  angle: 0,
  copy: true,
};
const scaled = m.transformClipboardAsepriteSamples(prepared.asepriteSamples, transform, 3);
assert.deepEqual([...scaled.data], [1, 1, 0, 0, 2, 2, 1, 1, 0, 0, 2, 2]);
const rotated = m.transformClipboardAsepriteSamples(
  prepared.asepriteSamples,
  { ...transform, bounds: { x: 0, y: 0, width: 3, height: 1 }, angle: Math.PI / 2 },
  3,
);
assert.equal(rotated.width, 1);
assert.equal(rotated.height, 3);
assert.deepEqual([...rotated.data], [1, 0, 2]);
const project = m.projectFromClipboardImage(copied),
  sprite = m.asepriteFromProject(project);
assert.equal(sprite.depth, 8);
assert.equal(sprite.header.transparentIndex, 3);
assert.deepEqual([...sprite.frames[0].cels[0].asepritePixels], [1, 0, 2]);
const reopened = m.projectFromAseprite(m.decodeAsepriteSync(m.encodeAsepriteSync(sprite)));
assert.deepEqual([...reopened.timeline.frames[0].cels[0].asepriteSamples.data], [1, 0, 2]);
assert.deepEqual(reopened.image.data, copied.pixels.data);
console.log(
  "Aseprite image clipboard: raw selection crop+ownership, duplicate slots survive target preparation, nearest scale/90rotation exact Aseprite bytes, PasteNewSprite project retains8bit+mask index and ASE roundtrip.",
);
