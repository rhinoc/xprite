import assert from "node:assert/strict";

import { build } from "esbuild";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { describe, it, vi } from "vitest";

import type { PackedRecentSnapshot } from "$/adapters/workers/recent-snapshot";

async function loadRecents(adapter) {
  const list = await adapter.list();
  return Promise.all(list.map((item) => adapter.read(item.id)));
}

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
    assert.deepEqual(await loadRecents(a), []);
    await a.save([first, second]);
    const recreated = new IndexedDbRecentImages({
        factory,
        databaseName: "test-recent-a",
      }),
      loaded = await loadRecents(recreated);
    assert.deepEqual(
      loaded.map((item) => item.name),
      ["RGBA.png", "Other.png"],
    );
    assert.equal(loaded[0].image.data.byteLength, 16);
    assert.deepEqual([...loaded[0].image.data], [...first.image.data]);
    assert.deepEqual([...loaded[1].image.data], [255, 0, 17, 0]);
    loaded[0].image.data.fill(0);
    assert.deepEqual([...(await loadRecents(a))[0].image.data], [...first.image.data]);
    await b.save([second]);
    await a.save([first]);
    assert.deepEqual(
      (await loadRecents(a)).map((item) => item.name),
      ["RGBA.png"],
    );
    assert.deepEqual(
      (await loadRecents(b)).map((item) => item.name),
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
      (await loadRecents(a)).map((item) => item.name),
      ["RGBA.png"],
      "validation fails before an atomic replacement can clear valid rows",
    );
    await a.save([second, first]);
    assert.deepEqual(
      (await loadRecents(a)).map((item) => item.name),
      ["Other.png", "RGBA.png"],
    );
    await a.save([first, { ...second, name: first.name }]);
    const duplicates = await loadRecents(
      new IndexedDbRecentImages({
        factory,
        databaseName: "test-recent-a",
      }),
    );
    assert.equal(duplicates.length, 2);
    assert.deepEqual(
      duplicates.map((item) => item.id),
      ["file-a", "file-b"],
    );
    assert.deepEqual([...duplicates[1].image.data], [255, 0, 17, 0]);
    const large = {
      id: "large",
      name: "Transparent colors",
      image: { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) },
    };
    for (let at = 0; at < large.image.data.length; at += 4)
      large.image.data.set([255, 17, 42, 0], at);
    await a.save([large]);
    const compact = await new Promise<PackedRecentSnapshot>((resolve, reject) => {
      const request = factory.open("test-recent-a", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction("images", "readonly").objectStore("images").get("large");
        read.onerror = () => {
          db.close();
          reject(read.error);
        };
        read.onsuccess = () => {
          db.close();
          resolve(read.result);
        };
      };
    });
    assert.ok(compact.compressed instanceof Map);
    assert.ok(
      [...compact.compressed.values()].reduce((sum, item) => sum + item.bytes.length, 0) <
        large.image.data.byteLength,
    );
    assert.deepEqual(
      (({ contentVersion: _version, ...item }) => item)((await loadRecents(recreated))[0]),
      large,
      "compressed IndexedDB records restore exact transparent RGB bytes",
    );
    await a.save([]);
    assert.deepEqual(
      await loadRecents(new IndexedDbRecentImages({ factory, databaseName: "test-recent-a" })),
      [],
      "clearing persists an empty recent list",
    );
    await a.save([first]);
    await assert.rejects(loadRecents(new IndexedDbRecentImages()), /IndexedDB is unavailable/);
    a.close();
    b.close();
    recreated.close();
    console.log(
      "IndexedDB recent-file checks passed, including reload bytes, typed-array offsets, ordering, persisted clear, atomic invalid-write protection and database isolation.",
    );
  }, 60_000);

  it("writes only changed payloads and atomically retries failed updates", async () => {
    const bundle = await build({
      entryPoints: ["apps/editor/src/adapters/storage/indexeddb/recents.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { IndexedDbRecentImages } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );
    const factory = new IDBFactory();
    const adapter = new IndexedDbRecentImages({ factory, databaseName: "incremental-recents" });
    const image = { width: 256, height: 128, data: new Uint8ClampedArray(256 * 128 * 4) };
    image.data.set([255, 13, 29, 0]);
    const cel = { pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 };
    const first = {
      id: "animation",
      name: "Animation.aseprite",
      image,
      contentVersion: {},
      project: {
        image,
        timeline: {
          layers: [
            { id: "layer", name: "Layer", visible: true, locked: false, opacity: 255, flags: 0 },
          ],
          frames: [
            { duration: 100, cels: [cel] },
            { duration: 200, cels: [cel] },
          ],
          activeFrame: 0,
          activeLayer: 0,
        },
      },
    };
    const second = { id: "static", name: "Static.png", image, contentVersion: {} };
    const puts: string[] = [];
    let abortNextImage = false;
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      puts.push(this.name);
      const request = originalPut.apply(this, args);
      if (this.name === "images" && abortNextImage) {
        abortNextImage = false;
        request.onsuccess = () => this.transaction.abort();
      }
      return request;
    });
    const clear = vi.spyOn(IDBObjectStore.prototype, "clear");
    try {
      await adapter.save([first, second]);
      puts.length = 0;
      await adapter.save([second, { ...first, name: "Renamed.aseprite" }]);
      assert.deepEqual(puts, ["recents", "recents"], "reorder and rename update metadata only");
      assert.equal(clear.mock.calls.length, 0, "ordinary writes never clear object stores");
      const thumb = await adapter.readThumbnail(first.id);
      assert.equal(thumb.width, 128);
      assert.equal(thumb.height, 64);
      assert.equal(
        image.data[0],
        255,
        "thumbnail generation preserves transparent RGB in the source",
      );
      const cold = new IndexedDbRecentImages({ factory, databaseName: "incremental-recents" });
      const gets = [];
      const originalGet = IDBObjectStore.prototype.get;
      const get = vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function (id) {
        gets.push([this.name, id]);
        return originalGet.call(this, id);
      });
      try {
        const catalog = await cold.list();
        assert.deepEqual(gets, [], "catalog listing reads no payload or thumbnail stores");
        puts.length = 0;
        await cold.save(catalog);
        assert.deepEqual(puts, [], "cold catalog saving neither encodes nor replaces payloads");
        const opened = await cold.read(first.id);
        assert.ok(opened.project, "requested lazy read restores the complete project");
        assert.ok(
          gets.every(([, id]) => id === first.id),
          "lazy read touches only requested payloads",
        );
        gets.length = 0;
        const imported = {
          id: "new-import",
          name: "New.png",
          image: second.image,
          contentVersion: {},
        };
        await cold.save([imported, ...catalog]);
        assert.deepEqual(gets, [], "saving one import does not read any old content");
        assert.equal((await cold.list()).length, 3, "unloaded older records survive new import");
        await cold.save(catalog);
        assert.equal(
          await cold.read(imported.id),
          null,
          "metadata removal atomically drops its payload",
        );
      } finally {
        get.mockRestore();
        cold.close();
      }
      puts.length = 0;
      const loaded = await loadRecents(adapter);
      const animation = loaded[1];
      assert.equal(
        animation.project.timeline.frames[0].cels[0],
        animation.project.timeline.frames[1].cels[0],
        "project storage retains linked cel identities",
      );
      assert.deepEqual(animation.image.data, first.image.data);
      puts.length = 0;
      await adapter.save(loaded);
      assert.deepEqual(puts, [], "hydrated content does not get encoded or rewritten");

      const updated = {
        ...animation,
        name: "Updated",
        contentVersion: {},
        image: { ...image, data: new Uint8ClampedArray(image.data).fill(73) },
        project: undefined,
      };
      abortNextImage = true;
      await assert.rejects(adapter.save([updated, loaded[0]]), /aborted|Cannot persist/);
      assert.deepEqual(
        (await adapter.list()).map((item) => item.name),
        ["Static.png", "Renamed.aseprite"],
        "an aborted payload write cannot publish new list metadata",
      );
      puts.length = 0;
      await adapter.save([updated, loaded[0]]);
      assert.equal(
        puts.filter((name) => name === "images").length,
        1,
        "retry writes the failed content without rewriting the unchanged record",
      );
      assert.equal(puts.filter((name) => name === "projects").length, 0);
      const afterRetry = await loadRecents(adapter);
      assert.equal(afterRetry[0].project, undefined, "removing a project removes its old payload");
      assert.equal(afterRetry[0].image.data[0], 73);

      const gate = () => {
        let resolve;
        const promise = new Promise<void>((done) => {
          resolve = done;
        });
        return { promise, resolve };
      };
      const codec = adapter.getCodec();
      const originalUnpack = codec.unpackRecent.bind(codec);
      const unpack = vi.spyOn(codec, "unpackRecent");
      try {
        const started = gate(),
          resume = gate();
        unpack.mockImplementationOnce(async (packed) => {
          const decoded = await originalUnpack(packed);
          started.resolve();
          await resume.promise;
          return decoded;
        });
        const lateRead = adapter.read(afterRetry[0].id);
        await started.promise;
        const concurrent = {
          ...afterRetry[0],
          contentVersion: {},
          image: { ...image, data: new Uint8ClampedArray(image.data).fill(84) },
        };
        await adapter.save([concurrent, afterRetry[1]]);
        const currentCatalog = await adapter.list();
        resume.resolve();
        assert.equal(
          await lateRead,
          null,
          "a read decoded before a newer same-ID write cannot publish stale content",
        );
        await adapter.save(currentCatalog);
        assert.equal(
          (await adapter.list())[0].contentVersion,
          concurrent.contentVersion,
          "late unpack cannot roll back the current durable version used by metadata-only saves",
        );

        const clearingStarted = gate(),
          clearingResume = gate();
        unpack.mockImplementationOnce(async (packed) => {
          const decoded = await originalUnpack(packed);
          clearingStarted.resolve();
          await clearingResume.promise;
          return decoded;
        });
        const deletedRead = adapter.read(concurrent.id);
        await clearingStarted.promise;
        await adapter.save([]);
        clearingResume.resolve();
        assert.equal(
          await deletedRead,
          null,
          "a read begun before clear cannot return removed content",
        );
        assert.equal(
          adapter.versions.has(concurrent.id),
          false,
          "late read completion cannot resurrect a deleted version token",
        );
        assert.deepEqual(await adapter.list(), []);
      } finally {
        unpack.mockRestore();
      }

      await adapter.save([first, second]);
      const originalMetadata = adapter.metadata.bind(adapter);
      const metadata = vi.spyOn(adapter, "metadata");
      try {
        const started = gate(),
          resume = gate();
        metadata.mockImplementationOnce(async (db) => {
          const records = await originalMetadata(db);
          started.resolve();
          await resume.promise;
          return records;
        });
        const staleList = adapter.list();
        await started.promise;
        await adapter.save([]);
        resume.resolve();
        assert.deepEqual(
          await staleList,
          [],
          "a catalog captured before clear retries lightweight metadata and does not resurrect removed entries",
        );
        assert.equal(adapter.versions.size, 0);
      } finally {
        metadata.mockRestore();
      }

      const queued = adapter.save([first, second]);
      const cleared = adapter.save([]);
      adapter.close();
      await Promise.all([queued, cleared]);
      const recreated = new IndexedDbRecentImages({ factory, databaseName: "incremental-recents" });
      assert.deepEqual(
        await recreated.list(),
        [],
        "accepted clear runs after older queued writes, even after close",
      );
      assert.equal(await recreated.readThumbnail(first.id), null, "clear removes thumbnails too");
      recreated.close();
    } finally {
      put.mockRestore();
      clear.mockRestore();
      adapter.close();
    }
  });
});
