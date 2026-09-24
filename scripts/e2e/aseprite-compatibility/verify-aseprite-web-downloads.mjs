import assert from "node:assert/strict";
import fs from "node:fs";
import { inflateSync } from "node:zlib";

import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["packages/editor-core/src/index.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

const bytesEqual = (left, right) =>
  left === undefined || right === undefined
    ? left === right
    : Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;

function assertHeaderPreserved(source, saved) {
  // fileSize is necessarily recalculated by the writer; the format metadata
  // that describes the canvas and playback defaults must remain identical.
  assert.deepEqual({ ...saved.header, fileSize: source.header.fileSize }, source.header);
  assert.equal(saved.width, source.width);
  assert.equal(saved.height, source.height);
  assert.equal(saved.depth, source.depth);
  assert.equal(saved.format, source.format);
}

function assertLayersPreserved(source, saved, changedLayer) {
  assert.equal(saved.layers.length, source.layers.length);
  source.layers.forEach((before, index) => {
    const after = saved.layers[index];
    assert.ok(after, `missing layer ${index}`);
    assert.equal(after.index, before.index);
    assert.equal(after.name, before.name);
    assert.equal(after.opacity, before.opacity);
    assert.equal(after.locked, before.locked);
    assert.equal(after.editable, before.editable);
    assert.equal(after.background, before.background);
    assert.equal(after.collapsed, before.collapsed);
    assert.equal(after.reference, before.reference);
    assert.equal(after.continuous, before.continuous);
    assert.equal(after.childLevel, before.childLevel);
    assert.equal(after.parentIndex, before.parentIndex);
    assert.equal(after.blendMode, before.blendMode);
    assert.equal(after.defaultWidth, before.defaultWidth);
    assert.equal(after.defaultHeight, before.defaultHeight);
    assert.equal(after.tilesetIndex, before.tilesetIndex);
    assert.deepEqual(after.uuid, before.uuid);
    assert.deepEqual(after.userData, before.userData);
    if (index !== changedLayer) assert.equal(after.visible, before.visible);
    // The writer updates the visible bit while retaining every other flag.
    assert.equal(after.flags, (before.flags & ~1) | (after.visible ? 1 : 0));
  });
}

function assertPaletteAndProfilePreserved(source, saved) {
  assert.deepEqual(saved.palette, source.palette);
  assert.deepEqual(saved.colorProfile, source.colorProfile);
  assert.deepEqual(saved.userData, source.userData);
  assert.deepEqual(saved.tags, source.tags);
  assert.deepEqual(saved.chunks, source.chunks);
}

function assertFramesPreserved(source, saved, changedLayer) {
  assert.equal(saved.frames.length, source.frames.length);
  source.frames.forEach((beforeFrame, frameIndex) => {
    const afterFrame = saved.frames[frameIndex];
    assert.ok(afterFrame, `missing frame ${frameIndex}`);
    assert.equal(afterFrame.index, beforeFrame.index);
    assert.equal(afterFrame.duration, beforeFrame.duration);
    assert.deepEqual(afterFrame.chunks, beforeFrame.chunks);
    assert.equal(afterFrame.cels.length, beforeFrame.cels.length);
    beforeFrame.cels.forEach((beforeCel) => {
      const afterCel = afterFrame.cels.find(
        (candidate) => candidate.layerIndex === beforeCel.layerIndex,
      );
      assert.ok(afterCel, `missing cel ${frameIndex}:${beforeCel.layerIndex}`);
      assert.equal(afterCel.layerIndex, beforeCel.layerIndex);
      assert.equal(afterCel.x, beforeCel.x);
      assert.equal(afterCel.y, beforeCel.y);
      assert.equal(afterCel.opacity, beforeCel.opacity);
      assert.equal(afterCel.zIndex, beforeCel.zIndex);
      assert.equal(afterCel.width, beforeCel.width);
      assert.equal(afterCel.height, beforeCel.height);
      assert.equal(afterCel.type, beforeCel.type);
      assert.equal(afterCel.rawType, beforeCel.rawType);
      assert.equal(afterCel.linkedFrame, beforeCel.linkedFrame);
      assert.deepEqual(afterCel.preciseBounds, beforeCel.preciseBounds);
      assert.deepEqual(afterCel.userData, beforeCel.userData);
      // Exactly one selected cel was intentionally edited in each browser
      // artifact. Every other cel must retain its complete RGBA content.
      if (frameIndex !== 0 || beforeCel.layerIndex !== changedLayer)
        assert.ok(bytesEqual(afterCel.pixels, beforeCel.pixels));
    });
  });
}

const results = [];
for (const [id, fixture, changedLayer] of [
  ["xprite", "apps/editor/assets/examples/xprite/xprite.ase", -1],
]) {
  const source = await api.decodeAseprite(fs.readFileSync(fixture), {
    inflate: inflateSync,
  });
  const saved = await api.decodeAseprite(fs.readFileSync(`.tmp/qa-${id}-web-edited.aseprite`), {
    inflate: inflateSync,
  });
  assertHeaderPreserved(source, saved);
  assertLayersPreserved(source, saved, changedLayer);
  assertPaletteAndProfilePreserved(source, saved);
  assertFramesPreserved(source, saved, changedLayer);

  let changed = 0;
  for (let frame = 0; frame < source.frames.length; frame++) {
    for (const cel of source.frames[frame].cels) {
      const after = saved.frames[frame].cels.find((value) => value.layerIndex === cel.layerIndex);
      if (!bytesEqual(cel.pixels, after.pixels)) {
        assert.fail(`Unexpected cel edit at ${frame}:${cel.layerIndex}`);
        changed++;
      }
    }
  }
  assert.equal(changed, 0, `${id} should round-trip without changing pixels`);
  results.push({
    id,
    layers: saved.layers.length,
    frames: saved.frames.length,
    changedCels: changed,
    durationsPreserved: true,
    layerMetadataPreserved: true,
    celMetadataPreserved: true,
    palettePreserved: true,
    profileMetadataPreserved: true,
    tagsPreserved: true,
  });
}

fs.mkdirSync(".tmp", { recursive: true });
fs.writeFileSync(
  ".tmp/qa-aseprite-web-downloads.json",
  JSON.stringify({ capturedAt: new Date().toISOString(), passed: true, results }, null, 2),
);
console.log(results);
