import { serialize, deserialize } from "node:v8";

import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, vi } from "vitest";

import { createBrowserProjectStorage } from "$/adapters/storage/project-storage";
import { RecoverySettingsStore } from "$/adapters/storage/recovery-settings-store";
import { ProjectRepository } from "$/managers/storage/project-repository";
import { WorkspaceRecovery } from "$/managers/workspace/workspace-recovery";
import { createJsonStorage } from "@xprite/bedrock/browser/json-storage";
import { RasterEditor } from "@xprite/editor-core";

const blank = () => ({ width: 4, height: 4, data: new Uint8ClampedArray(64) });
const paint = (core: RasterEditor) => {
  core.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 255, 255] });
  core.pointerDown({ x: 1, y: 1 });
  core.pointerUp();
};
const layout = (ids: string[]) => ({
  activeId: ids.at(-1)!,
  slotIds: ids,
  views: ids.map((id) => ({ id, documentId: id })),
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function fixture() {
  const repository = new ProjectRepository(
    createBrowserProjectStorage({
      databaseName: "checkpoint-test",
      factory: new IDBFactory(),
      preferOpfs: false,
    }),
  );
  const recovery = new WorkspaceRecovery({
    createId: () => crypto.randomUUID(),
    repository,
    codec: {
      encode: async (snapshot) => new Uint8Array(serialize(snapshot)),
      decode: async (bytes) => deserialize(bytes),
      close() {},
    },
    settingsStore: new RecoverySettingsStore(
      "checkpoint",
      createJsonStorage({ getItem: () => null, setItem() {} }),
    ),
  });
  await recovery.restore();
  const A = new RasterEditor(blank(), "A.png"),
    B = new RasterEditor(blank(), "B.png");
  recovery.start(
    [
      { id: "A", core: A },
      { id: "B", core: B },
    ],
    layout(["A", "B"]),
  );
  await recovery.flush();
  return { repository, recovery, A, B };
}
async function conflictA(h: Awaited<ReturnType<typeof fixture>>) {
  const id = h.recovery.getSlotProjectId("A")!;
  const original = (await h.repository.load(id))!;
  const rival = await h.repository.save({
    projectId: id,
    bytes: original.bytes,
    metadata: original.record.metadata,
    expectedHead: original.record.head.id,
  });
  paint(h.A);
  await expect(h.recovery.checkpointSlot("A")).rejects.toMatchObject({ code: "conflict" });
  return { id, original, rival };
}

describe("document checkpoint isolation with real repository CAS", () => {
  it("acknowledges B independently while preserving A's conflicting head, bytes and workspace warning", async () => {
    const h = await fixture();
    try {
      const { id, original, rival } = await conflictA(h);
      paint(h.B);
      expect(await h.recovery.checkpointSlot("B")).toBe(true);
      expect(h.recovery.isSlotCheckpointUnpersisted("B")).toBe(false);
      expect(h.recovery.isSlotUnpersisted("B")).toBe(false);
      expect(h.recovery.isSlotCheckpointUnpersisted("A")).toBe(true);
      expect(h.recovery.hasUnpersistedWorkspaceChanges()).toBe(true);
      expect(h.recovery.getSnapshot().documents.A.error).toMatchObject({ code: "conflict" });
      const after = (await h.repository.load(id))!;
      expect(after.record.head.id).toBe(rival.head.id);
      expect(after.bytes).toEqual(original.bytes);
      const savedB = (await h.repository.load(h.recovery.getSlotProjectId("B")!))!;
      const restored = new RasterEditor();
      restored.restorePersistenceSnapshot(deserialize(savedB.bytes));
      expect(Array.from(restored.canvas.exportComposite().data.subarray(20, 24))).toEqual([
        255, 0, 255, 255,
      ]);
    } finally {
      h.recovery.dispose();
    }
  });

  it("waits for B's own delayed acknowledgement, not the early sibling rejection", async () => {
    const h = await fixture();
    const gate = deferred(),
      entered = deferred();
    const save = h.repository.save.bind(h.repository);
    try {
      await conflictA(h);
      const B = h.recovery.getSlotProjectId("B");
      vi.spyOn(h.repository, "save").mockImplementation(async (input) => {
        if (input.projectId === B) {
          entered.resolve();
          await gate.promise;
        }
        return save(input);
      });
      paint(h.B);
      let settled = false;
      const checkpoint = h.recovery.checkpointSlot("B").then((result) => {
        settled = true;
        return result;
      });
      await entered.promise;
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(h.recovery.isSlotCheckpointUnpersisted("B")).toBe(true);
      gate.resolve();
      expect(await checkpoint).toBe(true);
      expect(h.recovery.hasUnpersistedWorkspaceChanges()).toBe(true);
    } finally {
      gate.resolve();
      h.recovery.dispose();
    }
  });

  it("distinguishes a new B's durable head from unpublished workspace membership", async () => {
    const h = await fixture();
    try {
      await conflictA(h);
      const C = new RasterEditor(blank(), "new-B.png");
      h.recovery.start([{ id: "new-B", core: C }], layout(["A", "B", "new-B"]));
      expect(await h.recovery.checkpointSlot("new-B")).toBe(true);
      expect(h.recovery.isSlotCheckpointUnpersisted("new-B")).toBe(false);
      expect(h.recovery.isSlotUnpersisted("new-B")).toBe(true);
      expect(h.recovery.hasUnpersistedWorkspaceChanges()).toBe(true);
      expect(await h.repository.load(h.recovery.getSlotProjectId("new-B")!)).not.toBeNull();
    } finally {
      h.recovery.dispose();
    }
  });

  it("does not hide B's actual quota error behind A's conflict", async () => {
    const h = await fixture();
    try {
      await conflictA(h);
      const B = h.recovery.getSlotProjectId("B");
      const error = new DOMException("B quota", "QuotaExceededError");
      const save = h.repository.save.bind(h.repository);
      vi.spyOn(h.repository, "save").mockImplementation((input) =>
        input.projectId === B ? Promise.reject(error) : save(input),
      );
      paint(h.B);
      await expect(h.recovery.checkpointSlot("B")).rejects.toBe(error);
      expect(h.recovery.getSnapshot().documents.B.error).toBe(error);
      expect(h.recovery.getSnapshot().documents.A.error).toMatchObject({ code: "conflict" });
      expect(h.recovery.isSlotCheckpointUnpersisted("B")).toBe(true);
    } finally {
      h.recovery.dispose();
    }
  });
  it("rejects an old binding's receipt after a same-slot document replacement", async () => {
    const h = await fixture();
    const gate = deferred(),
      entered = deferred();
    const save = h.repository.save.bind(h.repository);
    try {
      const oldId = h.recovery.getSlotProjectId("B");
      vi.spyOn(h.repository, "save").mockImplementation(async (input) => {
        if (input.projectId === oldId) {
          entered.resolve();
          await gate.promise;
        }
        return save(input);
      });
      paint(h.B);
      const checkpoint = h.recovery.checkpointSlot("B");
      const rejection = expect(checkpoint).rejects.toThrow("Document recovery is not ready");
      await entered.promise;
      h.B.document.loadImage(blank(), "replacement.png");
      expect(h.recovery.getSlotProjectId("B")).not.toBe(oldId);
      gate.resolve();
      await rejection;
    } finally {
      gate.resolve();
      h.recovery.dispose();
    }
  });
});
