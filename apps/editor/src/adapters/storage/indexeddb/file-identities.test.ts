import assert from "node:assert/strict";

import { IDBFactory } from "fake-indexeddb";
import { describe, it } from "vitest";

import { IndexedDbFileIdentities } from "$/adapters/storage/indexeddb/file-identities";
import { sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";

describe("file preference identities", () => {
  it("reuses the exact source digest while retaining filename and native-handle identity", async () => {
    const identities = new IndexedDbFileIdentities({ factory: new IDBFactory() });
    const bytes = new Uint8Array([1, 2, 3]);
    const checksum = await sha256Hex(bytes);
    const original = new File([bytes], "same.aseprite");
    const identity = await identities.identify(original);
    class AlreadyReadFile extends File {
      override arrayBuffer(): Promise<ArrayBuffer> {
        throw new Error("The source must not be read a second time");
      }
    }
    const file = new AlreadyReadFile([bytes], "same.aseprite");
    assert.equal(await identities.identify(file, undefined, checksum), identity);
    assert.notEqual(
      await identities.identify(
        new AlreadyReadFile([bytes], "other.aseprite"),
        undefined,
        checksum,
      ),
      identity,
    );
    const handle = {
      name: file.name,
      async isSameEntry(other: unknown) {
        return other === handle;
      },
      async createWritable() {
        return { async write() {}, async close() {} };
      },
    };
    const native = await identities.identify(file, handle, checksum);
    assert.notEqual(native, identity);
    const changedBytes = new Uint8Array([4, 5, 6]);
    assert.equal(
      await identities.identify(
        new AlreadyReadFile([changedBytes], file.name),
        handle,
        await sha256Hex(changedBytes),
      ),
      native,
    );
    identities.close();
  });
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
