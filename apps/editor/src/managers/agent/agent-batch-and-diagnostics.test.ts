import { describe, expect, it } from "vitest";

import { AgentToolsManager } from "$/managers/agent/agent-tools-manager";
import { AgentToolName, type AgentToolsPort } from "$/managers/ports/agent-tools";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { BatchEditKind, RasterEditor } from "@xprite/editor-core";

function createTestManager(editor: RasterEditor) {
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
  const port: AgentToolsPort = {
    publish: () => () => {},
    encodePng: async () => new Uint8Array(),
    encodeBase64: (bytes) => Buffer.from(bytes).toString("base64"),
    decodeBase64: (value) => new Uint8Array(Buffer.from(value, "base64")),
    decodeImage: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
  };
  return new AgentToolsManager(workspace as unknown as DocumentWorkspace, port, () => {});
}

describe("agent applyBatch error diagnostics", () => {
  it("reports the failing operations[i] index when an operation fails input validation", async () => {
    const editor = new RasterEditor(
      { width: 4, height: 4, data: new Uint8ClampedArray(64) },
      "BatchTest",
    );
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    const manager = createTestManager(editor);
    const before = editor.getContentRevision();

    const missingLayerId = await manager.execute(AgentToolName.ApplyBatch, {
      documentId: "doc-1",
      expectedRevision: before,
      operations: [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          color: "#FF0000",
        },
        {
          type: BatchEditKind.FillRect,
          frameIndex: 0,
          rect: { x: 2, y: 2, width: 2, height: 2 },
          color: "#00FF00",
        },
      ],
    });

    expect(missingLayerId.ok).toBe(false);
    if (!missingLayerId.ok) {
      expect(missingLayerId.error.code).toBe("invalid_input");
      expect(missingLayerId.error.message).toMatch(/^operations\[1\]: /);
      expect(missingLayerId.error.message).toContain("layerId");
    }
    // Atomicity preserved.
    expect(editor.getContentRevision()).toBe(before);

    const unknownLayer = await manager.execute(AgentToolName.ApplyBatch, {
      documentId: "doc-1",
      expectedRevision: before,
      operations: [
        {
          type: BatchEditKind.AddLayer,
          layerId: "layer-2",
          name: "Layer 2",
        },
        {
          type: BatchEditKind.FillRect,
          layerId: "layer-2",
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: "#FFFFFF",
        },
        {
          type: BatchEditKind.FillRect,
          layerId: "does-not-exist",
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: "#FFFFFF",
        },
      ],
    });

    expect(unknownLayer.ok).toBe(false);
    if (!unknownLayer.ok) {
      expect(unknownLayer.error.code).toBe("not_found");
      expect(unknownLayer.error.message).toMatch(/^operations\[2\]: /);
    }
    expect(editor.getContentRevision()).toBe(before);
  });

  it("exposes deduplicated linked-cel findings and blend-mode-aware palette analysis via execute()", async () => {
    const editor = new RasterEditor();
    editor.document.loadImage(
      { width: 4, height: 4, data: new Uint8ClampedArray(64) },
      "AgentDiag",
      [
        [30, 50, 90, 255],
        [255, 190, 80, 255],
      ],
    );
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    const manager = createTestManager(editor);

    const batch = await manager.execute(AgentToolName.ApplyBatch, {
      documentId: "doc-1",
      expectedRevision: editor.getContentRevision(),
      operations: [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: "#1E325A",
        },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 0, duplicate: false },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 1, duplicate: false },
        { type: BatchEditKind.LinkCels, layerId, frameIndices: [0, 1, 2] },
        { type: BatchEditKind.AddLayer, layerId: "fx", name: "Warm Glow", afterLayerId: layerId },
        {
          type: BatchEditKind.SetLayer,
          layerId: "fx",
          blendMode: "Screen",
          opacity: 128,
        },
        {
          type: BatchEditKind.FillRect,
          layerId: "fx",
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: "#FFBE50",
        },
      ],
    });
    expect(batch.ok).toBe(true);

    const validation = await manager.execute(AgentToolName.Validate, {
      documentId: "doc-1",
      checks: ["strays"],
    });
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      const data = validation.data as {
        findings: { layerId?: string; frameIndices?: number[]; message: string }[];
      };
      const baseFindings = data.findings.filter((finding) => finding.layerId === layerId);
      expect(baseFindings).toHaveLength(1);
      expect(baseFindings[0].frameIndices).toEqual([0, 1, 2]);
    }

    const analyzed = await manager.execute(AgentToolName.Palette, {
      documentId: "doc-1",
      op: "analyze",
    });
    expect(analyzed.ok).toBe(true);
    if (analyzed.ok) {
      const data = analyzed.data as {
        offPaletteColors: unknown[];
        blendedCompositeColors: unknown[];
        verdict: string;
      };
      expect(data.offPaletteColors).toEqual([]);
      expect(data.blendedCompositeColors.length).toBeGreaterThan(0);
      expect(data.verdict).toBe("clean");
    }
  });
});
