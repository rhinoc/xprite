import { describe, expect, it, vi } from "vitest";

import { AgentToolsManager } from "$/managers/agent/agent-tools-manager";
import { AgentToolName, type AgentToolsPort } from "$/managers/ports/agent-tools";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";

describe("agent PNG output validation", () => {
  it.each([
    ["png", 16385, 1],
    ["spritesheet", 8193, 2],
  ])("rejects %s before rendering or encoding", async (format, width, frames) => {
    const sourcePixels = vi.fn(() => {
      throw new Error("pixels must not be read");
    });
    const document = {
      name: "private.aseprite",
      width,
      height: 1,
      timeline: { frames: Array.from({ length: frames }, () => ({})), layers: [], tags: [] },
    };
    Object.defineProperty(document, "layer", { get: sourcePixels });
    const core = {
      getSnapshot: () => ({ document }),
      getContentRevision: () => 1,
      hasPendingDocumentEdit: () => false,
      imageEditing: { getEffectPreview: () => null },
      importExport: { getSpriteSheetPreview: () => null },
    };
    const slot = { id: "view", documentId: "document", core, session: { getSnapshot: () => ({}) } };
    const workspace = {
      getSnapshot: () => ({ tabs: [{ id: "view" }], activeId: "view" }),
      getSlot: () => slot,
    };
    const encodePng = vi.fn();
    const manager = new AgentToolsManager(
      workspace as unknown as DocumentWorkspace,
      { encodePng } as unknown as AgentToolsPort,
      () => {},
    );
    const response = await manager.execute(AgentToolName.ExportDocument, {
      documentId: "document",
      format,
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.message).toMatch(/Reduce Resize/);
      expect(response.error.code).toBe("invalid_input");
    }
    expect(sourcePixels).not.toHaveBeenCalled();
    expect(encodePng).not.toHaveBeenCalled();
  });
});
