import { describe, expect, it, vi } from "vitest";

import type { WorkspaceRecoveryRepository } from "$/managers/ports/workspace-recovery";
import type { WorkspaceSessionPorts } from "$/managers/ports/workspace-session";
import { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { WorkspaceRecovery } from "$/managers/workspace/workspace-recovery";
import { exampleProjectName } from "$assets/examples/hello/hello-project";
import { createJsonStorage } from "@xprite/bedrock/browser/json-storage";
import { RasterEditor } from "@xprite/editor-core";
import { analyzePixelArt } from "@xprite/pixelate";

function harness() {
  const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
  const snapshot = new RasterEditor(pixels, "saved.png").getPersistenceSnapshot()!;
  const manifestId = "xse.workspace.manifest.v2";
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      version: 2,
      activeId: "saved-slot",
      views: [{ id: "saved-slot", documentId: "saved-slot" }],
      entries: [{ slotId: "saved-slot", projectId: "saved-project" }],
    }),
  );
  const records = new Map([
    [
      manifestId,
      {
        projectId: manifestId,
        metadata: { name: "Workspace", kind: "workspace" },
        head: { id: "manifest-head" },
        updatedAt: 1,
      },
    ],
    [
      "saved-project",
      {
        projectId: "saved-project",
        metadata: { name: "saved.png", kind: "editor-project" },
        head: { id: "project-head" },
        updatedAt: 1,
      },
    ],
    [
      "example",
      {
        projectId: "example",
        metadata: { name: exampleProjectName, kind: "editor-project" },
        head: { id: "example-head" },
        updatedAt: 1,
      },
    ],
  ]);
  const failure = new Error("OPFS worker failed");
  let failed = true;
  let pause: Promise<void> | undefined;
  const save = vi.fn<WorkspaceRecoveryRepository["save"]>();
  const load = vi.fn<WorkspaceRecoveryRepository["load"]>(async (id) => {
    if (pause) await pause;
    if (failed) throw failure;
    const record = records.get(id);
    return record
      ? { record, recovered: false, bytes: id === manifestId ? manifest : new Uint8Array([1]) }
      : null;
  });
  const recovery = new WorkspaceRecovery({
    repository: { list: async () => [...records.values()], load, save, close() {} },
    codec: {
      encode: async () => new Uint8Array([1]),
      decode: async () => structuredClone(snapshot),
      close() {},
    },
    settingsStore: { load: () => ({ enabled: false }), save() {} },
    createId: () => "recovery-test",
  });
  const ports: WorkspaceSessionPorts = {
    registerAsset: (source, name) => ({ source, name }),
    registerFile: (file) => ({ source: file.name, name: file.name }),
    registerProject: (name) => ({ source: name, name }),
    pickFiles: () => null,
    bindSourceToDocument() {},
    releaseDocumentHandle() {},
    listRecentImages: async () => [],
    saveRecentImages: async () => {},
    decode: async () => pixels,
    analyze: async () => analyzePixelArt(pixels),
    pixelate: async () => pixels,
    write: async () => ({ method: "download", name: "test.png" }),
  };
  let nextId = 0;
  const workspace = new DocumentWorkspace({
    ports,
    recovery,
    createId: () => `retry-${++nextId}`,
    preferenceStorage: createJsonStorage({ getItem: () => null, setItem() {} }),
  });
  return {
    workspace,
    recovery,
    save,
    load,
    manifest,
    records,
    failure,
    recover() {
      failed = false;
    },
    pause(value: Promise<void>) {
      pause = value;
    },
  };
}

describe("workspace startup recovery retry", () => {
  it("reinstalls the original workspace after transient IO without publishing empty defaults", async () => {
    const h = harness();
    await h.workspace.initialize();
    expect(h.workspace.getSnapshot().tabs).toHaveLength(0);
    expect(h.recovery.canWrite()).toBe(false);
    expect(h.save).not.toHaveBeenCalled();
    h.recover();
    const retry = h.workspace.retryRecovery();
    expect(h.workspace.retryRecovery()).toBe(retry);
    await retry;
    expect(h.recovery.canWrite()).toBe(true);
    expect(h.recovery.getSnapshot().error).toBeNull();
    expect(h.workspace.getSnapshot().tabs.map((tab) => tab.id)).toEqual(["saved-slot"]);
    expect(h.workspace.active.core.getSnapshot().document?.name).toBe("saved.png");
    expect(h.save).not.toHaveBeenCalled();
    expect(h.records.get("saved-project")?.head.id).toBe("project-head");
    await h.workspace.dispose();
  });

  it("preserves a document edited before the retry and leaves old snapshots untouched", async () => {
    const h = harness();
    await h.workspace.initialize();
    h.workspace.createDocument({ width: 3, height: 3 }, "current.png");
    const before = h.workspace.active.core.getPersistenceSnapshot();
    const loads = h.load.mock.calls.length;
    h.recover();
    await expect(h.workspace.retryRecovery()).rejects.toBe(h.failure);
    expect(h.workspace.active.core.getPersistenceSnapshot()).toEqual(before);
    expect(h.load).toHaveBeenCalledTimes(loads);
    expect(h.recovery.canWrite()).toBe(false);
    expect(h.save).not.toHaveBeenCalled();
    await h.workspace.dispose();
  });

  it.each([false, true])(
    "does not install recovery over a document created during IO (closed=%s)",
    async (closed) => {
      const h = harness();
      await h.workspace.initialize();
      h.recover();
      let release!: () => void;
      h.pause(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );
      const retry = h.workspace.retryRecovery();
      h.workspace.createDocument({ width: 3, height: 3 }, "current.png");
      const core = h.workspace.active.core;
      const before = core.getPersistenceSnapshot();
      if (closed) h.workspace.close(h.workspace.active.id);
      release();
      await expect(retry).rejects.toThrow("Workspace changed before recovery completed");
      expect(core.getPersistenceSnapshot()).toEqual(before);
      expect(h.recovery.canWrite()).toBe(false);
      expect(h.save).not.toHaveBeenCalled();
      expect(h.records.get("saved-project")?.head.id).toBe("project-head");
      await h.workspace.dispose();
    },
  );
});
