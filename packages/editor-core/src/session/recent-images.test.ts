import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("recent-images", () => {
  it("recent-images behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RecentImageStore, createBlankImage, resolveShortcut } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = createBlankImage(2, 2);
    assert.equal(image.data.length, 16);
    assert.ok(image.data.every((v) => v === 0));
    assert.throws(() => createBlankImage(0, 2), RangeError);
    assert.throws(() => createBlankImage(1.5, 2), RangeError);
    assert.throws(() => createBlankImage(32769, 1), RangeError);
    assert.throws(() => createBlankImage(8001, 8000), RangeError);
    const store = new RecentImageStore({ maxBytes: 32, maxItems: 8 });
    image.data[0] = 23;
    const first = store.record(image, "First");
    image.data[0] = 99;
    assert.equal(store.read(first).data[0], 23, "record snapshots input pixels");
    const read = store.read(first);
    read.data[0] = 7;
    assert.equal(store.read(first).data[0], 23, "read returns independent clone");
    {
      const versioned = new RecentImageStore();
      const id = versioned.record(image, "Versioned");
      const persistence = versioned.getPersistenceSnapshot();
      const repeated = versioned.getPersistenceSnapshot();
      assert.equal(
        repeated[0].image,
        persistence[0].image,
        "persistence borrows stable stored pixels",
      );
      assert.equal(repeated[0].contentVersion, persistence[0].contentVersion);
      image.data[0] = 101;
      versioned.record(image, "Versioned", id);
      assert.notEqual(
        versioned.getPersistenceSnapshot()[0].contentVersion,
        persistence[0].contentVersion,
      );
      assert.equal(persistence[0].image.data[0], 99, "queued snapshots survive record replacement");
      const restored = new RecentImageStore();
      restored.record(
        persistence[0].image,
        "Versioned",
        id,
        undefined,
        persistence[0].contentVersion,
      );
      assert.equal(
        restored.getPersistenceSnapshot()[0].contentVersion,
        persistence[0].contentVersion,
        "hydration retains the durable content version",
      );
      versioned.clear();
      assert.equal(persistence[0].image.data[0], 99, "clearing cannot change an accepted snapshot");
      image.data[0] = 99;
    }
    {
      const lazy = new RecentImageStore({ maxBytes: 16, maxItems: 8 });
      const firstToken = {},
        secondToken = {};
      lazy.restoreCatalog([
        {
          id: "cold-first",
          name: "First.png",
          width: 2,
          height: 2,
          bytes: 16,
          contentVersion: firstToken,
        },
        {
          id: "cold-second",
          name: "Second.png",
          width: 2,
          height: 2,
          bytes: 16,
          contentVersion: secondToken,
        },
      ]);
      assert.equal(lazy.read("cold-first"), null, "restoring catalog allocates no full pixels");
      const cold = lazy.getPersistenceSnapshot();
      assert.ok(
        cold.every((entry) => !("image" in entry)),
        "cold entries persist as references",
      );
      assert.equal(
        lazy.cache({ id: "cold-first", name: "First.png", image, contentVersion: firstToken }),
        true,
      );
      assert.equal(
        lazy.cache({ id: "cold-second", name: "Second.png", image, contentVersion: secondToken }),
        true,
      );
      assert.equal(lazy.getList().length, 2, "cache eviction preserves durable catalog entries");
      assert.equal(
        lazy.read("cold-first"),
        null,
        "least recently accessed durable content is released",
      );
      assert.ok(
        lazy.read("cold-second"),
        "most recently opened content remains cached without reordering history",
      );
      lazy.remove("cold-first");
      assert.equal(
        lazy.cache({ id: "cold-first", name: "First.png", image, contentVersion: firstToken }),
        false,
        "late content cannot resurrect deleted metadata",
      );
      const id = lazy.record(image, "New.png", null);
      assert.ok(id, "adding an import fits by evicting only durable cached content");
      assert.equal(lazy.getList().length, 2, "adding a new import retains an unloaded old record");
      const detached = createBlankImage(2, 2);
      const adopted = new RecentImageStore();
      adopted.recordImmutable(detached, "Owned.png");
      assert.equal(
        adopted.getPersistenceSnapshot()[0].image,
        detached,
        "explicit immutable save capture borrows detached pixels",
      );
      const budgeted = new RecentImageStore({ maxBytes: 16 });
      assert.equal(
        budgeted.record(image, "Shared", null, { image }),
        "recent-1",
        "preview and project share one buffer budget",
      );
      const other = createBlankImage(2, 2);
      const distinctId = budgeted.record(image, "Distinct", null, { image: other });
      assert.ok(distinctId, "complete project exceeding resident budget remains pending");
      assert.equal(
        budgeted.getList()[0].bytes,
        32,
        "complete project pixels count toward the budget",
      );
      budgeted.confirmPersistence(budgeted.getPersistenceSnapshot());
      assert.equal(
        budgeted.read(distinctId),
        null,
        "full project accounting releases oversized durable content",
      );
    }
    const metadata = store.getList();
    metadata[0].name = "mutated";
    assert.equal(store.getList()[0].name, "First");
    assert.equal(store.getList()[0].bytes, 16);
    store.confirmPersistence(store.getPersistenceSnapshot());
    const second = store.record(image, "Second");
    assert.deepEqual(
      store.getList().map((x) => x.id),
      [second, first],
    );
    store.confirmPersistence(store.getPersistenceSnapshot());
    const third = store.record(image, "Third");
    assert.deepEqual(
      store.getList().map((x) => x.id),
      [third, second, first],
    );
    assert.equal(store.read(first), null, "byte budget releases the oldest durable payload");
    const oversized = store.record(createBlankImage(3, 3), "Large snapshot");
    assert.ok(oversized, "a valid large record remains retryable before durable commit");
    assert.ok(store.read(oversized), "pending pixels are retained despite resident cache budget");
    store.confirmPersistence(store.getPersistenceSnapshot());
    assert.equal(
      store.read(oversized),
      null,
      "oversized durable payload is released after persistence",
    );
    assert.ok(
      store.getList().some((item) => item.id === oversized),
      "oversized durable metadata remains available",
    );
    assert.equal(store.read("missing"), null);
    store.clear();
    assert.deepEqual(store.getList(), [], "clear removes every recent snapshot");
    assert.equal(store.read(second), null, "clear releases stored pixel snapshots");
    {
      const selective = new RecentImageStore({ maxBytes: 32 });
      const firstCopy = selective.record(image, "same.png", null);
      const secondCopy = selective.record(image, "same.png", null);
      selective.remove(firstCopy);
      selective.remove("missing");
      assert.deepEqual(
        selective.getList().map((item) => item.id),
        [secondCopy],
        "deletion uses identity and preserves a different copy with the same filename",
      );
      assert.equal(selective.read(firstCopy), null);
      const nextCopy = selective.record(image, "next.png", null);
      assert.deepEqual(
        selective.getList().map((item) => item.id),
        [nextCopy, secondCopy],
        "deletion releases its byte budget without evicting the remaining copy",
      );
    }
    const count = new RecentImageStore({ maxItems: 2, maxBytes: 1000 });
    const ids = [
      count.record(image, "First"),
      count.record(image, "Second"),
      count.record(image, "Third"),
    ];
    assert.deepEqual(
      count.getList().map((x) => x.id),
      [ids[2], ids[1]],
      "count cap and distinct IDs",
    );
    const reused = count.record(createBlankImage(3, 2), "Second");
    assert.equal(reused, ids[1]);
    assert.equal(count.getList().length, 2);
    assert.deepEqual(
      count.getList().map((x) => x.name),
      ["Second", "Third"],
    );
    assert.equal(count.read(reused).width, 3);
    assert.equal(count.getList()[0].bytes, 24);
    assert.equal(new RecentImageStore({ maxBytes: 0 }).record(image, "disabled"), null);
    assert.throws(() => new RecentImageStore({ maxItems: -1 }), RangeError);
    assert.deepEqual(resolveShortcut({ key: "n", meta: true }), { type: "new" });
    assert.deepEqual(resolveShortcut({ key: "N", ctrl: true }), { type: "new" });
    assert.deepEqual(resolveShortcut({ key: "t", ctrl: true, shift: true }), {
      type: "reopen-closed-file",
    });
    assert.deepEqual(resolveShortcut({ key: "t", meta: true, shift: true }), {
      type: "reopen-closed-file",
    });
    assert.equal(resolveShortcut({ key: "t", ctrl: true, shift: true, alt: true }), null);
    assert.equal(resolveShortcut({ key: "n", ctrl: true, shift: true }), null);
    assert.deepEqual(resolveShortcut({ key: "n", ctrl: true, alt: true }), {
      type: "new-sprite-from-selection",
    });
    assert.equal(resolveShortcut({ key: "n", ctrl: true, editingText: true }), null);
    console.log(
      "Recent images pass: owned snapshots/read clones, metadata isolation, byte/count eviction, clear semantics, IDs, blank allocation bounds, and Ctrl/Cmd+Shift+T shortcut mapping.",
    );
  }, 60_000);
});
