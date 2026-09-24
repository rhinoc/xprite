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
    const metadata = store.getList();
    metadata[0].name = "mutated";
    assert.equal(store.getList()[0].name, "First");
    assert.equal(store.getList()[0].bytes, 16);
    const second = store.record(image, "Second");
    assert.deepEqual(
      store.getList().map((x) => x.id),
      [second, first],
    );
    const third = store.record(image, "Third");
    assert.deepEqual(
      store.getList().map((x) => x.id),
      [third, second],
    );
    assert.equal(store.read(first), null, "byte budget evicts oldest");
    const before = store.getList();
    assert.equal(store.record(createBlankImage(3, 3), "Too large"), null);
    assert.deepEqual(store.getList(), before, "oversized rejection preserves existing snapshots");
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
