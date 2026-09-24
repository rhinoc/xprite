import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { build } from "esbuild";
async function load(path) {
  const { outputFiles } = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
  );
}
const { renderExportAnimation, exportFrameOrder, sequenceFilename } = await load(
  "packages/editor-core/src/import-export/image/export-animation.ts",
);
const { encodeGif, encodeApng } = await load(
  "packages/editor-core/src/import-export/image/encoders.ts",
);
const { renderSpriteSheet, defaultSpriteSheetOptions } = await load(
  "packages/editor-core/src/import-export/image/export-sheet.ts",
);
const { importSpriteSheet, importSpriteSheetData, applyImportSpriteSheet } = await load(
  "packages/editor-core/src/import-export/image/import-sprite-sheet.ts",
);
const { exportDocumentAnimation, repeatLastExport } = await load(
  "apps/editor/src/managers/files/export-animation.ts",
);
const { DocumentPreferencesManager } = await load(
  "apps/editor/src/managers/preferences/document-preferences.ts",
);
const { lastDocumentExport } = await load("apps/editor/src/managers/files/export-preferences.ts");
const output = ".tmp/features-7-12/export-delivery";
fs.mkdirSync(output, { recursive: true });
const exportFile = (name) => `${output}/${name}`;
const pixels = (w, h, color) => ({
  width: w,
  height: h,
  data: new Uint8ClampedArray(Array.from({ length: w * h }, () => color).flat()),
});
const images = [
  pixels(3, 2, [255, 0, 0, 255]),
  pixels(3, 2, [0, 0, 255, 255]),
  pixels(3, 2, [0, 255, 0, 255]),
];
images[1].data.set([0, 0, 0, 0], 0);
images[2].data.set([255, 255, 0, 128], 4);
const t = {
  activeFrame: 0,
  activeLayer: 0,
  layers: [
    { id: "layer-1", name: "Layer 1", visible: true, locked: false, opacity: 255, flags: 3 },
  ],
  frames: images.map((pixels, i) => ({
    duration: [100, 170, 230][i],
    cels: [{ pixels, x: 0, y: 0, opacity: 255, zIndex: 0 }],
  })),
  tags: [{ name: "Walk", from: 0, to: 2, direction: "forward", repeat: 2, color: [255, 0, 0] }],
};
const doc = {
  id: 1,
  name: "walk.aseprite",
  width: 3,
  height: 2,
  layer: { ...t.layers[0], pixels: images[0], x: 0, y: 0 },
  selection: null,
  timeline: t,
};
const o = {
  name: "walk.gif",
  scalePercent: 100,
  area: "canvas",
  layers: "visible",
  frame: 0,
  frames: "all",
  direction: "forward",
};
assert.deepEqual(exportFrameOrder(doc, { ...o, direction: "ping-pong" }), [0, 1, 2, 1]);
assert.deepEqual(exportFrameOrder(doc, { ...o, direction: "ping-pong-reverse" }), [2, 1, 0, 1]);
assert.deepEqual(
  exportFrameOrder(doc, { ...o, frames: "tag:Walk", playSubtags: true }),
  [0, 1, 2, 0, 1, 2],
);
assert.equal(sequenceFilename("walk.png", 0, 3), "walk1.png");
assert.equal(sequenceFilename("walk007.png", 2, 3), "walk009.png");
const frames = renderExportAnimation(doc, o);
assert.equal(frames[1].duration, 170);
assert.deepEqual([...frames[1].pixels.data], [...images[1].data]);
const before = JSON.stringify(doc, (_, v) => (ArrayBuffer.isView(v) ? [...v] : v));
fs.writeFileSync(exportFile("export-test.gif"), encodeGif(frames));
fs.writeFileSync(exportFile("export-test.apng"), encodeApng(frames));
fs.writeFileSync(exportFile("export-test-interlaced.gif"), encodeGif(frames, { interlaced: true }));
// Independent decoder validates container/LZW/DEFLATE/disposal and timing.
const py = spawnSync(
  "python3",
  [
    "-c",
    `from PIL import Image
import json
result={}
for name in ['export-test.gif','export-test.apng','export-test-interlaced.gif']:
 im=Image.open('${output}/'+name)
 frames=[]
 for i in range(im.n_frames):
  im.seek(i); frames.append({'duration':im.info.get('duration'),'pixels':list(im.convert('RGBA').getdata())})
 result[name]=frames
print(json.dumps(result))`,
  ],
  { encoding: "utf8" },
);
if (py.status) throw Error(py.stderr);
const decoded = JSON.parse(py.stdout);
for (const key of Object.keys(decoded)) {
  assert.equal(decoded[key].length, 3);
  assert.equal(decoded[key][1].duration, 170);
  assert.deepEqual(decoded[key][1].pixels[0], [0, 0, 0, 0]);
  assert.deepEqual(decoded[key][0].pixels[0], [255, 0, 0, 255]);
}
assert.deepEqual(decoded["export-test.apng"][2].pixels[1], [255, 255, 0, 128]);
// Exercise multiple dictionary resets, tall interlaced row traversal, and >255 colors.
const gradient = pixels(32, 32, [0, 0, 0, 255]);
for (let i = 0; i < 1024; i++) {
  gradient.data[i * 4] = i % 256;
  gradient.data[i * 4 + 1] = (i * 11) % 256;
  gradient.data[i * 4 + 2] = Math.floor(i / 4);
}
fs.writeFileSync(
  exportFile("export-test-large.gif"),
  encodeGif([{ pixels: gradient, duration: 120, sourceFrame: 0 }], { interlaced: true }),
);
const large = spawnSync(
  "python3",
  [
    "-c",
    `from PIL import Image; im=Image.open('${exportFile("export-test-large.gif")}'); im.load(); assert im.size==(32,32)`,
  ],
  { encoding: "utf8" },
);
assert.equal(large.status, 0, large.stderr);
for (const layout of ["horizontal", "vertical", "rows", "columns", "packed"]) {
  const options = {
    ...defaultSpriteSheetOptions(doc),
    layout,
    trimCels: true,
    extrude: true,
    borderPadding: 2,
    shapePadding: 1,
    dataFormat: "array",
  };
  const sheet = renderSpriteSheet(doc, options);
  assert.equal(sheet.samples.length, 3);
  for (const frame of sheet.samples) {
    assert.ok(frame.frame.x >= 2 && frame.frame.y >= 2);
    assert.ok(frame.frame.x + frame.frame.w <= sheet.pixels.width);
  }
  const imported = importSpriteSheetData(sheet.pixels, sheet.data);
  assert.equal(imported.timeline.frames.length, 3);
  assert.equal(imported.timeline.frames[2].duration, 230);
}
const dup = { ...doc, timeline: { ...t, frames: [t.frames[0], t.frames[0], t.frames[0]] } };
const merged = renderSpriteSheet(dup, {
  ...defaultSpriteSheetOptions(doc),
  mergeDuplicates: true,
  dataFormat: "array",
});
assert.equal(merged.pixels.width, 3);
assert.deepEqual(merged.samples[0].frame, merged.samples[2].frame);
const plain = renderSpriteSheet(doc, { ...defaultSpriteSheetOptions(doc), layout: "horizontal" });
const imported = importSpriteSheet(plain.pixels, {
  layout: "horizontal",
  x: 0,
  y: 0,
  width: 3,
  height: 2,
  columns: 3,
  rows: 1,
  paddingEnabled: false,
  horizontalPadding: 0,
  verticalPadding: 0,
  partialTiles: false,
});
assert.equal(imported.timeline.frames.length, 3);
assert.deepEqual([...imported.timeline.frames[1].cels[0].pixels.data], [...images[1].data]);
const importDoc = { ...doc, layer: { ...doc.layer }, timeline: { ...t } };
applyImportSpriteSheet(importDoc, {
  layout: "rows",
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  columns: 3,
  rows: 2,
  paddingEnabled: false,
  horizontalPadding: 0,
  verticalPadding: 0,
  partialTiles: false,
});
assert.equal(importDoc.id, 1);
assert.equal(importDoc.width, 1);
assert.equal(importDoc.timeline.frames.length, 6);
assert.equal(importDoc.timeline.layers.length, 1);
assert.equal(importDoc.timeline.layers[0].name, "Sprite Sheet");
assert.equal(
  JSON.stringify(doc, (_, v) => (ArrayBuffer.isView(v) ? [...v] : v)),
  before,
  "source document remains untouched",
);
const { RasterEditor } = await load("packages/editor-core/src/editor/RasterEditor.ts");
const editor = new RasterEditor();
const originalTimeline = structuredClone(t);
originalTimeline.layers.push({ ...originalTimeline.layers[0], id: "layer-2", name: "Second" });
originalTimeline.frames = originalTimeline.frames.map((frame) => ({
  ...frame,
  cels: [...frame.cels, null],
}));
editor.loadTimeline(originalTimeline, 3, 2, "source.aseprite");
editor.importSpriteSheet({
  layout: "rows",
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  columns: 3,
  rows: 2,
  paddingEnabled: false,
  horizontalPadding: 0,
  verticalPadding: 0,
  partialTiles: false,
});
assert.equal(editor.getSnapshot().document.width, 1);
assert.equal(editor.getSnapshot().document.timeline.layers.length, 1);
assert.equal(editor.getSnapshot().document.timeline.frames.length, 6);
editor.undo();
assert.equal(editor.getSnapshot().document.width, 3);
assert.equal(editor.getSnapshot().document.height, 2);
assert.equal(editor.getSnapshot().document.timeline.layers.length, 2);
assert.equal(editor.getSnapshot().document.timeline.frames.length, 3);
assert.equal(editor.getSnapshot().dirty, false);
editor.redo();
assert.equal(editor.getSnapshot().document.timeline.layers[0].name, "Sprite Sheet");
assert.equal(editor.getSnapshot().document.timeline.frames.length, 6);

const values = new Map();
const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
const preferences = new DocumentPreferencesManager(storage);
const rememberExport = (record) => preferences.setExport("slot-a", record);
const getLastExport = () => lastDocumentExport(preferences.get("slot-a").exports ?? {});
let saved = [];
await exportDocumentAnimation(doc, o, {
  rememberExport,
  storage,
  save: async (a) => saved.push(a),
});
assert.equal(saved[0].blob.type, "image/gif");
assert.equal(getLastExport().options.name, "walk.gif");
assert.equal(lastDocumentExport(preferences.get("slot-b").exports ?? {}), null);
await repeatLastExport(doc, {
  rememberExport,
  getLastExport,
  storage,
  save: async (a) => saved.push(a),
});
assert.equal(saved.length, 2);
assert.throws(
  () =>
    renderSpriteSheet(doc, {
      ...defaultSpriteSheetOptions(doc),
      constraint: "size",
      constraintWidth: 1,
      constraintHeight: 1,
    }),
  /fit|constraint/,
);
// Parameter combinations are executable, not only UI flags.
const empty = pixels(3, 2, [0, 0, 0, 0]);
const combo = {
  ...doc,
  selection: { x: 1, y: 0, width: 1, height: 1, data: new Uint8Array([255]) },
  timeline: {
    ...t,
    range: { kind: "frames", frames: [1, 2], layers: [0] },
    asepriteSource: { header: { pixelWidth: 2, pixelHeight: 3 } },
    frames: [
      t.frames[0],
      { duration: 170, cels: [{ pixels: empty, x: 0, y: 0, opacity: 255, zIndex: 0 }] },
      t.frames[2],
    ],
  },
};
const combined = renderExportAnimation(combo, {
  ...o,
  name: "combo.apng",
  frames: "selected",
  direction: "reverse",
  playSubtags: true,
  ignoreEmpty: true,
  pixelRatio: true,
  scalePercent: 200,
  area: "selection",
});
assert.deepEqual(
  combined.map((f) => f.sourceFrame),
  [2],
);
assert.equal(combined[0].pixels.width, 4);
assert.equal(combined[0].pixels.height, 6);
assert.equal(combined[0].duration, 230);
assert.throws(
  () =>
    renderExportAnimation(
      {
        ...combo,
        layer: { ...combo.layer, pixels: empty },
        timeline: {
          ...combo.timeline,
          frames: [
            { duration: 100, cels: [{ pixels: empty, x: 0, y: 0, opacity: 255, zIndex: 0 }] },
          ],
        },
      },
      { ...o, ignoreEmpty: true },
    ),
  /nonempty/,
);
const pngFrames = [];
await exportDocumentAnimation(
  doc,
  { ...o, name: "twitter.png", forTwitter: true },
  {
    save: async () => {},
    encodePng: async (p) => {
      pngFrames.push({ ...p, data: p.data.slice() });
      return new Blob(["png"]);
    },
  },
);
assert.equal(pngFrames[0].data.at(-1), 254);
assert.equal(pngFrames[1].data.at(-1), 255);
assert.equal(images[0].data.at(-1), 255);
fs.writeFileSync(exportFile("export-test-twitter.gif"), encodeGif(frames, { forTwitter: true }));
const twitter = spawnSync(
  "python3",
  [
    "-c",
    `from PIL import Image; import json; im=Image.open('${exportFile("export-test-twitter.gif")}'); a=[]; [(im.seek(i),a.append(im.info['duration'])) for i in range(im.n_frames)]; print(json.dumps(a))`,
  ],
  { encoding: "utf8" },
);
assert.equal(twitter.status, 0, twitter.stderr);
assert.deepEqual(JSON.parse(twitter.stdout), [100, 170, 50]);
const paletteFrames = [
  {
    pixels: pixels(1, 1, [255, 0, 0, 255]),
    duration: 100,
    sourceFrame: 0,
    palette: [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
    ],
  },
  {
    pixels: pixels(1, 1, [0, 0, 255, 255]),
    duration: 100,
    sourceFrame: 1,
    palette: [
      [0, 0, 0, 0],
      [0, 0, 255, 255],
    ],
  },
];
fs.writeFileSync(
  exportFile("export-test-palette.gif"),
  encodeGif(paletteFrames, { palette: paletteFrames[0].palette }),
);
const paletteRead = spawnSync(
  "python3",
  [
    "-c",
    `from PIL import Image; import json; im=Image.open('${exportFile("export-test-palette.gif")}'); a=[]; [(im.seek(i),a.append(list(im.convert('RGBA').getpixel((0,0))))) for i in range(im.n_frames)]; print(json.dumps(a))`,
  ],
  { encoding: "utf8" },
);
assert.equal(paletteRead.status, 0, paletteRead.stderr);
assert.deepEqual(JSON.parse(paletteRead.stdout), [
  [255, 0, 0, 255],
  [0, 0, 255, 255],
]);
const { parseSliceChunks, sliceMetadataForExport } = await load(
  "packages/editor-core/src/sprite/slice-metadata.ts",
);
const sliceBytes = new Uint8Array(12 + 2 + 6 + 28),
  sliceView = new DataView(sliceBytes.buffer);
sliceView.setUint32(0, 1, true);
sliceView.setUint32(4, 2, true);
sliceView.setUint16(12, 6, true);
sliceBytes.set(new TextEncoder().encode("button"), 14);
let at = 20;
for (const value of [0, 2, 3, 8, 9, 4, 5]) {
  sliceView.setInt32(at, value, true);
  at += 4;
}
assert.deepEqual(sliceMetadataForExport(parseSliceChunks([{ type: 0x2022, bytes: sliceBytes }])), [
  {
    name: "button",
    keys: [{ frame: 0, bounds: { x: 2, y: 3, w: 8, h: 9 }, pivot: { x: 4, y: 5 } }],
  },
]);
const format = await load("apps/editor/src/managers/files/export-format-preferences.ts");
format.writeGifExportPreferences(
  { dontShow: true, interlaced: true, loop: false, preservePaletteOrder: true },
  storage,
);
assert.deepEqual(format.readGifExportPreferences(storage), {
  dontShow: true,
  interlaced: true,
  loop: false,
  preservePaletteOrder: true,
});
console.log(
  "Export delivery checks pass: independent Pillow GIF/APNG decoding, alpha/disposal/timing/interlace, frame ordering, sheet layouts/dedup/JSON/grid import, source isolation, stable workspace export memory.",
);
