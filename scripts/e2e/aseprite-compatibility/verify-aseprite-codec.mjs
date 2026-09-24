import assert from "node:assert/strict";
import fs from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";

import { build } from "esbuild";

const root = new URL("../../..", import.meta.url).pathname;
const bundled = await build({
  entryPoints: [`${root}/packages/editor-core/src/import-export/aseprite/index.ts`],
  bundle: true,
  format: "esm",
  platform: "neutral",
  write: false,
  logLevel: "silent",
});
const codec = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`
);

const files = [
  {
    path: "apps/editor/assets/examples/xprite/xprite.ase",
    width: 65,
    height: 49,
    frames: 10,
    layers: 1,
    cels: 10,
  },
];

for (const expected of files) {
  const input = fs.readFileSync(expected.path);
  const preflight = codec.preflightAseprite(input);
  assert.equal(preflight.ok, true, `${expected.path}: preflight failed`);
  const sprite = await codec.decodeAseprite(input, { inflate: (bytes) => inflateSync(bytes) });
  assert.deepEqual(
    [
      sprite.width,
      sprite.height,
      sprite.frames.length,
      sprite.layers.length,
      sprite.frames.reduce((n, frame) => n + frame.cels.length, 0),
    ],
    [expected.width, expected.height, expected.frames, expected.layers, expected.cels],
  );
  assert.ok(sprite.palette?.entries.length);
  assert.ok(sprite.tags.some((tag) => tag.name === "loading"));
  const compressed = await codec.encodeAseprite(sprite, {
    compress: true,
    deflate: (bytes) => deflateSync(bytes),
  });
  const roundTrip = await codec.decodeAseprite(compressed, {
    inflate: (bytes) => inflateSync(bytes),
  });
  assert.equal(roundTrip.frames.length, sprite.frames.length);
  assert.equal(roundTrip.layers.length, sprite.layers.length);
  assert.deepEqual(roundTrip.palette, sprite.palette);
  assert.deepEqual(roundTrip.tags, sprite.tags);
  assert.deepEqual(roundTrip.colorProfile, sprite.colorProfile);
  for (let frame = 0; frame < sprite.frames.length; frame += 1) {
    assert.equal(roundTrip.frames[frame].cels.length, sprite.frames[frame].cels.length);
    for (let cel = 0; cel < sprite.frames[frame].cels.length; cel += 1) {
      const before = sprite.frames[frame].cels[cel];
      const after = roundTrip.frames[frame].cels[cel];
      assert.equal(after.x, before.x);
      assert.equal(after.y, before.y);
      assert.equal(after.zIndex, before.zIndex);
      assert.deepEqual(after.pixels, before.pixels);
    }
  }
  console.log(
    `${expected.path}: ${sprite.width}x${sprite.height}, ${sprite.frames.length} frames, ${expected.cels} cels OK`,
  );
}

// Structural failures are reported before any inflater is invoked.
const xprite = fs.readFileSync(files[0].path);

const legacyChunk = (type, packets) => {
  const payload = [packets.length & 255, (packets.length >>> 8) & 255];
  for (const packet of packets) {
    payload.push(packet.skip & 255, packet.colors.length === 256 ? 0 : packet.colors.length);
    for (const color of packet.colors) payload.push(color[0], color[1], color[2]);
  }
  const size = payload.length + 6;
  return Uint8Array.from([
    size & 255,
    (size >>> 8) & 255,
    (size >>> 16) & 255,
    (size >>> 24) & 255,
    type & 255,
    (type >>> 8) & 255,
    ...payload,
  ]);
};
const insertBeforeChunkType = (bytes, targetType, inserted) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameStart = 128;
  const frameSize = view.getUint32(frameStart, true);
  const frameEnd = frameStart + frameSize;
  let at = frameStart + 16;
  while (at < frameEnd && view.getUint16(at + 4, true) !== targetType)
    at += view.getUint32(at, true);
  assert.ok(at < frameEnd, `chunk 0x${targetType.toString(16)} should exist`);
  const output = new Uint8Array(bytes.length + inserted.length);
  output.set(bytes.subarray(0, at), 0);
  output.set(inserted, at);
  output.set(bytes.subarray(at), at + inserted.length);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(frameStart, frameSize + inserted.length, true);
  outputView.setUint16(frameStart + 6, view.getUint16(frameStart + 6, true) + 1, true);
  outputView.setUint32(0, output.length, true);
  return output;
};
const legacyBase = await codec.decodeAseprite(xprite, {
  inflate: (bytes) => inflateSync(bytes),
});
legacyBase.frames = [legacyBase.frames[0]];
legacyBase.tags = [];
legacyBase.chunks = [];
delete legacyBase.palette;
for (const frame of legacyBase.frames) delete frame.palette;
delete legacyBase.colorProfile;
delete legacyBase.userData;
const noPaletteBytes = codec.encodeAsepriteSync(legacyBase);
const defaultPaletteSprite = await codec.decodeAseprite(noPaletteBytes, {
  inflate: (bytes) => inflateSync(bytes),
});
assert.equal(defaultPaletteSprite.palette.entries.length, legacyBase.header.ncolors);
assert.deepEqual(defaultPaletteSprite.palette.entries[0], {
  red: 0,
  green: 0,
  blue: 0,
  alpha: 255,
});
assert.equal(defaultPaletteSprite.palette.frameIndex, undefined);

const legacySixBit = insertBeforeChunkType(
  noPaletteBytes,
  0x2004,
  legacyChunk(0x000b, [{ skip: 0, colors: [[0, 63, 32]] }]),
);
const sixBitSprite = await codec.decodeAseprite(legacySixBit, {
  inflate: (bytes) => inflateSync(bytes),
});
assert.deepEqual(sixBitSprite.palette.entries[0], { red: 0, green: 255, blue: 130, alpha: 255 });
assert.equal(sixBitSprite.palette.frameIndex, 0);

const legacyDelta = insertBeforeChunkType(
  insertBeforeChunkType(
    noPaletteBytes,
    0x2004,
    legacyChunk(0x0004, [{ skip: 0, colors: [[10, 11, 12]] }]),
  ),
  0x2004,
  legacyChunk(0x0004, [{ skip: 1, colors: [[20, 21, 22]] }]),
);
const deltaSprite = await codec.decodeAseprite(legacyDelta, {
  inflate: (bytes) => inflateSync(bytes),
});
assert.deepEqual(deltaSprite.palette.entries[0], { red: 10, green: 11, blue: 12, alpha: 255 });
assert.deepEqual(deltaSprite.palette.entries[1], { red: 20, green: 21, blue: 22, alpha: 255 });

const modernBase = await codec.decodeAseprite(xprite, {
  inflate: (bytes) => inflateSync(bytes),
});
const modernBytes = codec.encodeAsepriteSync(modernBase);
const modernEntry = modernBase.palette.entries[0];
const legacyBeforeModern = insertBeforeChunkType(
  modernBytes,
  0x2019,
  legacyChunk(0x0004, [{ skip: 0, colors: [[1, 2, 3]] }]),
);
const precedenceSprite = await codec.decodeAseprite(legacyBeforeModern, {
  inflate: (bytes) => inflateSync(bytes),
});
assert.deepEqual(precedenceSprite.palette.entries[0], modernEntry);
assert.equal(precedenceSprite.palette.frameIndex, 0);

const truncated = xprite.subarray(0, 96);
assert.equal(codec.preflightAseprite(truncated).ok, false);
await assert.rejects(
  () =>
    codec.decodeAseprite(truncated, {
      inflate: () => {
        throw new Error("inflater should not run");
      },
    }),
  codec.AsepriteCodecError,
);

// Mutate the first image layer's type and blend mode in otherwise valid bytes.
// Find its chunk because metadata chunks precede layers in modern Aseprite files.
const firstLayerType = new Uint8Array(xprite);
const xpriteView = new DataView(firstLayerType.buffer);
let firstLayerOffset = 144;
let previousChunkOffset = 144;
while (firstLayerOffset + 6 < firstLayerType.byteLength) {
  const size = xpriteView.getUint32(firstLayerOffset, true);
  const type = xpriteView.getUint16(firstLayerOffset + 4, true);
  if (type === 0x2004) break;
  previousChunkOffset = firstLayerOffset;
  firstLayerOffset += size;
}
assert.ok(firstLayerOffset + 6 < firstLayerType.byteLength);
xpriteView.setUint16(firstLayerOffset + 6 + 2, 2, true);
const unsupportedLayer = codec.preflightAseprite(firstLayerType);
assert.equal(unsupportedLayer.ok, false);
assert.ok(unsupportedLayer.issues.some((entry) => entry.code === "unsupported-layer"));
const blendMode = new Uint8Array(xprite);
new DataView(blendMode.buffer).setUint16(firstLayerOffset + 6 + 10, 19, true);
const unsupportedBlend = codec.preflightAseprite(blendMode);
assert.equal(unsupportedBlend.ok, false);
assert.ok(unsupportedBlend.issues.some((entry) => entry.code === "unsupported-blend-mode"));
const unknownChunk = new Uint8Array(xprite);
new DataView(unknownChunk.buffer).setUint16(previousChunkOffset + 4, 0x7777, true);
const unknownResult = codec.preflightAseprite(unknownChunk);
assert.equal(unknownResult.ok, false);
assert.ok(unknownResult.issues.some((entry) => entry.code === "invalid-data" && entry.fatal));

// Exercise the raw and linked cel encoder paths independently of the source
// files, then use the compressed path with the real file above.
const linkedSource = await codec.decodeAseprite(xprite, {
  inflate: (bytes) => inflateSync(bytes),
});
const sourceCel = linkedSource.frames[0].cels[0];
linkedSource.frames[1].cels = [
  {
    ...linkedSource.frames[1].cels[0],
    type: "linked",
    rawType: 1,
    linkedFrame: 0,
    width: sourceCel.width,
    height: sourceCel.height,
    pixels: undefined,
  },
];
const linkedBytes = codec.encodeAsepriteSync(linkedSource);
const linkedRoundTrip = codec.decodeAsepriteSync(linkedBytes, {
  inflate: (bytes) => inflateSync(bytes),
});
assert.equal(linkedRoundTrip.frames[1].cels[0].type, "linked");
assert.equal(linkedRoundTrip.frames[1].cels[0].linkedFrame, 0);
assert.deepEqual(
  linkedRoundTrip.frames[1].cels[0].pixels,
  linkedRoundTrip.frames[0].cels[0].pixels,
);

console.log(
  "malformed, unsupported-layer, unsupported-blend, raw, compressed, linked, metadata, legacy-palette, delta-palette, and modern-precedence cases OK",
);
