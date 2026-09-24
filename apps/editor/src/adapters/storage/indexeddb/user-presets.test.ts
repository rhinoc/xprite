import assert from "node:assert/strict";

import { IDBFactory } from "fake-indexeddb";
import { describe, it } from "vitest";

import { IndexedDbUserPresets } from "$/adapters/storage/indexeddb/user-presets";

describe("bitmap preset storage", () => {
  it("round-trips typed image pixels and reset data across storage instances", async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbUserPresets({ factory });
    const value = {
      brushes: [{ data: new Uint8ClampedArray([1, 2, 3, 255]), mask: new Uint8Array([1]) }],
    };
    await first.save(value);
    first.close();
    const next = new IndexedDbUserPresets({ factory });
    assert.deepEqual(await next.load(), value);
    await next.save({ brushes: [] });
    next.close();
    const reopened = new IndexedDbUserPresets({ factory });
    assert.deepEqual(await reopened.load(), { brushes: [] });
    reopened.close();
  });
});
