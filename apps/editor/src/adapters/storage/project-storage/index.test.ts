import assert from "node:assert/strict";

import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { describe, it } from "vitest";

import {
  ProjectRepository,
  ProjectStorageError,
  createBrowserProjectRepository,
} from "$/adapters/storage/project-storage";
import { IndexedDbProjectStorage } from "$/adapters/storage/project-storage/indexeddb";
import { OpfsPayloadStore, supportsOpfs } from "$/adapters/storage/project-storage/opfs";

describe("project-storage", () => {
  it("project-storage behavior", async () => {
    const factory = new IDBFactory();
    const a = createBrowserProjectRepository({
      factory,
      databaseName: "draft-test",
      preferOpfs: false,
    });
    const b = createBrowserProjectRepository({
      factory,
      databaseName: "draft-test",
      preferOpfs: false,
    });
    const input = {
      projectId: "project-a",
      expectedHead: null,
      metadata: { name: "Project A", revision: 1 },
      bytes: new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4),
    };
    const first = await a.save(input);
    assert.deepEqual([...(await b.load("project-a")).bytes], [1, 2, 3]);
    assert.equal(first.head.backend, "indexeddb");
    assert.equal((await b.list()).length, 1);
    await assert.rejects(b.save(input), (error) => error.code === "conflict");
    const race = await Promise.allSettled([
      a.save({ ...input, expectedHead: first.head.id, bytes: new Uint8Array([4]) }),
      b.save({ ...input, expectedHead: first.head.id, bytes: new Uint8Array([5]) }),
    ]);
    assert.equal(
      race.filter((result) => result.status === "fulfilled").length,
      1,
      "CAS permits exactly one concurrent publisher",
    );
    assert.equal(race.find((result) => result.status === "rejected").reason.code, "conflict");
    assert.equal((await a.load("project-a")).record.previous.id, first.head.id);
    assert.equal(await a.load("absent"), null);
    assert.equal(supportsOpfs(), false);

    const catalog = new IndexedDbProjectStorage({ factory, databaseName: "failure-test" });
    const values = new Map();
    const removed = [];
    let failure;
    const opfs = {
      kind: "opfs",
      async remove(id) {
        removed.push(id);
        values.delete(id);
      },
      async write(id, bytes) {
        if (failure === "quota") throw new DOMException("Full", "QuotaExceededError");
        values.set(id, new Uint8Array(failure === "partial" ? bytes.subarray(0, 1) : bytes));
      },
      async read(id) {
        if (failure === "permission") throw new DOMException("Denied", "NotAllowedError");
        const bytes = values.get(id);
        if (!bytes) throw new ProjectStorageError("corrupt", "Missing");
        return bytes;
      },
    };
    const repo = new ProjectRepository({
      catalog,
      stores: { opfs, indexeddb: catalog },
      preferredBackend: "opfs",
    });
    const good = await repo.save(input);
    for (const kind of ["quota", "partial"]) {
      failure = kind;
      await assert.rejects(repo.save({ ...input, expectedHead: good.head.id }));
      assert.equal(
        (await catalog.get("project-a")).head.id,
        good.head.id,
        "failed writes preserve head",
      );
    }
    failure = undefined;
    const second = await repo.save({
      ...input,
      expectedHead: good.head.id,
      bytes: new Uint8Array([6, 7]),
    });
    values.get(second.head.id)[0] = 99;
    const recovered = await repo.load("project-a");
    assert.equal(recovered.recovered, true);
    assert.deepEqual([...recovered.bytes], [1, 2, 3]);
    assert.equal(recovered.record.head.id, second.head.id, "recovery retains CAS token");
    const third = await repo.save({
      ...input,
      expectedHead: second.head.id,
      bytes: new Uint8Array([8, 9]),
    });
    assert.equal(
      third.previous.id,
      good.head.id,
      "save after recovery keeps verified previous snapshot",
    );
    assert.ok(
      removed.includes(second.head.id),
      "replaced damaged head is collected after recovery save",
    );
    assert.ok(values.has(good.head.id), "verified previous is retained");
    values.delete(third.head.id);
    assert.equal(
      (await repo.load("project-a")).recovered,
      true,
      "missing head can recover previous",
    );
    failure = "permission";
    await assert.rejects(
      repo.load("project-a"),
      (error) => error.name === "NotAllowedError",
      "permission failures do not become stale recovery",
    );
    failure = undefined;
    const noOpfs = new ProjectRepository({
      catalog,
      stores: { indexeddb: catalog },
      preferredBackend: "indexeddb",
    });
    await assert.rejects(noOpfs.load("project-a"), (error) => error.code === "unavailable");
    await assert.rejects(
      noOpfs.save({ ...input, expectedHead: third.head.id }),
      (error) => error.code === "unavailable",
      "existing OPFS projects never silently switch to IndexedDB",
    );
    values.delete(good.head.id);
    await assert.rejects(repo.load("project-a"), (error) => error.code === "corrupt");

    // Steady-state retention has exactly two generations, and a conflict collects
    // only the losing writer's newly created generation.
    const retainedCatalog = new IndexedDbProjectStorage({ factory, databaseName: "retention" });
    const retainedRepo = new ProjectRepository({
      catalog: retainedCatalog,
      stores: { opfs },
      preferredBackend: "opfs",
    });
    values.clear();
    const r1 = await retainedRepo.save(input);
    const r2 = await retainedRepo.save({ ...input, expectedHead: r1.head.id });
    const r3 = await retainedRepo.save({ ...input, expectedHead: r2.head.id });
    assert.deepEqual([...values.keys()].sort(), [r2.head.id, r3.head.id].sort());
    const retainedRace = await Promise.allSettled([
      retainedRepo.save({ ...input, expectedHead: r3.head.id }),
      retainedRepo.save({ ...input, expectedHead: r3.head.id }),
    ]);
    assert.equal(retainedRace.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(values.size, 2);
    assert.ok(values.has(r3.head.id));
    retainedRepo.close();

    const isolated = createBrowserProjectRepository({
      factory,
      databaseName: "isolated",
      preferOpfs: false,
    });
    assert.deepEqual(await isolated.list(), []);
    const retained = await catalog.read("missing").catch((error) => error);
    assert.equal(retained.code, "corrupt");
    await catalog.write("immutable", new Uint8Array([42]));
    await assert.rejects(catalog.write("immutable", new Uint8Array([0])));
    assert.deepEqual([...(await catalog.read("immutable"))], [42]);

    // Worker client copies buffers and preserves explicit worker/storage failures.
    const messages = [];
    const worker = {
      postMessage(message) {
        messages.push(message);
        queueMicrotask(() =>
          this.onmessage({
            data: {
              id: message.id,
              ok: true,
              bytes: message.operation === "read" ? new Uint8Array([7]).buffer : undefined,
            },
          }),
        );
      },
      terminate() {},
    };
    const workerStore = new OpfsPayloadStore("test-namespace", () => worker);
    const original = new Uint8Array([1, 2]);
    await workerStore.write("valid-key", original);
    assert.notEqual(messages[0].bytes, original.buffer);
    assert.equal(messages[0].namespace, "test-namespace");
    assert.deepEqual([...(await workerStore.read("valid-key"))], [7]);
    worker.postMessage = (message) =>
      queueMicrotask(() =>
        worker.onmessage({
          data: { id: message.id, ok: false, name: "QuotaExceededError", message: "Full" },
        }),
      );
    await assert.rejects(
      workerStore.write("another", original),
      (error) => error.name === "QuotaExceededError",
    );
    worker.onerror();
    await assert.rejects(workerStore.read("valid-key"), (error) => error.code === "io");
    workerStore.close();
    await assert.rejects(workerStore.read("valid-key"), (error) => error.code === "closed");
    for (const instance of [a, b, repo, isolated]) instance.close();
    await assert.rejects(a.list(), (error) => error.code === "closed");
    const workerBuild = await build({
      entryPoints: ["packages/bedrock/browser/opfs-worker.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { writeSnapshot } = await import(
      `data:text/javascript;base64,${Buffer.from(workerBuild.outputFiles[0].contents).toString("base64")}`
    );
    const written = [];
    let closed = 0,
      flushed = 0,
      truncated = -1;
    await writeSnapshot(
      {
        async createSyncAccessHandle() {
          return {
            write(bytes, { at }) {
              assert.equal(at, written.length);
              written.push(bytes[0]);
              return 1;
            },
            truncate(size) {
              truncated = size;
            },
            flush() {
              flushed++;
            },
            close() {
              closed++;
            },
          };
        },
      },
      new Uint8Array([2, 4, 6]).buffer,
    );
    assert.deepEqual(written, [2, 4, 6], "sync worker handles partial writes");
    assert.equal(truncated, 3);
    assert.equal(flushed, 1);
    assert.equal(closed, 1);
    await assert.rejects(
      writeSnapshot(
        {
          async createSyncAccessHandle() {
            return {
              write() {
                return 0;
              },
              truncate() {},
              flush() {},
              close() {
                closed++;
              },
            };
          },
        },
        new Uint8Array([1]).buffer,
      ),
      /invalid progress/,
    );
    assert.equal(closed, 2, "failed writes still close exclusive handle");
    let writableClosed = false;
    await writeSnapshot(
      {
        async createWritable() {
          return {
            async write(bytes) {
              assert.deepEqual([...new Uint8Array(bytes)], [5]);
            },
            async close() {
              writableClosed = true;
            },
            async abort() {},
          };
        },
      },
      new Uint8Array([5]).buffer,
    );
    assert.equal(writableClosed, true);
    await assert.rejects(
      writeSnapshot({}, new ArrayBuffer(0)),
      (error) => error.name === "NotSupportedError",
    );
    console.log(
      "Project storage verified: immutable snapshots, typed-array offsets, atomic CAS, concurrent writers, partial/quota failures, missing/corrupt recovery, backend pinning, isolation and worker lifecycle.",
    );
  }, 60_000);
});
