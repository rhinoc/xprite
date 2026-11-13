import { describe, it, expect, vi } from "vitest";

import {
  saveFileAndCheckpoint,
  canCloseSavedDocument,
} from "$/managers/workspace/workflows/save-file-and-checkpoint";
import { RasterEditor } from "@xprite/editor-core";
import {
  EditorSession,
  SessionOutcome,
  SessionSaveIntent,
  type SessionWriteResult,
} from "@xprite/editor-core/session";

function fixture(write: (pixels: Uint8ClampedArray) => Promise<SessionWriteResult>) {
  const blank = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) };
  const core = new RasterEditor(blank, "Fixture.png");
  const session = new EditorSession(core, {
    decode: async () => blank,
    analyze: async () => {
      throw new Error("unexpected");
    },
    pixelate: async (pixels) => pixels,
    write: (pixels) => write(pixels.data.slice()),
  });
  const workspace = {
    checkpointSavedFile: vi.fn(
      async (_slotId: string): Promise<"saved" | "pending" | "failed"> => "failed",
    ),
    linkRecentFileToWorkspaceProject: vi.fn(),
    recordFileOutputCheckpoint: vi.fn(),
    isDocumentLocallyModified: () => true,
    needsBeforeUnloadWarning: () => true,
  };
  return { core, session, workspace };
}
const paint = (core: RasterEditor) => {
  core.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 0, 255] });
  core.pointerDown({ x: 0, y: 0 });
  core.pointerUp();
};

describe("acknowledged file output and recovery receipts", () => {
  for (const method of ["file", "download", "picker"] as const)
    for (const checkpoint of ["failed", "pending", "saved"] as const)
      it(`${method} output with ${checkpoint} recovery`, async () => {
        let written: Uint8ClampedArray | undefined;
        const { core, session, workspace } = fixture(async (pixels) => {
          written = pixels;
          return { method, name: "Saved.png", format: "png" };
        });
        paint(core);
        workspace.checkpointSavedFile.mockResolvedValue(checkpoint);
        expect(
          await saveFileAndCheckpoint(session, workspace, "document-A", SessionSaveIntent.SaveAs),
        ).toBe(SessionOutcome.Created);
        expect(Array.from(written!.subarray(0, 4))).toEqual([255, 0, 0, 255]);
        expect(session.hasUnsavedChanges()).toBe(false, "exact file version was saved");
        expect(workspace.checkpointSavedFile).toHaveBeenCalledWith("document-A");
        expect(workspace.linkRecentFileToWorkspaceProject).toHaveBeenCalledTimes(
          checkpoint === "saved" ? 1 : 0,
        );
        if (checkpoint !== "saved") {
          expect(workspace.recordFileOutputCheckpoint).toHaveBeenCalledWith(
            "document-A",
            method === "download",
            checkpoint,
          );
          expect(canCloseSavedDocument(workspace, "document-A")).toBe(false);
        }
        session.dispose();
      });

  for (const method of ["file", "download"] as const)
    it(`keeps newer edits during ${method} IO and does not mutate the offered bytes`, async () => {
      let finish!: (result: SessionWriteResult) => void;
      let offered: Uint8ClampedArray | undefined;
      const { core, session, workspace } = fixture((pixels) => {
        offered = pixels;
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      const operation = saveFileAndCheckpoint(session, workspace, "A", SessionSaveIntent.SaveAs);
      paint(core);
      expect(Array.from(offered!.subarray(0, 4))).toEqual([255, 255, 255, 255]);
      finish({ method, name: "Older.png" });
      expect(await operation).toBe(SessionOutcome.Created);
      expect(session.hasUnsavedChanges()).toBe(true);
      expect(Array.from(core.canvas.exportComposite().data.subarray(0, 4))).toEqual([
        255, 0, 0, 255,
      ]);
      expect(canCloseSavedDocument(workspace, "A")).toBe(false);
      session.dispose();
    });

  it("leaves cancellation and failed output distinct and never checkpoints them", async () => {
    for (const result of ["cancel", "quota", "close"] as const) {
      const { core, session, workspace } = fixture(async () => {
        if (result === "cancel") return { cancelled: true };
        throw new DOMException(
          result,
          result === "quota" ? "QuotaExceededError" : "NotAllowedError",
        );
      });
      paint(core);
      session.requestClose();
      const outcome = await saveFileAndCheckpoint(
        session,
        workspace,
        "A",
        SessionSaveIntent.SaveAs,
      );
      expect(outcome).toBe(result === "cancel" ? SessionOutcome.Cancelled : SessionOutcome.Error);
      expect(workspace.checkpointSavedFile).not.toHaveBeenCalled();
      expect(session.hasUnsavedChanges()).toBe(true);
      expect(session.getSnapshot().replacement).not.toBeNull();
      session.dispose();
    }
  });

  it("does not swallow unexpected checkpoint/attachment errors after output", async () => {
    const { session, workspace } = fixture(async () => ({ method: "file", name: "Saved.png" }));
    const error = new Error("attachment failed");
    workspace.checkpointSavedFile.mockRejectedValue(error);
    await expect(
      saveFileAndCheckpoint(session, workspace, "A", SessionSaveIntent.Save),
    ).rejects.toBe(error);
    expect(workspace.linkRecentFileToWorkspaceProject).not.toHaveBeenCalled();
    session.dispose();
  });

  it("blocks closing for manifest/attachment risk even with a clean file and document", () => {
    expect(
      canCloseSavedDocument(
        { isDocumentLocallyModified: () => false, needsBeforeUnloadWarning: () => true },
        "A",
      ),
    ).toBe(false);
    expect(
      canCloseSavedDocument(
        { isDocumentLocallyModified: () => true, needsBeforeUnloadWarning: () => false },
        "A",
      ),
    ).toBe(false);
    expect(
      canCloseSavedDocument(
        { isDocumentLocallyModified: () => false, needsBeforeUnloadWarning: () => false },
        "A",
      ),
    ).toBe(true);
  });
});
