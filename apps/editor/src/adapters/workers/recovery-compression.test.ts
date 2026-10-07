import assert from "node:assert/strict";

import { unzlibSync } from "fflate";
import { describe, it } from "vitest";

import { RecoveryCompression } from "$/adapters/workers/recovery-compression";

describe("recovery compression cache", () => {
  it("reuses equal cloned content but invalidates changed pixels and remains bounded", async () => {
    let calls = 0;
    const cache = new RecoveryCompression(
      (bytes) => {
        calls++;
        return bytes.slice();
      },
      8,
      2,
    );
    const a = new Uint8Array([1, 2, 3, 4]);
    const first = await cache.deflate(a);
    assert.equal(await cache.deflate(a.slice()), first);
    assert.equal(calls, 1);
    await cache.deflate(new Uint8Array([5, 6, 7, 8]));
    await cache.deflate(a); // a is the most recently used entry.
    await cache.deflate(new Uint8Array([9, 10, 11, 12]));
    assert.equal(await cache.deflate(a), first);
    assert.equal(calls, 3);
    await cache.deflate(new Uint8Array([5, 6, 7, 8]));
    assert.equal(calls, 4);
    a[0] = 42;
    assert.equal((await cache.deflate(a))[0], 42);
    assert.equal(calls, 5);
    cache.clear();
    await cache.deflate(a);
    assert.equal(calls, 6);
  });

  it("hashes immutable buffers only once per byte range and leaves mutable calls content-sensitive", async () => {
    let hashes = 0;
    const cache = new RecoveryCompression(
      (bytes) => bytes.slice(),
      8,
      2,
      async (bytes) => {
        hashes++;
        return [...bytes].join(",");
      },
    );
    const immutable = new Uint8Array([1, 2, 3, 4]);
    const first = await cache.deflateImmutable(immutable);
    assert.equal(
      await cache.deflateImmutable(new Uint8Array(immutable.buffer)),
      first,
      "new views over a retained immutable cel do not rehash",
    );
    assert.equal(hashes, 1);
    await cache.deflateImmutable(immutable.subarray(1));
    assert.equal(hashes, 2, "different byte ranges have independent keys");
    const mutable = immutable.slice();
    await cache.deflate(mutable);
    mutable[0] = 42;
    assert.equal((await cache.deflate(mutable))[0], 42);
    assert.equal(hashes, 4);
    cache.clear();
    await cache.deflateImmutable(immutable);
    assert.equal(hashes, 5, "clear removes immutable identity hints too");
  });

  it("compresses transparent color bytes losslessly and never modifies its source", async () => {
    const bytes = new Uint8Array(32 * 32 * 4);
    for (let at = 0; at < bytes.length; at += 4) bytes.set([255, 17, 42, 0], at);
    const before = bytes.slice();
    const encoded = await new RecoveryCompression().deflate(bytes);
    assert.ok(encoded.length < bytes.length);
    assert.deepEqual(unzlibSync(encoded), before);
    assert.deepEqual(bytes, before);
  });
});
