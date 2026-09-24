import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

import { build } from "esbuild";

import { resolveAsepriteExecutable, resolveAsepriteSource } from "../../base/reference-paths.mjs";
const bundled = await build({
  entryPoints: ["packages/editor-core/src/import-export/aseprite/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  write: false,
  logLevel: "silent",
});
const codec = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`
);
const layer = {
  index: 0,
  type: "tilemap",
  flags: 3,
  visible: true,
  editable: true,
  locked: false,
  background: false,
  collapsed: false,
  reference: false,
  continuous: false,
  name: "Map",
  childLevel: 0,
  blendMode: 0,
  opacity: 255,
  defaultWidth: 0,
  defaultHeight: 0,
  tilesetIndex: 7,
};
const header = {
  fileSize: 0,
  magic: 0xa5e0,
  speed: 100,
  next: 0,
  frit: 0,
  transparentIndex: 0,
  ncolors: 3,
  pixelWidth: 1,
  pixelHeight: 1,
  gridX: 0,
  gridY: 0,
  gridWidth: 2,
  gridHeight: 3,
  ignore: [0, 0, 0],
};
const sprite = {
  width: 8,
  height: 6,
  depth: 32,
  flags: 1,
  format: "aseprite",
  header,
  layers: [layer],
  tags: [],
  chunks: [],
  tilesets: [
    {
      id: 7,
      flags: 6,
      name: "Terrain",
      tileWidth: 2,
      tileHeight: 3,
      tileCount: 3,
      baseIndex: 1,
      pixels: Uint8Array.from({ length: 72 }, (_, i) => (i < 24 ? 0 : i % 4 === 3 ? 255 : i)),
      userData: { text: "shared set" },
      tileUserData: [{}, { text: "grass" }, { color: [1, 2, 3, 4] }],
    },
  ],
  frames: [
    {
      index: 0,
      duration: 100,
      cels: [
        {
          layerIndex: 0,
          x: -2,
          y: 3,
          opacity: 255,
          zIndex: 0,
          type: "tilemap",
          rawType: 3,
          width: 4,
          height: 2,
          tilemap: {
            width: 4,
            height: 2,
            tiles: Uint32Array.from([
              0xc0000001, 1, 0x80000001, 0x40000001, 0x20000002, 0xe0000002, 0xa0000001, 0x60000002,
            ]),
          },
        },
      ],
    },
    {
      index: 1,
      duration: 90,
      cels: [
        {
          layerIndex: 0,
          x: 0,
          y: 0,
          opacity: 255,
          zIndex: 0,
          type: "linked",
          rawType: 1,
          width: 4,
          height: 2,
          linkedFrame: 0,
        },
      ],
    },
  ],
};
function compare(a, b) {
  assert.deepEqual(b.tilesets, a.tilesets);
  for (let i = 0; i < a.frames.length; i++)
    for (let j = 0; j < a.frames[i].cels.length; j++) {
      const before = a.frames[i].cels[j],
        after = b.frames[i].cels[j];
      assert.equal(
        after.type === "raw" ? "compressed" : after.type,
        before.type === "raw" ? "compressed" : before.type,
      );
      assert.equal(after.x, before.x);
      assert.equal(after.y, before.y);
      if (before.tilemap) assert.deepEqual(after.tilemap, before.tilemap);
    }
}
const bytes = codec.encodeAsepriteSync(sprite);
assert.equal(codec.preflightAseprite(bytes).ok, true);
const decoded = codec.decodeAsepriteSync(bytes);
compare(sprite, decoded);
const externalSprite = structuredClone(sprite);
externalSprite.tilesets[0].flags = 5;
externalSprite.tilesets[0].pixels = new Uint8Array(externalSprite.tilesets[0].pixels.length);
externalSprite.tilesets[0].external = { fileId: 19, tilesetId: 4, fileName: "terrain.aseprite" };
const externalBytes = codec.encodeAsepriteSync(externalSprite);
assert.equal(codec.preflightAseprite(externalBytes).ok, true);
const externalRoundTrip = codec.decodeAsepriteSync(externalBytes);
assert.deepEqual(externalRoundTrip.tilesets[0].external, externalSprite.tilesets[0].external);
assert.equal(externalRoundTrip.tilesets[0].flags & 3, 1);
assert.deepEqual(
  codec.decodeAsepriteSync(codec.encodeAsepriteSync(externalRoundTrip)).tilesets[0].external,
  externalSprite.tilesets[0].external,
);
assert.equal(decoded.frames[1].cels[0].tilemap, decoded.frames[0].cels[0].tilemap);
compare(
  decoded,
  await codec.decodeAseprite(
    await codec.encodeAseprite(decoded, { compress: true, deflate: (bytes) => deflateSync(bytes) }),
    { inflate: (bytes) => inflateSync(bytes) },
  ),
);
for (const depth of [8, 16]) {
  const asepriteSprite = structuredClone(sprite);
  asepriteSprite.depth = depth;
  asepriteSprite.palette = {
    entries: [
      { red: 0, green: 0, blue: 0, alpha: 0 },
      { red: 255, green: 0, blue: 0, alpha: 255 },
      { red: 0, green: 128, blue: 255, alpha: 255 },
    ],
  };
  asepriteSprite.tilesets[0].asepritePixels = Uint8Array.from(
    { length: 18 * (depth / 8) },
    (_, i) => (depth === 8 ? Math.floor(i / 6) : i % 2 ? 255 : Math.floor(i / 12) * 120),
  );
  const result = codec.decodeAsepriteSync(codec.encodeAsepriteSync(asepriteSprite));
  assert.deepEqual(result.tilesets[0].asepritePixels, asepriteSprite.tilesets[0].asepritePixels);
  assert.equal(result.tilesets[0].pixels.length, 72);
  compare(result, codec.decodeAsepriteSync(codec.encodeAsepriteSync(result)));
}
function chunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    out = [];
  let frame = 128;
  while (frame < bytes.length) {
    let pos = frame + 16,
      end = frame + view.getUint32(frame, true);
    while (pos < end) {
      out.push({ pos, type: view.getUint16(pos + 4, true), size: view.getUint32(pos, true) });
      pos += view.getUint32(pos, true);
    }
    frame = end;
  }
  return out;
}
const table = chunks(bytes),
  ts = table.find((c) => c.type === 0x2023),
  cel = table.find((c) => c.type === 0x2005);
const managementFile = externalBytes.slice(),
  externalChunk = chunks(managementFile).find((c) => c.type === 0x2008);
managementFile[externalChunk.pos + 22] = 3;
assert.equal(codec.preflightAseprite(managementFile).ok, false);
// Nonstandard mask positions normalize to canonical indices and flip bits.
const remapped = bytes.slice(cel.pos, cel.pos + cel.size),
  rv = new DataView(remapped.buffer),
  headerEnd = 6 + 16 + 4 + 2 + 16 + 10;
rv.setUint32(6 + 16 + 4 + 2, 0x1ffffff0, true);
rv.setUint32(6 + 16 + 4 + 6, 1, true);
rv.setUint32(6 + 16 + 4 + 10, 2, true);
rv.setUint32(6 + 16 + 4 + 14, 4, true);
const raw = new Uint8Array(32),
  rawView = new DataView(raw.buffer);
sprite.frames[0].cels[0].tilemap.tiles.forEach((v, i) =>
  rawView.setUint32(
    i * 4,
    ((v & 0x1fffffff) << 4) |
      (v & 0x80000000 ? 1 : 0) |
      (v & 0x40000000 ? 2 : 0) |
      (v & 0x20000000 ? 4 : 0),
    true,
  ),
);
const packed = deflateSync(raw),
  delta = headerEnd + packed.length - cel.size,
  custom = new Uint8Array(bytes.length + delta);
custom.set(bytes.subarray(0, cel.pos));
custom.set(remapped.subarray(0, headerEnd), cel.pos);
custom.set(packed, cel.pos + headerEnd);
custom.set(bytes.subarray(cel.pos + cel.size), cel.pos + headerEnd + packed.length);
const cv = new DataView(custom.buffer);
cv.setUint32(cel.pos, headerEnd + packed.length, true);
cv.setUint32(0, custom.length, true);
cv.setUint32(128, cv.getUint32(128, true) + delta, true);
assert.deepEqual(
  codec.decodeAsepriteSync(custom).frames[0].cels[0].tilemap,
  sprite.frames[0].cels[0].tilemap,
);
const external = bytes.slice();
new DataView(external.buffer).setUint32(ts.pos + 10, 7, true);
assert.equal(codec.preflightAseprite(external).ok, false);
assert.throws(() => codec.decodeAsepriteSync(external));
const huge = bytes.slice();
new DataView(huge.buffer).setUint32(ts.pos + 14, 0x7fffffff, true);
assert.equal(codec.preflightAseprite(huge).ok, false);
const badMask = bytes.slice();
new DataView(badMask.buffer).setUint32(cel.pos + 6 + 16 + 4 + 2, 0xffffffff, true);
assert.equal(codec.preflightAseprite(badMask).ok, false);
const corrupt = bytes.slice();
corrupt[ts.pos + ts.size - 1] ^= 1;
assert.throws(() => codec.decodeAsepriteSync(corrupt));
assert.throws(() => codec.decodeAsepriteSync(bytes.slice(0, -1)));
assert.throws(() => codec.decodeAsepriteSync(bytes, { limits: { maxDecodedBytes: 10 } }));
const invalid = structuredClone(sprite);
invalid.frames[0].cels[0].tilemap.tiles[0] = 99;
assert.throws(() => codec.encodeAsepriteSync(invalid));
// Real Aseprite fixtures are optional so the portable suite also runs in CI.
const fixtures = [
  "2x2tilemap2x2tile.aseprite",
  "2x3tilemap-indexed.aseprite",
  "3x2tilemap-grayscale.aseprite",
];
let asepriteFixtureCount = 0;
for (const name of fixtures) {
  const fixturePath = path.join(resolveAsepriteSource(), "tests/sprites", name);
  if (!fs.existsSync(fixturePath)) continue;
  const input = fs.readFileSync(fixturePath);
  assert.equal(codec.preflightAseprite(input).ok, true, name);
  const model = codec.decodeAsepriteSync(input);
  const roundTrip = codec.decodeAsepriteSync(codec.encodeAsepriteSync(model));
  compare(model, roundTrip);
  assert.ok(model.tilesets.length);
  asepriteFixtureCount++;
  console.log(`Aseprite fixture roundtrip: ${name}`);
}
const asepriteExecutable = resolveAsepriteExecutable();
if (fs.existsSync(asepriteExecutable)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tilemap-codec-"));
  try {
    const input = path.join(dir, "input.aseprite"),
      output = path.join(dir, "output.aseprite");
    fs.writeFileSync(input, bytes);
    execFileSync(asepriteExecutable, ["-b", input, "--save-as", output]);
    const asepriteOutput = codec.decodeAsepriteSync(fs.readFileSync(output));
    assert.deepEqual(asepriteOutput.frames[0].cels[0].tilemap, sprite.frames[0].cels[0].tilemap);
    assert.deepEqual(asepriteOutput.tilesets[0].pixels, sprite.tilesets[0].pixels);
    assert.deepEqual(asepriteOutput.tilesets[0].tileUserData, sprite.tilesets[0].tileUserData);
    console.log(
      "Aseprite CLI reopened and saved generated tilemap: grid, pixels and tile metadata verified",
    );
    const externalInput = path.join(dir, "external-input.aseprite"),
      externalOutput = path.join(dir, "external-output.aseprite");
    const referenced = structuredClone(sprite);
    referenced.tilesets[0].id = 4;
    referenced.layers[0].tilesetIndex = 4;
    fs.writeFileSync(path.join(dir, "terrain.aseprite"), codec.encodeAsepriteSync(referenced));
    fs.writeFileSync(externalInput, externalBytes);
    execFileSync(asepriteExecutable, ["-b", externalInput, "--save-as", externalOutput]);
    let asepriteExternal;
    try {
      asepriteExternal = codec.decodeAsepriteSync(fs.readFileSync(externalOutput));
    } catch (error) {
      throw new Error(
        `Aseprite external Tileset output failed to decode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    assert.equal(
      asepriteExternal.tilesets[0].external.fileName,
      externalSprite.tilesets[0].external.fileName,
    );
    assert.equal(
      asepriteExternal.tilesets[0].external.tilesetId,
      externalSprite.tilesets[0].external.tilesetId,
    );
    assert.equal(
      asepriteExternal.tilesets[0].flags & 2,
      0,
      "Aseprite save keeps external-only Tileset without embedding pixels",
    );
    console.log("Aseprite CLI reopened and saved external Tileset references");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
console.log(
  `Tilemap codec verified: RGB/indexed/grayscale, linked cels, eight flip combinations, metadata, sync recovery, invalid masks/indices/checksum/limits; ${asepriteFixtureCount} Aseprite fixtures`,
);
