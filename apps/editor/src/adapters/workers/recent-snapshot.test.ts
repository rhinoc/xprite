import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  packRecentSnapshot,
  unpackRecentSnapshot,
  type RecentSnapshot,
} from "$/adapters/workers/recent-snapshot";
import type { SessionProject } from "@xprite/editor-core/session";

function snapshot(): RecentSnapshot {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let at = 0; at < data.length; at += 4) data.set([42, 17, 255, 0], at);
  const pixels = { width: 32, height: 32, data };
  const project: SessionProject = {
    image: pixels,
    pngImage: { ...pixels, data: data.slice() },
    palette: [[42, 17, 255, 0]],
    timeline: {
      activeFrame: 2,
      activeLayer: 0,
      loopCount: 3,
      composeGroups: true,
      range: { kind: "frames", frames: [0, 2], layers: [0] },
      userData: { text: "original metadata", properties: new Uint8Array(2048).fill(3) },
      layers: [
        { id: "original-id", name: "Pixels", visible: true, locked: false, opacity: 255, flags: 3 },
      ],
      frames: [pixels, pixels, { ...pixels, data: data.slice() }].map((image, index) => ({
        duration: 100 + index * 25,
        cels: [{ pixels: image, x: -2, y: 3, opacity: 217, zIndex: -1 }],
      })),
    },
  };
  return { width: 32, height: 32, rgba: data.slice().buffer, project };
}

describe("recent-file binary snapshots", () => {
  it("compacts duplicate pixels while preserving exact metadata, linkage and independent cel identities", async () => {
    const source = snapshot(),
      before = structuredClone(source);
    const packed = structuredClone(await packRecentSnapshot(source));
    assert.ok(packed.compressed && packed.compressed.size >= 4);
    const bodies = new Set([...packed.compressed.values()].map((entry) => entry.bytes));
    assert.ok(
      bodies.size < packed.compressed.size,
      "identical binary content shares its stored compressed body",
    );
    assert.ok([...bodies].reduce((sum, bytes) => sum + bytes.length, 0) < source.rgba.byteLength);
    const restored = unpackRecentSnapshot(packed);
    assert.deepEqual(restored, before);
    assert.deepEqual(source, before, "packing cannot mutate or detach input bytes");
    const cels = restored.project!.timeline.frames.map((frame) => frame.cels[0]!);
    assert.equal(cels[0].pixels, cels[1].pixels);
    assert.notEqual(cels[0].pixels, cels[2].pixels);
    assert.notEqual(cels[0].pixels.data, cels[2].pixels.data);
    cels[0].pixels.data[0] = 9;
    assert.equal(cels[1].pixels.data[0], 9);
    assert.equal(cels[2].pixels.data[0], 42);
    assert.equal(new Uint8Array(restored.rgba)[0], 42);
  });

  it("keeps small buffers native and rejects damaged expansion bounds before publication", async () => {
    const tiny: RecentSnapshot = {
      width: 1,
      height: 1,
      rgba: new Uint8Array([255, 2, 17, 0]).buffer,
    };
    const packedTiny = await packRecentSnapshot(tiny);
    assert.equal(packedTiny.compressed, undefined);
    assert.deepEqual(unpackRecentSnapshot(structuredClone(packedTiny)), tiny);
    const packed = await packRecentSnapshot(snapshot());
    const entry = packed.compressed!.values().next().value!;
    const length = entry.byteLength;
    entry.byteLength = length - 1;
    assert.throws(() => unpackRecentSnapshot(packed), /expanded size/);
    entry.byteLength = Number.MAX_SAFE_INTEGER;
    assert.throws(() => unpackRecentSnapshot(packed), /storage limit/);
    entry.byteLength = length;
    entry.bytes[entry.bytes.length - 1] ^= 1;
    assert.throws(() => unpackRecentSnapshot(packed), /checksum/);
  });
});
