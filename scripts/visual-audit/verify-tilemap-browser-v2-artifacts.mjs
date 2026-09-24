import assert from "node:assert/strict";
import fs from "node:fs";

import { build } from "esbuild";
import { PNG } from "pngjs";
const dir = ".tmp/tilemap-v2/browser/";
const bundled = await build({
  entryPoints: ["packages/editor-core/src/import-export/aseprite/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const codec = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`
);
const read = (name) => codec.decodeAsepriteSync(fs.readFileSync(dir + name + ".aseprite"));
const original = read("aseprite-input"),
  edited = read("edited"),
  trimmed = read("trimmed"),
  flipped = read("flipped-selection");
assert.equal(edited.width, 12);
assert.equal(edited.height, 12);
assert.equal(edited.layers[0].type, "tilemap");
assert.equal(edited.frames[0].cels[0].type, "tilemap");
const set = edited.tilesets[0];
assert.equal(set.tileWidth, 4);
assert.equal(set.tileHeight, 4);
assert.equal(set.tileCount, 5);
assert.deepEqual([...edited.frames[0].cels[0].tilemap.tiles], [1, 2, 4, 3]);
const source = PNG.sync.read(fs.readFileSync(dir + "aseprite-input.png")),
  aseprite = PNG.sync.read(fs.readFileSync(dir + "aseprite-reopened.png"));
assert.equal(aseprite.width, 12);
assert.equal(aseprite.height, 12);
for (let y = 0; y < 12; y++)
  for (let x = 0; x < 12; x++) {
    const a = (Math.floor(y / 2) * 6 + Math.floor(x / 2)) * 4,
      b = (y * 12 + x) * 4;
    assert.equal(aseprite.data[b + 3], source.data[a + 3]);
    if (source.data[a + 3])
      for (let c = 0; c < 3; c++) assert.equal(aseprite.data[b + c], 255 - source.data[a + c]);
  }
const atlas = PNG.sync.read(fs.readFileSync(dir + "tileset.png")),
  json = JSON.parse(fs.readFileSync(dir + "tileset.json"));
assert.equal(atlas.width, 20);
assert.equal(atlas.height, 4);
const frames = Object.values(json.frames);
assert.equal(frames.length, 5);
for (let tile = 0; tile < 5; tile++) {
  assert.deepEqual(frames[tile].frame, { x: tile * 4, y: 0, w: 4, h: 4 });
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++)
      for (let c = 0; c < 4; c++) {
        const ai = (y * 20 + tile * 4 + x) * 4 + c,
          ti = (tile * 16 + y * 4 + x) * 4 + c;
        if (c === 3 || set.pixels[ti - c + 3]) assert.equal(atlas.data[ai], set.pixels[ti]);
      }
}
assert.equal(trimmed.width, 6);
assert.equal(trimmed.height, 6);
assert.equal(trimmed.frames[0].cels[0].tilemap.width, 1);
assert.equal(trimmed.frames[0].cels[0].tilemap.height, 1);
assert.deepEqual([...trimmed.frames[0].cels[0].tilemap.tiles], [1]);
assert.deepEqual(trimmed.tilesets, edited.tilesets);
assert.deepEqual(flipped.tilesets, edited.tilesets);
assert.deepEqual([...flipped.frames[0].cels[0].tilemap.tiles].filter(Boolean), [2, 1, 3, 4]);
const pixels = (name) => PNG.sync.read(fs.readFileSync(dir + name + "-canvas.png")).data;
const changed = (a, b) => a.reduce((n, v, i) => n + (v !== b[i]), 0);
const before = pixels("01-original"),
  rotated = pixels("02-rotated"),
  rotationUndo = pixels("03-rotation-undo"),
  resized = pixels("04-resized"),
  inverted = pixels("05-inverted"),
  invertUndo = pixels("06-invert-undo"),
  invertRedo = pixels("07-invert-redo"),
  reopened = pixels("08-reopened");
assert.ok(changed(before, rotated) > 0);
assert.equal(changed(before, rotationUndo), 0);
assert.ok(changed(resized, inverted) > 0);
assert.equal(changed(resized, invertUndo), 0);
assert.equal(changed(inverted, invertRedo), 0);
assert.equal(changed(inverted, reopened), 0);
const report = {
  fixture: { width: original.width, height: original.height, depth: original.depth },
  download: {
    width: edited.width,
    height: edited.height,
    tileWidth: set.tileWidth,
    tileHeight: set.tileHeight,
    tileCount: set.tileCount,
  },
  atlas: { width: atlas.width, height: atlas.height, frames: frames.length },
  canvasDifferentBytes: {
    rotation: changed(before, rotated),
    rotationUndo: 0,
    invert: changed(resized, inverted),
    invertUndo: 0,
    invertRedo: 0,
    reopen: 0,
  },
  checks: [
    "Aseprite CLI reopened pixels equal 2x nearest resize plus RGB invert",
    "download retains Tilemap layer and tile references",
    "tileset atlas pixels and JSON rectangles match downloaded Tileset",
    "trim intersects whole tiles and preserves Tileset",
    "Tiles-mode selection flip reverses references and preserves Tileset",
  ],
  passed: true,
};
fs.writeFileSync(dir + "verification.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
