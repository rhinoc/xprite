import { describe, expect, it } from "vitest";

import { AGENT_TOOL_DEFINITIONS } from "$/managers/agent/agent-tool-definitions";
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
  it("applies cleanup operations suggested by validate and verifies the result", async () => {
    const pixels = {
      width: 6,
      height: 1,
      data: Uint8ClampedArray.of(
        255,
        0,
        0,
        255,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        255,
        0,
        127,
        0,
        255,
        0,
        255,
        0,
        255,
        0,
        255,
      ),
    };
    const editor = new RasterEditor(pixels);
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    const manager = createTestManager(editor);
    const input = { documentId: "doc-1", checks: ["strays", "antialiasing"] };
    const validation = await manager.execute(AgentToolName.Validate, input);
    if (!validation.ok) throw new Error(validation.error.message);
    const data = validation.data as {
      revision: number;
      findings: { cleanup: unknown }[];
    };
    const operations = data.findings.map(({ cleanup }) => cleanup);
    expect(operations).toEqual([
      { type: BatchEditKind.CleanPixels, layerId, frameIndex: 0, options: { removeOrphans: true } },
      { type: BatchEditKind.CleanPixels, layerId, frameIndex: 0, options: { crispAlpha: true } },
    ]);
    const cleaned = await manager.execute(AgentToolName.ApplyBatch, {
      documentId: input.documentId,
      expectedRevision: data.revision,
      label: "Clean validated pixels",
      operations,
    });
    expect(cleaned.ok).toBe(true);
    const after = await manager.execute(AgentToolName.Validate, input);
    expect(after).toMatchObject({ ok: true, data: { findings: [] } });
    expect(editor.canvas.composite().data[3]).toBe(0);
    editor.history.undo();
    expect(editor.canvas.composite().data).toEqual(pixels.data);
    expect(editor.getSnapshot().canUndo).toBe(false);
  });

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

  it("reads tilemap layer pixels via readPixels and documents tool return shapes", async () => {
    const editor = new RasterEditor(
      { width: 4, height: 4, data: new Uint8ClampedArray(64) },
      "TilemapRead",
    );
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    const manager = createTestManager(editor);

    const setup = await manager.execute(AgentToolName.ApplyBatch, {
      documentId: "doc-1",
      expectedRevision: editor.getContentRevision(),
      operations: [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          color: "#FF0000",
        },
        {
          type: BatchEditKind.ConvertToTilemap,
          layerId,
          tileWidth: 2,
          tileHeight: 2,
        },
        {
          type: BatchEditKind.AddLayer,
          layerId: "overlay",
          name: "Overlay",
          afterLayerId: layerId,
        },
        {
          type: BatchEditKind.FillRect,
          layerId: "overlay",
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 4, height: 4 },
          color: "#00FF00",
        },
        {
          type: BatchEditKind.GroupLayer,
          layerIds: ["overlay"],
          name: "Group",
        },
      ],
    });
    expect(setup.ok).toBe(true);
    const layers = editor.getSnapshot().document!.timeline!.layers;
    expect(layers[0].kind).toBe("tilemap");
    const groupLayer = layers.find((layer) => layer.kind === "group");
    expect(groupLayer).toBeDefined();

    // Read tilemap layer while it is active.
    const activeRead = await manager.execute(AgentToolName.ReadPixels, {
      documentId: "doc-1",
      layerId,
      rect: { x: 0, y: 0, width: 4, height: 2 },
      format: "grid",
    });
    expect(activeRead.ok).toBe(true);
    if (activeRead.ok) {
      const data = activeRead.data as {
        rows: string[];
        legend: Record<string, string>;
      };
      expect(data.rows).toEqual(["aa..", "aa.."]);
      expect(data.legend.a).toBe("#FF0000FF");
    }

    // Switch active layer away and read the tilemap layer while inactive.
    editor.timeline.selectLayer(1);
    const inactiveRead = await manager.execute(AgentToolName.ReadPixels, {
      documentId: "doc-1",
      layerId,
      rect: { x: 0, y: 0, width: 4, height: 2 },
      format: "grid",
    });
    expect(inactiveRead.ok).toBe(true);
    if (inactiveRead.ok) {
      const data = inactiveRead.data as {
        rows: string[];
        legend: Record<string, string>;
      };
      expect(data.rows).toEqual(["aa..", "aa.."]);
      expect(data.legend.a).toBe("#FF0000FF");
    }

    // Group layers are still rejected with a clear message.
    const groupRead = await manager.execute(AgentToolName.ReadPixels, {
      documentId: "doc-1",
      layerId: groupLayer!.id,
      rect: { x: 0, y: 0, width: 2, height: 2 },
      format: "grid",
    });
    expect(groupRead.ok).toBe(false);
    if (!groupRead.ok) {
      expect(groupRead.error.code).toBe("unsupported");
      expect(groupRead.error.message).toContain("image or tilemap");
    }

    // Tool definitions explicitly state return shapes and tilemap support.
    const byName = new Map(AGENT_TOOL_DEFINITIONS.map((tool) => [tool.name, tool.description]));
    expect(byName.get(AgentToolName.ReadPixels)).toContain("tilemap");
    expect(byName.get(AgentToolName.CreateDocument)).toContain("data.id");
    expect(byName.get(AgentToolName.ManageDocument)).toContain("data.id");
  });
});
