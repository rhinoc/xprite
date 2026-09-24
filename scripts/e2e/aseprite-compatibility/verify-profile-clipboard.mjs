import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { build } from "esbuild";
const b = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/import-export/aseprite/profile-clipboard.ts";export * from "./packages/editor-core/src/clipboard/timeline.ts";export * from "./packages/editor-core/src/color/icc-profile.ts";',
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
const profile = {
    type: "icc",
    data: new Uint8Array(await readFile("/System/Library/ColorSync/Profiles/Display P3.icc")),
  },
  red = [128, 64, 32, 255],
  image = { width: 1, height: 1, data: new Uint8ClampedArray(red) },
  srgb = m.convertPixelsToSrgb(image, profile),
  layer = { id: "l", name: "L", visible: true, locked: false, opacity: 255, flags: 3 };
const target = {
  name: "Dest",
  width: 1,
  height: 1,
  selection: null,
  palette: [[0, 0, 0, 0], [0, 255, 0, 255], [...srgb.data]],
  layer: { name: "L", visible: true, locked: false, x: 0, y: 0, pixels: image },
  timeline: {
    activeFrame: 0,
    activeLayer: 0,
    colorDepth: 8,
    transparentIndex: 0,
    layers: [layer],
    frames: [{ duration: 100, cels: [null] }],
  },
};
target.timeline.frames[0].palette = target.palette;
const payload = {
  pixels: image,
  mask: { x: 3, y: 5, width: 1, height: 1, data: new Uint8Array([255]) },
  sourceProfile: profile,
  palette: [[0, 0, 0, 0], red],
};
const prepared = m.prepareImageClipboardForDocument(payload, target);
assert.deepEqual(prepared.pixels.data, srgb.data);
assert.deepEqual(prepared.mask, payload.mask);
assert.deepEqual(image.data, new Uint8ClampedArray(red));
const same = m.prepareImageClipboardForDocument(payload, {
  ...target,
  timeline: { ...target.timeline, colorDepth: 32, asepriteSource: { colorProfile: profile } },
});
assert.equal(same.pixels, image);
const asepriteSamples = { depth: 8, width: 1, height: 1, data: new Uint8Array([1]) },
  cel = { pixels: image, asepriteSamples, x: 0, y: 0, opacity: 255, zIndex: 0 },
  source = {
    activeFrame: 0,
    activeLayer: 0,
    colorDepth: 8,
    transparentIndex: 0,
    asepriteSource: { colorProfile: profile },
    layers: [layer],
    frames: [
      { duration: 100, palette: payload.palette, cels: [cel] },
      { duration: 100, palette: payload.palette, cels: [cel] },
    ],
    range: { kind: "layers", layers: [0], frames: [0, 1] },
  };
const clip = m.copyTimelineSelection(source);
assert.notEqual(clip.frames[0].cels[0].asepriteSamples, asepriteSamples);
assert.equal(clip.frames[0].cels[0].asepriteSamples, clip.frames[1].cels[0].asepriteSamples);
assert.equal(clip.frames[0].palette, clip.frames[1].palette);
const mapped = m.prepareTimelineClipboardForDocument(clip, target);
assert.deepEqual(mapped.frames[0].cels[0].pixels.data, srgb.data);
assert.equal(mapped.frames[0].cels[0].asepriteSamples.data[0], 2);
assert.equal(mapped.frames[0].cels[0].asepriteSamples, mapped.frames[1].cels[0].asepriteSamples);
const pasted = m.pasteTimelineClipboard(target.timeline, mapped);
assert.equal(pasted.frames[0].palette, target.palette);
assert.equal(pasted.frames[0].cels[1].asepriteSamples.data[0], 2);
assert.equal(asepriteSamples.data[0], 1);
// Frame paste swaps transparent slots instead of making an opaque source color disappear.
const frameClip = {
    ...clip,
    kind: "frames",
    sourceProfile: undefined,
    transparentIndex: 0,
    frames: [
      {
        duration: 100,
        palette: [
          [0, 0, 0, 255],
          [255, 0, 0, 255],
          [0, 0, 255, 255],
        ],
        cels: [
          {
            ...cel,
            pixels: {
              width: 3,
              height: 1,
              data: new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255]),
            },
            asepriteSamples: { depth: 8, width: 3, height: 1, data: new Uint8Array([0, 1, 2]) },
          },
        ],
      },
    ],
  },
  toMask2 = { ...target, timeline: { ...target.timeline, transparentIndex: 2 } };
const remapped = m.prepareTimelineClipboardForDocument(frameClip, toMask2);
assert.deepEqual([...remapped.frames[0].cels[0].asepriteSamples.data], [2, 1, 0]);
assert.deepEqual(
  [...remapped.frames[0].cels[0].pixels.data],
  [0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255],
);
console.log(
  "Aseprite/profile clipboard: immutable ICC source metadata, same-profile identity, cross-profile image pixels+mask, target palette remap, Aseprite linked samples cloned/shared, inherited palettes retained, transparent-slot swap preserves appearance.",
);
