import assert from "node:assert/strict";

import { IDBFactory } from "fake-indexeddb";
import { describe, it } from "vitest";

import { IndexedDbProjectStorage } from "$/adapters/storage/project-storage/indexeddb";
import {
  PayloadKind,
  ProjectStorageError,
  type PayloadStore,
  type ProjectCatalog,
} from "$/managers/ports/project-storage";
import { ProjectBytesOwnership } from "$/managers/ports/project-storage";
import { ProjectRepository } from "$/managers/storage/project-repository";
import type { ExclusiveOperation } from "@xprite/bedrock/browser/exclusive-lock";
import { randomId, sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";
import { RECOVERY_MAGIC, RECOVERY_HEADER_BYTES } from "@xprite/editor-core/import-export";

/** Three valid, independent RGBA cels, large enough to use object storage. */
function recoveryBytes(middle = 2, last = 3): Uint8Array {
  const chunk = (type: number, payload: Uint8Array) => {
    const bytes = new Uint8Array(6 + payload.length),
      view = new DataView(bytes.buffer);
    view.setUint32(0, bytes.length, true);
    view.setUint16(4, type, true);
    bytes.set(payload, 6);
    return bytes;
  };
  const layer = new Uint8Array(24),
    layerView = new DataView(layer.buffer);
  layerView.setUint16(0, 3, true);
  layer[12] = 255;
  layerView.setUint16(16, 6, true);
  layer.set(new TextEncoder().encode("Pixels"), 18);
  const frames = [1, middle, last].map((color, index) => {
    const cel = new Uint8Array(20 + 256 * 128 * 4),
      celView = new DataView(cel.buffer);
    cel[6] = 255;
    celView.setUint16(16, 256, true);
    celView.setUint16(18, 128, true);
    cel.fill(color, 20);
    const chunks = index ? [chunk(0x2005, cel)] : [chunk(0x2004, layer), chunk(0x2005, cel)];
    const frame = new Uint8Array(16 + chunks.reduce((n, c) => n + c.length, 0));
    const view = new DataView(frame.buffer);
    view.setUint32(0, frame.length, true);
    view.setUint16(4, 0xf1fa, true);
    view.setUint16(6, chunks.length, true);
    view.setUint16(8, 100, true);
    view.setUint32(12, chunks.length, true);
    let at = 16;
    for (const c of chunks) {
      frame.set(c, at);
      at += c.length;
    }
    return frame;
  });
  const ase = new Uint8Array(128 + frames.reduce((n, f) => n + f.length, 0));
  const header = new DataView(ase.buffer);
  header.setUint32(0, ase.length, true);
  header.setUint16(4, 0xa5e0, true);
  header.setUint16(6, frames.length, true);
  header.setUint16(8, 256, true);
  header.setUint16(10, 128, true);
  header.setUint16(12, 32, true);
  header.setUint32(14, 1, true);
  ase[34] = ase[35] = 1;
  let offset = 128;
  for (const frame of frames) {
    ase.set(frame, offset);
    offset += frame.length;
  }
  const metadata = new TextEncoder().encode(
    JSON.stringify({
      name: "large",
      dirty: true,
      activeFrame: 0,
      activeLayer: 0,
      composeGroups: false,
    }),
  );
  const bytes = new Uint8Array(RECOVERY_HEADER_BYTES + metadata.length + ase.length);
  bytes.set(RECOVERY_MAGIC);
  const envelope = new DataView(bytes.buffer);
  envelope.setUint32(8, 1, true);
  envelope.setUint32(12, metadata.length, true);
  envelope.setUint32(16, ase.length, true);
  bytes.set(metadata, RECOVERY_HEADER_BYTES);
  bytes.set(ase, RECOVERY_HEADER_BYTES + metadata.length);
  return bytes;
}

describe("recovery object generations", () => {
  it("copies mutable callers, borrows explicit immutable codec output, and still rejects bad read-back", async () => {
    const catalog = new IndexedDbProjectStorage({
      factory: new IDBFactory(),
      databaseName: "snapshot-ownership",
    });
    const values = new Map<string, Uint8Array>();
    const written: Uint8Array[] = [];
    let damage = false;
    const store: PayloadStore = {
      kind: PayloadKind.Opfs,
      async write(id, bytes) {
        written.push(bytes);
        const stored = bytes.slice();
        if (damage) stored[0] ^= 1;
        values.set(id, stored);
      },
      async read(id) {
        const bytes = values.get(id);
        if (!bytes) throw new ProjectStorageError("corrupt", "Missing object");
        return bytes.slice();
      },
      async remove(id) {
        values.delete(id);
      },
    };
    const repository = new ProjectRepository({
      makeId: randomId,
      now: Date.now,
      checksum: sha256Hex,
      catalog,
      stores: { [PayloadKind.Opfs]: store },
      preferredBackend: PayloadKind.Opfs,
    });
    const mutable = new Uint8Array([1, 2, 3]);
    const firstSave = repository.save({
      projectId: "mutable",
      expectedHead: null,
      metadata: { name: "Mutable" },
      bytes: mutable,
    });
    mutable[0] = 99;
    await firstSave;
    assert.notEqual(written[0], mutable);
    assert.deepEqual((await repository.load("mutable"))!.bytes, new Uint8Array([1, 2, 3]));
    const immutable = new Uint8Array([4, 5, 6]);
    const saved = await repository.save({
      projectId: "immutable",
      expectedHead: null,
      metadata: { name: "Immutable" },
      bytes: immutable,
      bytesOwnership: ProjectBytesOwnership.Immutable,
    });
    assert.equal(written[1], immutable, "fresh codec envelope does not get copied again");
    assert.deepEqual((await repository.load("immutable"))!.bytes, immutable);
    damage = true;
    await assert.rejects(
      repository.save({
        projectId: "immutable",
        expectedHead: saved.head.id,
        metadata: { name: "Immutable" },
        bytes: new Uint8Array([7, 8, 9]),
        bytesOwnership: ProjectBytesOwnership.Immutable,
      }),
      (error: unknown) => error instanceof ProjectStorageError && error.code === "corrupt",
    );
    assert.equal((await catalog.get("immutable"))!.head.id, saved.head.id);
    assert.deepEqual(
      immutable,
      new Uint8Array([4, 5, 6]),
      "borrowing never detaches retry/archive bytes",
    );
    repository.close();
  });

  function sharedStorage(exclusiveEnabled = true) {
    const catalog = new IndexedDbProjectStorage({
      factory: new IDBFactory(),
      databaseName: "shared-recovery",
    });
    const values = new Map<string, Uint8Array>();
    let writes = 0;
    const store: PayloadStore = {
      kind: PayloadKind.Opfs,
      async write(id, bytes) {
        writes++;
        values.set(id, bytes.slice());
      },
      async read(id) {
        const bytes = values.get(id);
        if (!bytes) throw new ProjectStorageError("corrupt", "Missing object");
        return bytes.slice();
      },
      async remove(id) {
        values.delete(id);
      },
    };
    let tail = Promise.resolve();
    const exclusive: ExclusiveOperation = (operation) => {
      const result = tail.then(operation);
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    };
    const create = (projectCatalog: ProjectCatalog = catalog, locked = exclusiveEnabled) =>
      new ProjectRepository({
        makeId: randomId,
        now: Date.now,
        checksum: sha256Hex,
        catalog: projectCatalog,
        stores: { [PayloadKind.Opfs]: store },
        preferredBackend: PayloadKind.Opfs,
        ...(locked ? { exclusive } : {}),
      });
    return { catalog, values, create, writes: () => writes };
  }

  it("shares checkpoint bytes and keeps every archive readable while the source advances or is removed", async () => {
    const { create, values, writes } = sharedStorage();
    const writer = create(),
      archiver = create();
    const bytes = recoveryBytes();
    const first = await writer.save({
      projectId: "art",
      metadata: { name: "Art" },
      expectedHead: null,
      bytes,
    });
    const before = writes();
    const checkpoint = await archiver.save({
      projectId: "backup",
      metadata: { name: "Art backup" },
      expectedHead: null,
      bytes,
      reuseFromProjectId: "art",
    });
    assert.equal(writes(), before, "unchanged archive allocates no payload bytes");
    assert.notEqual(
      first.head.id,
      checkpoint.head.id,
      "each catalog revision has its own CAS token",
    );
    assert.deepEqual(checkpoint.head.parts, first.head.parts);
    let current = first;
    for (const color of [42, 43, 44]) {
      current = await writer.save({
        projectId: "art",
        metadata: { name: "Art" },
        expectedHead: current.head.id,
        bytes: recoveryBytes(color),
      });
      assert.deepEqual((await archiver.load("backup"))!.bytes, bytes);
    }
    await writer.remove("art", current.head.id);
    assert.deepEqual((await archiver.load("backup"))!.bytes, bytes);
    await archiver.remove("backup", checkpoint.head.id);
    assert.equal(values.size, 0, "last reference collects all shared and private objects");
    writer.close();
    archiver.close();
  });

  it("serializes cross-project archiving with deletion and does not share between unlocked projects", async () => {
    for (const locked of [true, false]) {
      const { create, values } = sharedStorage(locked);
      const writer = create(),
        archiver = create();
      const bytes = new Uint8Array([1, 2, 3]);
      const source = await writer.save({
        projectId: "art",
        metadata: { name: "Art" },
        expectedHead: null,
        bytes,
      });
      const [backup] = await Promise.all([
        archiver.save({
          projectId: "backup",
          metadata: { name: "Backup" },
          expectedHead: null,
          bytes,
          reuseFromProjectId: "art",
        }),
        writer.remove("art", source.head.id),
      ]);
      assert.deepEqual((await archiver.load("backup"))!.bytes, bytes);
      if (locked) assert.equal(backup.head.parts![0].id, source.head.id);
      else assert.notEqual(backup.head.id, source.head.id);
      await archiver.remove("backup", backup.head.id);
      assert.equal(values.size, 0);
      writer.close();
      archiver.close();
    }
  });

  it("reports a durable save as successful when the subsequent garbage-collection scan fails", async () => {
    const { catalog, create } = sharedStorage();
    const repository = create({
      get: (id) => catalog.get(id),
      publish: (record, expected) => catalog.publish(record, expected),
      async list() {
        throw new Error("Scan temporarily unavailable");
      },
    });
    const saved = await repository.save({
      projectId: "art",
      metadata: { name: "Art" },
      expectedHead: null,
      bytes: new Uint8Array([1]),
    });
    assert.equal((await repository.load("art"))!.record.head.id, saved.head.id);
    await repository.save({
      projectId: "art",
      metadata: { name: "Art" },
      expectedHead: saved.head.id,
      bytes: new Uint8Array([2]),
    });
    repository.close();
    catalog.close();
  });

  it("does not collect shared objects from a context without cross-tab locking", async () => {
    const { create } = sharedStorage();
    const writer = create(),
      unlocked = create(undefined, false);
    const bytes = recoveryBytes();
    const source = await writer.save({
      projectId: "art",
      metadata: { name: "Art" },
      expectedHead: null,
      bytes,
    });
    await writer.save({
      projectId: "backup",
      metadata: { name: "Backup" },
      expectedHead: null,
      bytes,
      reuseFromProjectId: "art",
    });
    await unlocked.remove("art", source.head.id);
    assert.deepEqual((await writer.load("backup"))!.bytes, bytes);
    writer.close();
    unlocked.close();
  });

  it("reuses unchanged cels, preserves both valid heads on failure and collects only unreferenced objects", async () => {
    const catalog = new IndexedDbProjectStorage({
      factory: new IDBFactory(),
      databaseName: "recovery-object-test",
    });
    const values = new Map<string, Uint8Array>();
    let untilFailure = Infinity;
    const store: PayloadStore = {
      kind: PayloadKind.Opfs,
      async write(id, bytes) {
        if (--untilFailure === 0) throw new DOMException("Full", "QuotaExceededError");
        assert.ok(!values.has(id), "existing objects are never overwritten");
        values.set(id, bytes.slice());
      },
      async read(id) {
        const bytes = values.get(id);
        if (!bytes) throw new ProjectStorageError("corrupt", "Missing object");
        return bytes.slice();
      },
      async remove(id) {
        values.delete(id);
      },
    };
    const repository = new ProjectRepository({
      makeId: randomId,
      now: Date.now,
      checksum: sha256Hex,
      catalog,
      stores: { [PayloadKind.Opfs]: store },
      preferredBackend: PayloadKind.Opfs,
    });
    const input = { projectId: "artwork", metadata: { name: "Art" } };
    const first = await repository.save({ ...input, expectedHead: null, bytes: recoveryBytes() });
    assert.ok(first.head.parts && first.head.parts.length > 1);
    const second = await repository.save({
      ...input,
      expectedHead: first.head.id,
      bytes: recoveryBytes(42),
    });
    const firstIds = new Set(first.head.parts.map((p) => p.id));
    assert.equal(
      second.head.parts!.filter((p) => !firstIds.has(p.id)).length,
      1,
      "only the changed cel is written",
    );
    const thirdBytes = recoveryBytes(42, 77);
    const third = await repository.save({
      ...input,
      expectedHead: second.head.id,
      bytes: thirdBytes,
    });
    assert.deepEqual((await repository.load(input.projectId))!.bytes, thirdBytes);
    for (const part of [...third.head.parts!, ...third.previous!.parts!])
      assert.ok(values.has(part.id));
    const count = values.size;
    untilFailure = 2;
    await assert.rejects(
      repository.save({ ...input, expectedHead: third.head.id, bytes: recoveryBytes(55, 88) }),
      /Full/,
    );
    assert.equal((await catalog.get(input.projectId))!.head.id, third.head.id);
    assert.equal(
      values.size,
      count,
      "failed new objects are cleaned up without touching reused objects",
    );
    assert.deepEqual((await repository.load(input.projectId))!.bytes, thirdBytes);
    const previousIds = new Set(third.previous!.parts!.map((p) => p.id));
    const changed = third.head.parts!.find((p) => !previousIds.has(p.id))!;
    values.get(changed.id)![0] ^= 1;
    const recovered = (await repository.load(input.projectId))!;
    assert.equal(recovered.recovered, true);
    assert.deepEqual(recovered.bytes, recoveryBytes(42));
    await repository.remove(input.projectId, third.head.id);
    assert.equal(values.size, 0);
    repository.close();
  });
});
