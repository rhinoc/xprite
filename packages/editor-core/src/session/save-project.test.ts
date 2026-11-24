import assert from "node:assert/strict";

import { describe, it, vi } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import { asepriteFromProject } from "$/import-export/aseprite/project";
import { projectPngImage } from "$/import-export/image/project-preview";
import { EditorSession } from "$/session/editor-session";
import {
  SessionOutcome,
  SessionSaveIntent,
  type EditorSessionPorts,
  type SessionProject,
  type SessionWriteResult,
} from "$/session/types";
import { TilesetMode, TilemapDisplayMode } from "$/tilemap/types";
import * as timelineRenderer from "$/timeline/timeline";

describe("immutable project save snapshots", () => {
  it("writes an Aseprite project under preview allocation pressure without misreporting the save", async () => {
    const blank = { width: 1, height: 1, data: Uint8ClampedArray.of(1, 2, 3, 255) };
    const core = new RasterEditor(blank, "Artwork.aseprite");
    core.color.setPalette([[1, 2, 3, 255]]);
    const errors: string[] = [];
    const render = vi.spyOn(timelineRenderer, "renderTimelineFrame");
    const session = new EditorSession(
      core,
      {
        decode: async () => blank,
        analyze: async () => {
          throw new Error("Unexpected analysis");
        },
        pixelate: async (image) => image,
        write: async () => {
          throw new Error("Expected project writer");
        },
        writeProject: async (project) => {
          assert.equal(render.mock.calls.length, 0);
          assert.equal(asepriteFromProject(project).width, 1);
          return { method: "download", name: "Artwork.aseprite", format: "aseprite" };
        },
      },
      undefined,
      undefined,
      "memory-save",
      (_reason, operation) => errors.push(operation),
    );
    try {
      render.mockImplementation(() => {
        throw new RangeError("Array buffer allocation failed");
      });
      assert.equal(await session.save(SessionSaveIntent.Save), SessionOutcome.Created);
      assert.equal(core.getSnapshot().dirty, false);
      assert.equal(session.getSnapshot().saving, false);
      assert.deepEqual(errors, ["recent"]);
      assert.equal(session.getSnapshot().error?.operation, "recent");
    } finally {
      render.mockRestore();
      session.dispose();
    }
  });

  for (const continueEditing of [false, true])
    it(`completes a fallback download while preserving newer edits: ${continueEditing}`, async () => {
      const blank = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) };
      const core = new RasterEditor(blank, "Original.png");
      core.color.setPalette([[1, 2, 3, 255]]);
      let offered: Uint8ClampedArray | undefined;
      let finish!: (result: SessionWriteResult) => void;
      const ports: EditorSessionPorts<string> = {
        decode: async () => blank,
        analyze: async () => {
          throw new Error("unexpected analysis");
        },
        pixelate: async (pixels) => pixels,
        write: (pixels) => {
          offered = pixels.data.slice();
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      };
      const session = new EditorSession(core, ports);
      const saving = session.save(SessionSaveIntent.SaveAs, "Chosen.png");
      assert.ok(offered);
      if (continueEditing) {
        core.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 0, 255] });
        core.pointerDown({ x: 0, y: 0 });
        core.pointerUp();
        assert.deepEqual([...offered], [10, 20, 30, 255]);
      }
      finish({ method: "download", name: "Chosen.png", format: "png", downloadFallback: true });
      assert.equal(await saving, SessionOutcome.Created);
      assert.equal(session.getLastSaveMethod(), "download");
      assert.equal(core.getSnapshot().dirty, continueEditing);
      assert.equal(
        core.getSnapshot().document?.name,
        continueEditing ? "Original.png" : "Chosen.png",
      );
      assert.equal(session.getSnapshot().error, null);
      assert.equal(session.getSnapshot().saving, false);
      assert.equal(
        session.getSnapshot().notice,
        "The selected location could not be saved. A copy download was started.",
      );
      session.dispose();
    });

  it("retains the uncommitted manual pixel-perfect tilemap projection for PNG", async () => {
    const blank = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
    const core = new RasterEditor(blank);
    core.tilemap.addTilemapLayer({ tileWidth: 2, tileHeight: 2, tilesetName: "Terrain" });
    core.tilemap.setTilemapMode(TilemapDisplayMode.Pixels);
    core.drawing.settings.setSettings({
      tool: "pencil",
      foreground: [230, 10, 0, 255],
      pixelPerfect: false,
    });
    core.pointerDown({ x: 0, y: 0 });
    core.pointerUp();
    core.tilemap.setTilesetMode(TilesetMode.Manual);
    core.drawing.settings.setSettings({ foreground: [5, 20, 240, 255], pixelPerfect: true });
    core.pointerDown({ x: 0, y: 0 });
    assert.equal(core.hasPendingDocumentEdit(), true);
    const expected = core.canvas.exportComposite().data.slice();
    assert.deepEqual([...expected.subarray(0, 4)], [5, 20, 240, 255]);

    let offered: SessionProject | undefined;
    let finish!: (result: SessionWriteResult) => void;
    const gate = new Promise<SessionWriteResult>((resolve) => {
      finish = resolve;
    });
    const ports: EditorSessionPorts<string> = {
      decode: async () => blank,
      analyze: async () => {
        throw new Error("Unexpected image analysis while saving");
      },
      pixelate: async (pixels) => pixels,
      write: async () => ({ method: "download", name: "Preview.png", format: "png" }),
      writeProject: (project) => {
        offered = project;
        return gate;
      },
    };
    const session = new EditorSession(core, ports);
    const saving = session.save(SessionSaveIntent.SaveAs, "Preview.png");
    assert.ok(offered);
    assert.deepEqual(projectPngImage(offered).data, expected);
    core.pointerMove({ x: 1, y: 0 });
    core.pointerMove({ x: 1, y: 1 });
    assert.deepEqual(
      projectPngImage(offered).data,
      expected,
      "continued staged edits cannot change the offered PNG",
    );
    finish({ method: "download", name: "Preview.png", format: "png" });
    assert.equal(await saving, SessionOutcome.Created);
    core.pointerUp();
    session.dispose();
  });
});
