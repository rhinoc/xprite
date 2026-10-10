import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import { decodeAsepriteBlob, saveAseprite } from "$/adapters/files/aseprite-files";
import type { SaveFileHandle } from "$/adapters/files/aseprite-files";
import {
  asepriteFromProject,
  encodeAsepriteSync,
  projectFromAseprite,
} from "@xprite/editor-core/import-export";
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
  it("does not write or fall back to another destination when overwrite permission is denied", async () => {
    const write = vi.fn();
    const picker = vi.fn();
    const project = groupedProject();
    const before = structuredClone(project);
    await assert.rejects(
      saveAseprite(project, "Groups.aseprite", SessionSaveIntent.Save, {
        fileHandle: {
          name: "Groups.aseprite",
          createWritable: write,
          requestPermission: async () => "denied",
        },
        fileHandlePermissionActivation: true,
        saveFilePicker: picker,
      }),
      (reason: unknown) => {
        const error = reason as Error & {
          diagnosticDetails?: { fileWrite?: Record<string, unknown> };
        };
        assert.equal(error.name, "FileWritePermissionError");
        assert.equal(error.diagnosticDetails?.fileWrite?.stage, "permission");
        assert.equal(error.diagnosticDetails?.fileWrite?.permission, "denied");
        assert.equal(error.diagnosticDetails?.fileWrite?.user_activation, true);
        return true;
      },
    );
    assert.equal(write.mock.calls.length, 0);
    assert.equal(picker.mock.calls.length, 0);
    assert.deepEqual(project, before);
  });

  it("exposes the same once-read input for identity hashing", async () => {
    const encoded = encodeAsepriteSync(
      asepriteFromProject(groupedProject(), { preserveGroupMetadata: true }),
    );
    const blob = new Blob([encoded as unknown as BlobPart]);
    const read = vi.spyOn(blob, "arrayBuffer");
    const capture = vi.fn();
    await decodeAsepriteBlob(blob, "Groups.aseprite", { onSourceBytes: capture });
    assert.equal(read.mock.calls.length, 1);
    assert.equal(capture.mock.calls.length, 1);
    assert.deepEqual(capture.mock.calls[0][0], encoded);
  });

  it("supplies already encoded bytes for identity hashing after a native save", async () => {
    const capture = vi.fn();
    let written: Blob | undefined;
    const handle: SaveFileHandle = {
      name: "Groups.aseprite",
      async createWritable() {
        return {
          async write(blob) {
            written = blob;
          },
          async close() {},
        };
      },
    };
    await saveAseprite(groupedProject(), handle.name!, SessionSaveIntent.Save, {
      fileHandle: handle,
      onFileDataSaved: capture,
    });
    const [blob, name, bytes] = capture.mock.calls[0];
    assert.equal(blob, written);
    assert.equal(name, handle.name);
    assert.deepEqual(bytes, new Uint8Array(await written!.arrayBuffer()));
  });
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
