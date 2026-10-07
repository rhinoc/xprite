import { describe, expect, it, vi } from "vitest";

import type { WorkspaceSessionPorts } from "$/managers/ports/workspace-session";
import { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import type { WorkspaceRecovery } from "$/managers/workspace/workspace-recovery";
import { analyzePixelArt } from "@xprite/editor-core/import-export";

/** Sessions share file resources across document tabs and temporary sample initialization. */
describe("workspace file resource lifetime", () => {
  it("retains ports after sample bootstrap and document disposal, then disposes them once", async () => {
    let closed = false;
    const dispose = vi.fn(() => {
      closed = true;
    });
    const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    const ports: WorkspaceSessionPorts = {
      registerAsset: (source, name) => {
        if (closed) throw new Error("Image session is closed");
        return { source, name };
      },
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
      dispose,
    };
    const seedProject = vi.fn(async () => null);
    const recovery = {
      subscribe: () => () => {},
      getSnapshot: () => ({ error: null, documents: {} }),
      restore: async () => null,
      findProjectByName: async () => null,
      seedProject,
      start() {},
      updateLayout() {},
      suspend: (error: unknown) => {
        throw error;
      },
      flush: async () => {},
      dispose() {},
    } as unknown as WorkspaceRecovery;
    let id = 0;
    const workspace = new DocumentWorkspace({
      ports,
      recovery,
      createId: () => `lifetime-${++id}`,
      preferenceStorage: { getItem: () => null, setItem() {} },
    });
    await workspace.initialize();
    expect(seedProject).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
    expect(() => ports.registerAsset("after-bootstrap", "test.webp")).not.toThrow();
    workspace.active.session.dispose();
    expect(dispose).not.toHaveBeenCalled();
    workspace.dispose();
    workspace.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(() => ports.registerAsset("after-disposal", "test.webp")).toThrow(
      "Image session is closed",
    );
  });
});
