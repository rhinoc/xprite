import assert from "node:assert/strict";

import { IDBFactory } from "fake-indexeddb";
import { describe, it } from "vitest";

import { IndexedDbFileIdentities } from "$/adapters/storage/indexeddb/file-identities";

describe("file preference identities", () => {
  it("recognizes the same fallback file across instances and separates different content with equal names", async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbFileIdentities({ factory });
    const original = new File([new Uint8Array([1, 2, 3])], "same.aseprite");
    const different = new File([new Uint8Array([4, 5, 6])], "same.aseprite");
    const identity = await first.identify(original);
    assert.notEqual(await first.identify(different), identity);
    first.close();
    const reopened = new IndexedDbFileIdentities({ factory });
    assert.equal(
      await reopened.identify(new File([new Uint8Array([1, 2, 3])], "same.aseprite")),
      identity,
    );
    reopened.close();
  });
});
