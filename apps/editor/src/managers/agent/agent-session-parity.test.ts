import { describe, expect, it, vi } from "vitest";

import { AgentToolsManager } from "$/managers/agent/agent-tools-manager";
import { AgentToolName, type AgentToolsPort } from "$/managers/ports/agent-tools";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { SaveTarget } from "$/managers/workspace/save-target";
import { BatchEditKind, RasterEditor } from "@xprite/editor-core";
import { SessionOutcome } from "@xprite/editor-core/session";

function createPort(overrides: Partial<AgentToolsPort> = {}): AgentToolsPort {
  return {
    publish: () => () => {},
    encodePng: async () => new Uint8Array(),
    encodeBase64: (bytes) => Buffer.from(bytes).toString("base64"),
    decodeBase64: (value) => new Uint8Array(Buffer.from(value, "base64")),
    decodeImage: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
    ...overrides,
  };
}

describe("agent session parity with UI workflows", () => {
  it("uses the shared file-save checkpoint and receipt sequence for manageDocument save", async () => {
    const editor = new RasterEditor(
      { width: 2, height: 2, data: new Uint8ClampedArray(16) },
      "sprite.aseprite",
    );
    const session = {
      getSnapshot: () => ({ busy: false, pendingImport: null, replacement: null }),
      canSave: () => true,
      save: vi.fn(async () => SessionOutcome.Created),
      getLastSaveMethod: () => "download" as const,
    };
    const slot = { id: "view-1", documentId: "doc-1", core: editor, session };
    const workspace = {
      getSnapshot: () => ({ tabs: [{ id: "view-1" }], activeId: "view-1" }),
      getSlot: () => slot,
      getSaveTarget: () => SaveTarget.FileSystem,
      saveInBrowser: vi.fn(async () => {}),
      checkpointSavedFile: vi.fn(async () => "failed" as const),
      recordFileOutputCheckpoint: vi.fn(),
      linkRecentFileToWorkspaceProject: vi.fn(),
    };
    const manager = new AgentToolsManager(
      workspace as unknown as DocumentWorkspace,
      createPort(),
      () => {},
    );

    const response = await manager.execute(AgentToolName.ManageDocument, {
      documentId: "doc-1",
      op: "save",
    });

    expect(response.ok).toBe(true);
    expect(workspace.checkpointSavedFile).toHaveBeenCalledWith("view-1");
    expect(workspace.recordFileOutputCheckpoint).toHaveBeenCalledWith("view-1", true, "failed");
    // Failed recovery checkpoint must not falsely link the recent file (matches UI save parity).
    expect(workspace.linkRecentFileToWorkspaceProject).not.toHaveBeenCalled();
  });

  it("reports inkBounds for tilemap layers just like raster image layers", async () => {
    const editor = new RasterEditor(
      { width: 4, height: 4, data: new Uint8ClampedArray(64) },
      "tile-bounds.aseprite",
    );
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 2, y: 2, width: 2, height: 2 },
          color: "#00FF00",
        },
        {
          type: BatchEditKind.ConvertToTilemap,
          layerId,
          tileWidth: 2,
          tileHeight: 2,
        },
      ],
      editor.getContentRevision(),
      "Setup tilemap",
    );
    const slot = {
      id: "view-1",
      documentId: "doc-1",
      core: editor,
      session: { getSnapshot: () => ({}) },
    };
    const workspace = {
      getSnapshot: () => ({ tabs: [{ id: "view-1" }], activeId: "view-1" }),
      getSlot: () => slot,
    };
    const manager = new AgentToolsManager(
      workspace as unknown as DocumentWorkspace,
      createPort(),
      () => {},
    );

    const context = await manager.execute(AgentToolName.GetContext, {
      documentId: "doc-1",
      includeInkBounds: true,
    });
    expect(context.ok).toBe(true);
    if (context.ok) {
      const data = context.data as {
        document: { layers: { kind: string; inkBounds: unknown }[] };
      };
      expect(data.document.layers[0].kind).toBe("tilemap");
      expect(data.document.layers[0].inkBounds).toEqual({ x: 2, y: 2, width: 2, height: 2 });
    }
  });

  it("clips and alpha-composites semi-transparent pixels in importImage via shared overlay helpers", async () => {
    const editor = new RasterEditor(
      { width: 4, height: 4, data: new Uint8ClampedArray(64) },
      "import-blend.aseprite",
    );
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 4, height: 4 },
          color: "#0000FF",
        },
      ],
      editor.getContentRevision(),
      "Blue base",
    );
    const slot = {
      id: "view-1",
      documentId: "doc-1",
      core: editor,
      session: { getSnapshot: () => ({}) },
    };
    const workspace = {
      getSnapshot: () => ({ tabs: [{ id: "view-1" }], activeId: "view-1" }),
      getSlot: () => slot,
    };
    const overlay = {
      width: 2,
      height: 1,
      data: Uint8ClampedArray.of(0, 0, 0, 0, 255, 0, 0, 128),
    };
    const manager = new AgentToolsManager(
      workspace as unknown as DocumentWorkspace,
      createPort({ decodeImage: async () => overlay }),
      () => {},
    );

    const imported = await manager.execute(AgentToolName.ImportImage, {
      documentId: "doc-1",
      expectedRevision: editor.getContentRevision(),
      bytes: Buffer.from([1, 2, 3, 4]).toString("base64"),
      format: "png",
      layerId,
      newLayer: false,
      position: { x: 0, y: 0 },
    });
    expect(imported.ok).toBe(true);
    const pixels = editor.canvas.composite().data;
    // (0,0) transparent overlay preserved blue base.
    expect(Array.from(pixels.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    // (1,0) 50% red blended onto blue base.
    expect(pixels[4]).toBeGreaterThan(120);
    expect(pixels[6]).toBeGreaterThan(120);
    expect(pixels[7]).toBe(255);
  });
});
