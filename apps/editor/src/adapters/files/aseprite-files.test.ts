import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import { decodeAsepriteBlob, saveAseprite } from "$/adapters/files/aseprite-files";
import type { SaveFileHandle } from "$/adapters/files/aseprite-files";
import { asepriteFromProject, projectFromAseprite } from "@xprite/editor-core/import-export";
import { SessionSaveIntent, type SessionProject } from "@xprite/editor-core/session";

function groupedProject(): SessionProject {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
  const project: SessionProject = {
    image,
    timeline: {
      composeGroups: true,
      activeLayer: 1,
      activeFrame: 0,
      layers: [
        {
          id: "group",
          name: "Group",
          kind: "group",
          visible: true,
          locked: false,
          opacity: 123,
          blendMode: 1,
          flags: 3,
        },
        {
          id: "child",
          name: "Child",
          parentId: "group",
          visible: true,
          locked: false,
          opacity: 255,
          flags: 3,
        },
      ],
      frames: [
        { duration: 100, cels: [null, { pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 }] },
      ],
    },
  };
  const sprite = asepriteFromProject(project);
  return projectFromAseprite(sprite);
}

afterEach(() => vi.unstubAllGlobals());

describe("ASE project file save preserves group metadata", () => {
  for (const intent of [SessionSaveIntent.Save, SessionSaveIntent.SaveAs])
    for (const compressed of [false, true])
      it(`${intent} retains group fields with compression ${compressed} while rendering is disabled`, async () => {
        if (!compressed) vi.stubGlobal("CompressionStream", undefined);
        const project = groupedProject();
        assert.equal(project.timeline.composeGroups, false);
        const before = structuredClone(project);
        const written: Blob[] = [];
        const handle: SaveFileHandle = {
          name: "Groups.aseprite",
          async createWritable() {
            return {
              async write(blob) {
                written.push(blob);
              },
              async close() {},
            };
          },
        };
        const result = await saveAseprite(project, "Groups.aseprite", intent, {
          ...(intent === SessionSaveIntent.Save ? { fileHandle: handle } : {}),
          saveFilePicker: async () => handle,
        });
        assert.equal(
          "method" in result && result.method,
          intent === SessionSaveIntent.Save ? "file" : "picker",
        );
        assert.equal(written.length, 1);
        const reopened = await decodeAsepriteBlob(written[0], "Groups.aseprite");
        assert.equal(reopened.timeline.layers[0].opacity, 123);
        assert.equal(reopened.timeline.layers[0].blendMode, 1);
        assert.equal(reopened.timeline.asepriteSource!.flags & 2, 2);
        assert.deepEqual(
          project,
          before,
          "saving cannot change render preferences or source metadata",
        );
      });

  it("preserves group fields when saving falls back to a browser download", async () => {
    const project = groupedProject();
    const before = structuredClone(project);
    const written: Blob[] = [];
    let clicks = 0;
    vi.stubGlobal("document", {
      createElement: () => ({ click: () => clicks++, remove() {} }),
    });
    const result = await saveAseprite(project, "Groups.aseprite", SessionSaveIntent.SaveAs, {
      saveFilePicker: async () => {
        throw new Error("Native file access is unavailable");
      },
      onFileDataSaved: (blob) => written.push(blob),
    });
    assert.equal("method" in result && result.method, "download");
    assert.equal(clicks, 1);
    assert.equal(written.length, 1);
    const reopened = await decodeAsepriteBlob(written[0], "Groups.aseprite");
    assert.equal(reopened.timeline.layers[0].opacity, 123);
    assert.equal(reopened.timeline.layers[0].blendMode, 1);
    assert.deepEqual(project, before);
  });
});
