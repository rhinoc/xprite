import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { convertPixelsToSrgb } from "$/color/icc-profile";
import { PresentationColorCache } from "$/color/presentation-cache";
import { RasterEditor } from "$/editor/RasterEditor";
import type { AsepriteColorProfile } from "$/import-export/aseprite/model";

const profile: AsepriteColorProfile = { type: "srgb", gamma: 1.8 };
const image = () => ({
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([128, 64, 32, 255, 13, 27, 41, 0, 94, 140, 212, 128, 4, 5, 6, 1]),
});

describe("display-space raster caching", () => {
  it("reuses view-only conversions and updates only a proven changed region", () => {
    const source = image();
    const original = source.data.slice();
    const cache = new PresentationColorCache();
    const first = cache.convert(source, profile, 0);
    assert.notEqual(first.data, source.data);
    assert.deepEqual(source.data, original);
    assert.equal(cache.convert(source, { ...profile }, 0), first);
    source.data.set([71, 93, 114, 160], 4);
    const next = cache.convert(source, profile, 2, {
      pixels: source,
      fromRevision: 0,
      revision: 2,
      bounds: { x: 1, y: 0, width: 1, height: 1 },
    });
    assert.equal(next, first);
    assert.deepEqual(next.data, convertPixelsToSrgb(source, profile).data);
    source.data.set([67, 89, 123, 0], 4);
    cache.convert(source, profile, 3, {
      pixels: source,
      fromRevision: 2,
      revision: 3,
      bounds: { x: 1, y: 0, width: 1, height: 1 },
    });
    assert.deepEqual(next.data, convertPixelsToSrgb(source, profile).data);
    assert.deepEqual([...next.data.subarray(4, 8)], [67, 89, 123, 0]);
  });

  it("uses a fresh output for unproven writes, missing revisions and profile changes", () => {
    const source = image();
    const cache = new PresentationColorCache();
    const first = cache.convert(source, profile, 0);
    source.data[0] = 91;
    const gap = cache.convert(source, profile, 3, {
      pixels: source,
      fromRevision: 2,
      revision: 3,
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    });
    assert.notEqual(gap.data, first.data);
    assert.deepEqual(gap.data, convertPixelsToSrgb(source, profile).data);
    const structural = cache.convert(source, profile, 4);
    assert.notEqual(structural.data, gap.data);
    const changedProfile = { type: "srgb" as const, gamma: 2.2 };
    const converted = cache.convert(source, changedProfile, 4);
    assert.notEqual(converted.data, structural.data);
    assert.deepEqual(converted.data, convertPixelsToSrgb(source, changedProfile).data);
    source.data = source.data.slice();
    assert.notEqual(cache.convert(source, changedProfile, 4).data, converted.data);
    assert.equal(cache.convert(source, undefined, 4), source);
  });

  it("does not retain transient previews or outputs over the byte budget", () => {
    const source = image();
    const cache = new PresentationColorCache();
    assert.notEqual(cache.convert(source, profile, null), cache.convert(source, profile, null));
    const bounded = new PresentationColorCache(source.data.byteLength - 1);
    assert.notEqual(bounded.convert(source, profile, 0), bounded.convert(source, profile, 0));
  });

  it("accepts accumulated stroke changes and fully invalidates on undo", () => {
    const editor = new RasterEditor({ width: 32, height: 32, data: new Uint8ClampedArray(4096) });
    const cache = new PresentationColorCache();
    const before = editor.getSnapshot();
    const source = before.document!.layer.pixels;
    const first = cache.convert(source, profile, before.pixelRevision, before.rasterChange);
    editor.pointerDown({ x: 3, y: 4 });
    editor.pointerMove({ x: 8, y: 4 });
    const painted = editor.getSnapshot();
    const next = cache.convert(source, profile, painted.pixelRevision, painted.rasterChange);
    assert.equal(next, first);
    assert.deepEqual(next.data, convertPixelsToSrgb(source, profile).data);
    editor.pointerUp({ x: 8, y: 4 });
    editor.history.undo();
    const undone = editor.getSnapshot();
    assert.equal(undone.rasterChange, null);
    const restored = cache.convert(
      undone.document!.layer.pixels,
      profile,
      undone.pixelRevision,
      undone.rasterChange,
    );
    assert.notEqual(restored.data, next.data);
    assert.deepEqual(
      restored.data,
      convertPixelsToSrgb(undone.document!.layer.pixels, profile).data,
    );
  });
});
