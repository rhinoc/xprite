import { describe, it, expect, vi } from "vitest";

import { ProjectStorageError } from "$/managers/ports/project-storage";
import type { WorkspaceSessionPorts } from "$/managers/ports/workspace-session";
import { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import type { WorkspaceRecovery } from "$/managers/workspace/workspace-recovery";
import { createJsonStorage } from "@xprite/bedrock/browser/json-storage";
import { analyzePixelArt } from "@xprite/pixelate";

async function fixture() {
  const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) };
  let failure: unknown = null;
  let documentId = "";
  let recoveryChanged: (() => void) | undefined;
  let pending = false;
  const recovery = {
    subscribe: (listener: () => void) => {
      recoveryChanged = listener;
      return () => {};
    },
    getSnapshot: () => ({ error: failure, documents: { [documentId]: { error: failure } } }),
    restore: async () => null,
    findProjectByName: async () => null,
    seedProject: async () => null,
    start() {},
    updateLayout() {},
    suspend(error: unknown) {
      throw error;
    },
    flush: vi.fn(async () => {}),
    checkpointSlot: vi.fn(async (_id: string) => !pending),
    isSlotCheckpointUnpersisted: () => pending,
    dispose() {},
    getSlotProjectId: () => null,
    isSlotUnpersisted: () => pending,
    hasUnpersistedWorkspaceChanges: () => pending,
  };
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
    write: async () => ({ method: "file", name: "Written.png" }),
    dispose() {},
  };
  const reported = vi.fn();
  let id = 0;
  const workspace = new DocumentWorkspace({
    ports,
    onSessionError: reported,
    recovery: recovery as unknown as WorkspaceRecovery,
    createId: () => `receipt-${++id}`,
    preferenceStorage: createJsonStorage({ getItem: () => null, setItem() {} }),
  });
  await workspace.initialize();
  workspace.createDocumentFromImage(pixels, undefined, "Fixture.png");
  documentId = workspace.active.documentId;
  return {
    workspace,
    recovery,
    reported,
    setFailure: (error: unknown) => {
      failure = error;
    },
    setPending: (value: boolean) => {
      pending = value;
      recoveryChanged?.();
    },
  };
}

describe("post-file checkpoint boundary", () => {
  it("retains recorded CAS conflict and local dirty/close guard without changing content", async () => {
    const h = await fixture();
    const error = new ProjectStorageError("conflict", "another writer");
    h.setFailure(error);
    h.setPending(true);
    h.recovery.checkpointSlot.mockRejectedValue(error);
    const original = h.workspace.active.core.canvas.exportComposite().data.slice();
    expect(await h.workspace.checkpointSavedFile(h.workspace.active.id)).toBe("failed");
    expect(h.recovery.getSnapshot().error).toBe(error);
    expect(h.reported).toHaveBeenCalledExactlyOnceWith(error, "save");
    expect(h.workspace.active.core.canvas.exportComposite().data).toEqual(original);
    expect(h.workspace.isDocumentLocallyModified(h.workspace.active.id)).toBe(true);
    expect(h.workspace.needsBeforeUnloadWarning()).toBe(true);
    await h.workspace.dispose();
  });

  it("does not attribute a sibling/global failure to an acknowledged target checkpoint", async () => {
    const h = await fixture();
    const siblingError = new ProjectStorageError("conflict", "another writer in A");
    h.recovery.getSnapshot = () => ({
      error: siblingError,
      documents: { A: { error: siblingError } },
    });
    h.recovery.hasUnpersistedWorkspaceChanges = () => true;
    expect(await h.workspace.checkpointSavedFile(h.workspace.active.id)).toBe("saved");
    expect(h.recovery.checkpointSlot).toHaveBeenCalledWith(h.workspace.active.documentId);
    expect(h.recovery.flush).not.toHaveBeenCalled();
    expect(h.reported).not.toHaveBeenCalled();
    expect(h.workspace.needsBeforeUnloadWarning()).toBe(true);
    await h.workspace.dispose();
  });

  it("keeps partial-output status persistent and document-scoped until durable acknowledgement", async () => {
    const h = await fixture();
    const id = h.workspace.active.id;
    h.setPending(true);
    h.workspace.recordFileOutputCheckpoint(id, false, "failed");
    expect(h.workspace.getFileOutputRecoveryProblem(id)).toContain("The file was saved");
    h.workspace.active.session.clearNotice();
    expect(h.workspace.getFileOutputRecoveryProblem(id)).toContain("keep this document open");
    h.setPending(false);
    expect(h.workspace.getFileOutputRecoveryProblem(id)).toBeUndefined();
    h.setPending(true);
    expect(h.workspace.getFileOutputRecoveryProblem(id)).toBeUndefined();
    h.workspace.recordFileOutputCheckpoint(id, true, "pending");
    expect(h.workspace.getFileOutputRecoveryProblem(id)).toContain("download was started");
    h.workspace.recordFileOutputCheckpoint(id, true, "saved");
    expect(h.workspace.getFileOutputRecoveryProblem(id)).toBeUndefined();
    await h.workspace.dispose();
  });

  it("does not confuse new file edits with a recovery storage error", async () => {
    const h = await fixture();
    expect(h.workspace.active.session.hasUnsavedChanges()).toBe(true);
    expect(await h.workspace.checkpointSavedFile(h.workspace.active.id)).toBe("saved");
    expect(h.workspace.active.session.hasUnsavedChanges()).toBe(true);
    expect(h.recovery.getSnapshot().error).toBeNull();
    await h.workspace.dispose();
  });

  it("keeps a live paint transaction pending rather than committing it after output", async () => {
    const h = await fixture();
    const core = h.workspace.active.core;
    core.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 0, 255] });
    core.pointerDown({ x: 0, y: 0 });
    expect(core.hasPendingDocumentEdit()).toBe(true);
    expect(await h.workspace.checkpointSavedFile(h.workspace.active.id)).toBe("pending");
    expect(core.hasPendingDocumentEdit()).toBe(true);
    expect(h.workspace.needsBeforeUnloadWarning()).toBe(true);
    core.cancelPointerGesture();
    await h.workspace.dispose();
  });

  it("does not commit inline text started after the output snapshot", async () => {
    const h = await fixture();
    const core = h.workspace.active.core;
    core.drawing.settings.setSettings({
      tool: "text",
      foreground: [200, 0, 0, 255],
      font: {
        height: 1,
        lineHeight: 1,
        glyphs: {
          A: { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) },
        },
      },
    });
    expect(core.drawing.text.beginInlineText({ x: 0, y: 0, width: 2, height: 2 })).toBe(true);
    core.drawing.text.updateInlineText({ text: "A" });
    const text = core.getSnapshot().inlineText;
    const before = core.canvas.exportComposite().data.slice();
    expect(await h.workspace.checkpointSavedFile(h.workspace.active.id)).toBe("pending");
    expect(core.getSnapshot().inlineText).toEqual(text);
    expect(core.canvas.exportComposite().data).toEqual(before);
    expect(h.workspace.needsBeforeUnloadWarning()).toBe(true);
    await h.workspace.dispose();
  });

  it("uses the canonical document for linked views and shares its persistent warning", async () => {
    const h = await fixture();
    const documentId = h.workspace.active.documentId;
    expect(h.workspace.duplicateView()).toBe(true);
    expect(h.workspace.active.id).not.toBe(documentId);
    expect(await h.workspace.checkpointSavedFile(h.workspace.active.id)).toBe("saved");
    expect(h.recovery.checkpointSlot).toHaveBeenCalledWith(documentId);
    h.setPending(true);
    h.workspace.recordFileOutputCheckpoint(h.workspace.active.id, false, "failed");
    expect(h.workspace.getFileOutputRecoveryProblem(documentId)).toContain("The file was saved");
    await h.workspace.dispose();
  });

  it("never converts a recorded sibling error into this document's partial success", async () => {
    const h = await fixture();
    const error = new ProjectStorageError("conflict", "sibling A");
    h.recovery.getSnapshot = () => ({ error, documents: { A: { error } } });
    h.recovery.checkpointSlot.mockRejectedValue(error);
    await expect(h.workspace.checkpointSavedFile(h.workspace.active.id)).rejects.toBe(error);
    expect(h.reported).not.toHaveBeenCalled();
    await h.workspace.dispose();
  });

  it("does not swallow an unrecorded failure or a missing slot", async () => {
    const h = await fixture();
    const error = new Error("programming failure");
    h.recovery.checkpointSlot.mockRejectedValue(error);
    await expect(h.workspace.checkpointSavedFile(h.workspace.active.id)).rejects.toBe(error);
    await expect(h.workspace.checkpointSavedFile("closed")).rejects.toThrow("no longer open");
    await h.workspace.dispose();
  });

  it("retains manifest-only pending state and propagates attachment failure", async () => {
    const h = await fixture();
    h.setPending(true);
    expect(await h.workspace.checkpointSavedFile(h.workspace.active.id)).toBe("pending");
    h.setPending(false);
    const error = new Error("attachment failed");
    const remove = h.workspace.registerProjectAttachment({
      flush: async () => {
        throw error;
      },
      hasPendingChanges: () => true,
      remove: async () => {},
    });
    await expect(h.workspace.checkpointSavedFile(h.workspace.active.id)).rejects.toBe(error);
    expect(h.workspace.needsBeforeUnloadWarning()).toBe(true);
    remove();
    await h.workspace.dispose();
  });

  it("browser-target save still rejects a conflict without marking the document saved", async () => {
    const h = await fixture();
    const error = new ProjectStorageError("conflict", "another writer");
    h.setFailure(error);
    h.setPending(true);
    h.recovery.checkpointSlot.mockRejectedValue(error);
    h.recovery.flush.mockRejectedValue(error);
    await expect(h.workspace.saveInBrowser(h.workspace.active.id)).rejects.toBe(error);
    await expect(h.workspace.saveAsInBrowser(h.workspace.active.id, "Copy", "png")).rejects.toBe(
      error,
    );
    expect(h.workspace.active.session.hasUnsavedChanges()).toBe(true);
    await h.workspace.dispose();
  });
});
