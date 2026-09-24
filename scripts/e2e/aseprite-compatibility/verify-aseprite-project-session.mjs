import assert from "node:assert/strict";
import fs from "node:fs";

import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";

async function bundle(entryPoint) {
  const { outputFiles } = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
  );
}

const ase = await bundle("apps/editor/src/adapters/files/aseprite-files.ts");
const idb = await bundle("apps/editor/src/adapters/storage/indexeddb/recents.ts");
const bytes = fs.readFileSync("apps/editor/assets/examples/xprite/xprite.ase");
const sparseHuge = new Uint8Array(bytes);
const sparseHeader = new DataView(sparseHuge.buffer);
sparseHeader.setUint16(8, 16384, true);
sparseHeader.setUint16(10, 16384, true);
await assert.rejects(
  ase.decodeAsepriteBlob(new Blob([sparseHuge]), "sparse-huge.aseprite"),
  /canvas.*browser resource limit for Aseprite projects/,
);
const project = await ase.decodeAsepriteBlob(new Blob([bytes]), "xprite.ase");
assert.equal(project.image.width, 65);
assert.equal(project.timeline.layers.length, 1);
assert.equal(project.timeline.frames.length, 10);
assert.ok(project.timeline.asepriteSource);

// Save/reopen through the activation-safe picker path, then decode the bytes
// with the same adapter used by browser imports. Compression starts only after
// the picker has been invoked, so the originating activation is retained.
let saved;
let compressionCalls = 0;
class TestCompressionStream {
  constructor(format) {
    compressionCalls++;
    return new globalThis.CompressionStream(format);
  }
}
let pickerCalled = false;
const result = await ase.saveAseprite(project, "xprite.ase", "save", {
  compressionStream: TestCompressionStream,
  saveFilePicker: async (options) => {
    pickerCalled = true;
    assert.equal(compressionCalls, 0);
    return {
      name: options.suggestedName,
      createWritable: async () => ({
        write: async (blob) => {
          saved = new Uint8Array(await blob.arrayBuffer());
        },
        close: async () => {},
      }),
    };
  },
});
assert.equal(result.method, "picker");
assert.equal(pickerCalled, true);
assert.ok(compressionCalls > 0);
assert.ok(saved?.byteLength > 0);
const reopened = await ase.decodeAsepriteBlob(new Blob([saved]), "xprite.ase");
assert.equal(reopened.timeline.layers.length, project.timeline.layers.length);
assert.equal(reopened.timeline.frames.length, project.timeline.frames.length);

await assert.rejects(
  ase.saveAseprite(project, "cancelled.aseprite", "save", {
    compressionStream: TestCompressionStream,
    saveFilePicker: async () => {
      throw new DOMException("cancelled", "AbortError");
    },
  }),
  /cancelled/,
);
await assert.rejects(
  ase.saveAseprite(project, "failed.aseprite", "save", {
    compressionStream: TestCompressionStream,
    saveFilePicker: async () => ({
      name: "failed.aseprite",
      createWritable: async () => ({
        write: async () => {
          throw new Error("disk full");
        },
        close: async () => {},
      }),
    }),
  }),
  /disk full/,
);

// Persist the full graph alongside the current composite preview and verify a
// new adapter instance can reopen it from IndexedDB.
const factory = new IDBFactory();
const first = new idb.IndexedDbRecentImages({
  factory,
  databaseName: "aseprite-project-session-test",
});
await first.save([
  {
    id: "aseprite-project",
    name: "xprite.ase",
    image: project.image,
    project,
  },
]);
const second = new idb.IndexedDbRecentImages({
  factory,
  databaseName: "aseprite-project-session-test",
});
const loaded = await second.load();
assert.equal(loaded.length, 1);
assert.ok(loaded[0].project);
assert.equal(loaded[0].project.timeline.frames.length, 10);
assert.equal(loaded[0].project.timeline.layers.length, 1);
loaded[0].project.timeline.frames[0].cels[0].pixels.data[0] ^= 255;
assert.notEqual(
  loaded[0].project.timeline.frames[0].cels[0].pixels.data[0],
  (await second.load())[0].project.timeline.frames[0].cels[0].pixels.data[0],
);

console.log(
  "Aseprite project session: import, activation-safe save/reopen, and full-graph IndexedDB persistence passed.",
);
