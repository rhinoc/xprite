import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { LocalFileLibrary, uniqueFileName } from "$/local-file-library";
import type { ByteStore } from "$/opfs";

class MemoryBytes implements ByteStore {
  readonly values = new Map<string, Uint8Array>();
  fail = false;
  async write(key: string, bytes: Uint8Array) {
    if (this.fail) {
      const error = new Error("unknown transient reason");
      error.name = "UnknownError";
      throw error;
    }
    this.values.set(key, new Uint8Array(bytes));
  }
  async read(key: string) {
    const value = this.values.get(key);
    if (!value) throw new Error("missing");
    return value;
  }
  async remove(key: string) {
    this.values.delete(key);
  }
  close() {}
}

function library(bytes?: ByteStore) {
  let time = 1000;
  let id = 0;
  return new LocalFileLibrary({
    databaseName: "test-files",
    factory: new IDBFactory(),
    byteStore: bytes,
    now: () => ++time,
    makeId: () => `id-${++id}`,
  });
}

const file = (name: string, text: string, folder = "pixelate") => ({
  name,
  type: "image/png",
  bytes: new TextEncoder().encode(text),
  folder,
  source: "file",
});

describe("uniqueFileName", () => {
  it("adds Finder-style copy suffixes before the extension", () => {
    expect(uniqueFileName("a.png", new Set())).toBe("a.png");
    expect(uniqueFileName("a.png", new Set(["a.png"]))).toBe("a copy.png");
    expect(uniqueFileName("a.png", new Set(["a.png", "a copy.png"]))).toBe("a copy 2.png");
    expect(uniqueFileName("README", new Set(["README"]))).toBe("README copy");
  });
});

describe("LocalFileLibrary", () => {
  it("dedupes identical bytes in a folder and shares bytes across folders", async () => {
    const bytes = new MemoryBytes();
    const files = library(bytes);
    const first = await files.add(file("a.png", "same"));
    const again = await files.add(file("renamed.png", "same"));
    expect(again.deduped).toBe(true);
    expect(again.record.id).toBe(first.record.id);
    const other = await files.add(file("a.png", "same", "beads"));
    expect(other.deduped).toBe(false);
    expect(bytes.values.size).toBe(1);
    expect(await files.list()).toHaveLength(2);
    expect(new TextDecoder().decode(await files.read(other.record.id))).toBe("same");
  });

  it("renames, duplicates, trashes, restores and empties the Trash", async () => {
    const bytes = new MemoryBytes();
    const files = library(bytes);
    const { record } = await files.add(file("a.png", "one"));
    const copy = await files.duplicate(record.id);
    expect(copy?.name).toBe("a copy.png");
    expect((await files.update(record.id, { name: "a copy.png" }))?.name).toBe("a copy 2.png");
    await files.trash([record.id]);
    expect((await files.get(record.id))?.trashedAt).toBeTypeOf("number");
    await files.restore([record.id]);
    expect((await files.get(record.id))?.trashedAt).toBeUndefined();
    await files.trash([record.id]);
    expect(await files.emptyTrash()).toBe(1);
    expect(bytes.values.size).toBe(1);
    await files.trash([copy!.id]);
    await files.emptyTrash();
    expect(bytes.values.size).toBe(0);
    expect(await files.list()).toEqual([]);
  });

  it("falls back to IndexedDB bytes when the byte store is unavailable", async () => {
    const bytes = new MemoryBytes();
    bytes.fail = true;
    const files = library(bytes);
    const { record } = await files.add(file("a.png", "fallback"));
    expect(new TextDecoder().decode(await files.read(record.id))).toBe("fallback");
  });

  it("keeps thumbnails until the bytes are released", async () => {
    const files = library();
    const { record } = await files.add(file("a.png", "thumb"));
    await files.putThumbnail(record.hash, new Blob(["t"]));
    expect(await files.thumbnail(record.hash)).not.toBeNull();
    await files.trash([record.id]);
    await files.emptyTrash();
    expect(await files.thumbnail(record.hash)).toBeNull();
  });

  it("notifies subscribers after changes", async () => {
    const files = library();
    let calls = 0;
    files.subscribe(() => calls++);
    await files.add(file("a.png", "x"));
    expect(calls).toBe(1);
  });
});
