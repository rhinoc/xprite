import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { ViewerFrameCache } from "$/managers/viewer/frame-cache";

const pixels = (value: number) => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([value, 0, 0, 255]),
});

describe("viewer immutable frame cache", () => {
  it("separates visibility configurations and clears prior project/profile outputs", () => {
    const cache = new ViewerFrameCache();
    const visible = pixels(128);
    const hidden = pixels(0);
    cache.set(0, "11", visible);
    cache.set(0, "10", hidden);
    assert.equal(cache.get(0, "11"), visible);
    assert.equal(cache.get(0, "10"), hidden);
    assert.equal(cache.get(1, "11"), undefined);
    cache.clear();
    assert.equal(cache.get(0, "11"), undefined);
    assert.equal(cache.get(0, "10"), undefined);
  });

  it("evicts by bytes and recency and leaves oversized frames uncached", () => {
    const cache = new ViewerFrameCache(8, 8);
    const first = pixels(1);
    cache.set(0, "1", first);
    cache.set(1, "1", pixels(2));
    assert.equal(cache.get(0, "1"), first);
    cache.set(2, "1", pixels(3));
    assert.equal(cache.get(1, "1"), undefined);
    assert.equal(cache.get(0, "1"), first);
    cache.set(3, "1", { width: 3, height: 1, data: new Uint8ClampedArray(12) });
    assert.equal(cache.get(3, "1"), undefined);
    assert.equal(cache.get(0, "1"), first);
  });

  it("also bounds frame count and accounts for replacement", () => {
    const cache = new ViewerFrameCache(64, 2);
    cache.set(0, "1", pixels(1));
    const replaced = pixels(2);
    cache.set(0, "1", replaced);
    cache.set(1, "1", pixels(3));
    assert.equal(cache.get(0, "1"), replaced);
    cache.set(2, "1", pixels(4));
    assert.equal(cache.get(1, "1"), undefined);
    assert.equal(cache.get(0, "1"), replaced);
  });
});
