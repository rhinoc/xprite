import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { ensureTimeline, layerAtPoint, trimActiveCel } from "$/document/document";
import type { EditorDocument } from "$/document/types";

function document(width: number, height: number): EditorDocument {
  return {
    name: "bounds",
    width,
    height,
    selection: null,
    layer: {
      name: "Layer",
      x: 10,
      y: 20,
      visible: true,
      locked: false,
      pixels: { width, height, data: new Uint8ClampedArray(width * height * 4) },
    },
  };
}

describe("cel boundary search", () => {
  it("retains full bounds when each edge contains an occupied pixel", () => {
    const doc = document(8, 6);
    const source = doc.layer.pixels;
    for (const [x, y] of [
      [3, 0],
      [5, 5],
      [0, 2],
      [7, 4],
    ])
      source.data[(y * source.width + x) * 4 + 3] = 255;
    trimActiveCel(doc);
    assert.equal(doc.layer.pixels, source);
    assert.equal(doc.layer.x, 10);
  });

  it("crops exact bounds while preserving shared images and independent linked offsets", () => {
    const doc = document(8, 6);
    const source = doc.layer.pixels;
    source.data.fill(123);
    for (let i = 3; i < source.data.length; i += 4) source.data[i] = 0;
    source.data[(1 * 8 + 2) * 4 + 3] = 255;
    source.data[(2 * 8 + 3) * 4 + 3] = 255;
    const timeline = ensureTimeline(doc);
    timeline.frames.push({
      duration: 100,
      cels: [{ ...timeline.frames[0].cels[0]!, x: 14, y: 30 }],
    });
    trimActiveCel(doc);
    assert.deepEqual(
      [doc.layer.pixels.width, doc.layer.pixels.height, doc.layer.x, doc.layer.y],
      [2, 2, 12, 21],
    );
    const linked = doc.timeline!.frames[1].cels[0]!;
    assert.equal(linked.pixels, doc.layer.pixels);
    assert.deepEqual([linked.x, linked.y], [16, 31]);
    assert.deepEqual(
      [...doc.layer.pixels.data],
      [123, 123, 123, 255, 123, 123, 123, 0, 123, 123, 123, 0, 123, 123, 123, 255],
    );
  });

  it("uses the transparent index instead of expanded RGBA alpha for indexed cels", () => {
    const doc = document(8, 6);
    const timeline = ensureTimeline(doc);
    timeline.transparentIndex = 7;
    const data = new Uint8Array(8 * 6).fill(7);
    data[2 * 8 + 4] = 9;
    timeline.frames[0].cels[0]!.asepriteSamples = { depth: 8, width: 8, height: 6, data };
    trimActiveCel(doc);
    assert.deepEqual(
      [doc.layer.pixels.width, doc.layer.pixels.height, doc.layer.x, doc.layer.y],
      [1, 1, 14, 22],
    );
    assert.deepEqual([...doc.timeline!.frames[0].cels[0]!.asepriteSamples!.data], [9]);
  });
});

describe("native cel hit sampling", () => {
  it("uses raw alpha despite zero layer and cel opacity, but excludes hidden cels", () => {
    const doc = document(2, 2);
    const timeline = ensureTimeline(doc);
    const cel = timeline.frames[0].cels[0]!;
    cel.pixels.data[3] = 1;
    cel.opacity = 0;
    timeline.layers[0].opacity = 0;
    assert.equal(layerAtPoint(doc, 10, 20), 0);
    timeline.layers[0].visible = false;
    assert.equal(layerAtPoint(doc, 10, 20), null);
  });

  it("picks occupied indexed pixels with transparent palette colors and excludes the transparent index", () => {
    const doc = document(2, 2);
    const timeline = ensureTimeline(doc);
    const cel = timeline.frames[0].cels[0]!;
    timeline.colorDepth = 8;
    timeline.transparentIndex = 7;
    cel.asepriteSamples = { depth: 8, width: 2, height: 2, data: Uint8Array.of(9, 7, 7, 7) };
    assert.equal(cel.pixels.data[3], 0);
    assert.equal(layerAtPoint(doc, 10, 20), 0);
    cel.pixels.data[7] = 255;
    assert.equal(layerAtPoint(doc, 11, 20), null);
  });

  it("reads flipped tile indices from the tileset when the cel has only an RGBA projection", () => {
    const doc = document(2, 2);
    const timeline = ensureTimeline(doc);
    const cel = timeline.frames[0].cels[0]!;
    timeline.colorDepth = 8;
    timeline.transparentIndex = 0;
    timeline.layers[0].kind = "tilemap";
    timeline.layers[0].tilesetId = 1;
    timeline.tilesets = [
      {
        id: 1,
        name: "Indexed tiles",
        flags: 2,
        baseIndex: 0,
        tileWidth: 2,
        tileHeight: 2,
        tileCount: 2,
        pixels: new Uint8Array(2 * 2 * 2 * 4),
        asepritePixels: Uint8Array.of(0, 0, 0, 0, 4, 0, 0, 0),
      },
    ];
    cel.tilemap = { width: 1, height: 1, tiles: Uint32Array.of(0x80000001) };
    assert.equal(cel.asepriteSamples, undefined);
    assert.equal(layerAtPoint(doc, 10, 20), null);
    assert.equal(layerAtPoint(doc, 11, 20), 0);
  });

  it("samples the underlying indexed projection of a tile cel, preserving palette transparency semantics", () => {
    const doc = document(2, 2);
    const timeline = ensureTimeline(doc);
    const cel = timeline.frames[0].cels[0]!;
    timeline.colorDepth = 8;
    timeline.transparentIndex = 0;
    timeline.layers[0].kind = "tilemap";
    cel.tilemap = { width: 1, height: 1, tiles: Uint32Array.of(0x80000001) };
    cel.asepriteSamples = { depth: 8, width: 2, height: 2, data: Uint8Array.of(4, 0, 0, 0) };
    assert.equal(layerAtPoint(doc, 10, 20), 0);
    assert.equal(layerAtPoint(doc, 11, 20), null);
  });
});
