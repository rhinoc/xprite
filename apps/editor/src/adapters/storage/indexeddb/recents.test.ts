import assert from "node:assert/strict";

import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { describe, it } from "vitest";

describe("indexeddb-recents", () => {
  it("indexeddb-recents behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["apps/editor/src/adapters/storage/indexeddb/recents.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { IndexedDbRecentImages } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const factory = new IDBFactory(),
      a = new IndexedDbRecentImages({ factory, databaseName: "test-recent-a" }),
      b = new IndexedDbRecentImages({ factory, databaseName: "test-recent-b" });
    const buffer = new Uint8ClampedArray(32);
    for (let i = 0; i < 32; i++) buffer[i] = (i * 31) % 256;
    const first = {
      id: "file-a",
      name: "RGBA.png",
      image: { width: 2, height: 2, data: buffer.subarray(8, 24) },
    };
    const second = {
      id: "file-b",
      name: "Other.png",
      image: { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 17, 0]) },
    };
    assert.deepEqual(await a.load(), []);
    await a.save([first, second]);
    const recreated = new IndexedDbRecentImages({
        factory,
        databaseName: "test-recent-a",
      }),
      loaded = await recreated.load();
    assert.deepEqual(
      loaded.map((item) => item.name),
      ["RGBA.png", "Other.png"],
    );
    assert.equal(loaded[0].image.data.byteLength, 16);
    assert.deepEqual([...loaded[0].image.data], [...first.image.data]);
    assert.deepEqual([...loaded[1].image.data], [255, 0, 17, 0]);
    loaded[0].image.data.fill(0);
    assert.deepEqual([...(await a.load())[0].image.data], [...first.image.data]);
    await b.save([second]);
    await a.save([first]);
    assert.deepEqual(
      (await a.load()).map((item) => item.name),
      ["RGBA.png"],
    );
    assert.deepEqual(
      (await b.load()).map((item) => item.name),
      ["Other.png"],
    );
    await assert.rejects(
      a.save([
        {
          id: "invalid",
          name: "Invalid",
          image: { width: 2, height: 2, data: new Uint8ClampedArray(4) },
        },
      ]),
    );
    assert.deepEqual(
      (await a.load()).map((item) => item.name),
      ["RGBA.png"],
      "validation fails before an atomic replacement can clear valid rows",
    );
    await a.save([second, first]);
    assert.deepEqual(
      (await a.load()).map((item) => item.name),
      ["Other.png", "RGBA.png"],
    );
    await a.save([first, { ...second, name: first.name }]);
    const duplicates = await new IndexedDbRecentImages({
      factory,
      databaseName: "test-recent-a",
    }).load();
    assert.equal(duplicates.length, 2);
    assert.deepEqual(
      duplicates.map((item) => item.id),
      ["file-a", "file-b"],
    );
    assert.deepEqual([...duplicates[1].image.data], [255, 0, 17, 0]);
    await a.save([]);
    assert.deepEqual(
      await new IndexedDbRecentImages({ factory, databaseName: "test-recent-a" }).load(),
      [],
      "clearing persists an empty recent list",
    );
    await a.save([first]);
    await assert.rejects(new IndexedDbRecentImages().load(), /IndexedDB is unavailable/);
    console.log(
      "IndexedDB recent-file checks passed, including reload bytes, typed-array offsets, ordering, persisted clear, atomic invalid-write protection and database isolation.",
    );
  }, 60_000);
});
