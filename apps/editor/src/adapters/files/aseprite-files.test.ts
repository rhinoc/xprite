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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ASE project file save preserves group metadata", () => {
  for (const intent of [SessionSaveIntent.Save, SessionSaveIntent.SaveAs])
    for (const stage of ["create", "write", "close"] as const)
      it(`${intent} downloads the encoded copy after ${stage} fails`, async () => {
        const click = vi.fn();
        const anchor = { click, remove: vi.fn(), href: "", download: "", rel: "" };
        vi.stubGlobal("document", { createElement: () => anchor });
        const urls = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:copy");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        const reason = new DOMException(
          "file write failed",
          stage === "close" ? "AbortError" : "NotAllowedError",
        );
        const abort = vi.fn(async () => {});
        const write = vi.fn(async (_blob: Blob) => {
          if (stage === "write") throw reason;
        });
        const close = vi.fn(async () => {
          if (stage === "close") throw reason;
        });
        const handle = {
          name: "Chosen.aseprite",
          requestPermission: async () => "granted" as const,
          createWritable: async () => {
            if (stage === "create") throw reason;
            return { write, close, abort };
          },
        };
        const bound = vi.fn();
        const saved = vi.fn();
        const result = await saveAseprite(groupedProject(), "Original.aseprite", intent, {
          ...(intent === SessionSaveIntent.Save ? { fileHandle: handle } : {}),
          saveFilePicker: async () => handle,
          onFileHandleSaved: bound,
          onFileDataSaved: saved,
        });
        assert.deepEqual(result, {
          method: "download",
          name: handle.name,
          format: "aseprite",
          downloadFallback: true,
        });
        assert.equal(click.mock.calls.length, 1);
        assert.equal(anchor.download, handle.name);
        assert.equal(bound.mock.calls.length, 0);
        assert.equal(abort.mock.calls.length, stage === "create" ? 0 : 1);
        assert.equal(saved.mock.calls[0][0], urls.mock.calls[0][0]);
        if (stage !== "create") assert.equal(write.mock.calls[0][0], urls.mock.calls[0][0]);
        const copy = urls.mock.calls[0][0] as Blob;
        assert.ok((await decodeAsepriteBlob(copy, handle.name)).timeline);
      });

  it("reports both failures if the fallback download cannot be dispatched", async () => {
    const reason = new DOMException("file rejected", "NotAllowedError");
    const downloadError = new DOMException("download rejected", "AbortError");
    vi.stubGlobal("document", {
      createElement: () => ({
        click: () => {
          throw downloadError;
        },
        remove() {},
      }),
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:copy");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    await assert.rejects(
      saveAseprite(groupedProject(), "copy.aseprite", SessionSaveIntent.SaveAs, {
        saveFilePicker: async () => ({
          createWritable: async () => {
            throw reason;
          },
        }),
      }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [reason, downloadError]);
        assert.notEqual(error.name, "AbortError");
        return true;
      },
    );
  });

  it("downloads PNG bytes when the selected project destination is PNG", async () => {
    const blob = new Blob(["encoded PNG"], { type: "image/png" });
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return {
            createImageData: (width: number, height: number) => ({
              data: new Uint8ClampedArray(width * height * 4),
            }),
            putImageData() {},
          };
        }
        async convertToBlob() {
          return blob;
        }
      },
    );
    const anchor = { click: vi.fn(), remove() {}, href: "", download: "", rel: "" };
    vi.stubGlobal("document", { createElement: () => anchor });
    const urls = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:png-copy");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const result = await saveAseprite(
      groupedProject(),
      "Original.aseprite",
      SessionSaveIntent.SaveAs,
      {
        saveFilePicker: async () => ({
          name: "Chosen.png",
          createWritable: async () => {
            throw new DOMException("refused", "NotAllowedError");
          },
        }),
      },
    );
    assert.deepEqual(result, {
      method: "download",
      name: "Chosen.png",
      format: "png",
      downloadFallback: true,
    });
    assert.equal(urls.mock.calls[0][0], blob);
    assert.equal(anchor.download, "Chosen.png");
    assert.equal(anchor.click.mock.calls.length, 1);
  });

  it("keeps picker cancellation as cancellation without a download", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL");
    const reason = new DOMException("cancelled", "AbortError");
    await assert.rejects(
      saveAseprite(groupedProject(), "copy.aseprite", SessionSaveIntent.SaveAs, {
        saveFilePicker: async () => {
          throw reason;
        },
      }),
      (error) => error === reason,
    );
    assert.equal(createUrl.mock.calls.length, 0);
  });
  it("annotates unreadable Blob IO without retrying or starting the decoder", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const reason = new DOMException("Backing file is unreadable", "NotReadableError");
    const read = vi.spyOn(blob, "arrayBuffer").mockRejectedValue(reason);
    const source = vi.fn();
    await assert.rejects(
      decodeAsepriteBlob(blob, "unreadable.aseprite", { onSourceBytes: source }),
      (error) => {
        assert.equal(error, reason);
        assert.equal(error.name, "NotReadableError");
        assert.deepEqual(error.diagnosticDetails, { aseprite: { stage: "read", byteLength: 3 } });
        return true;
      },
    );
    assert.equal(read.mock.calls.length, 1);
    assert.equal(source.mock.calls.length, 0);
  });
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

  it("cancels quietly when the overwrite permission dialog is dismissed", async () => {
    const write = vi.fn();
    const picker = vi.fn();
    await assert.rejects(
      saveAseprite(groupedProject(), "Groups.aseprite", SessionSaveIntent.Save, {
        fileHandle: {
          name: "Groups.aseprite",
          createWritable: write,
          // Chrome resolves `prompt` when the user closes the dialog without choosing.
          requestPermission: async () => "prompt",
        },
        fileHandlePermissionActivation: true,
        saveFilePicker: picker,
      }),
      (reason: unknown) => {
        const error = reason as Error & {
          diagnosticDetails?: { fileWrite?: Record<string, unknown> };
        };
        // The session treats AbortError like a cancelled picker: no error dialog, no exception.
        assert.equal(error.name, "AbortError");
        assert.equal(error.diagnosticDetails?.fileWrite?.permission, "prompt");
        return true;
      },
    );
    assert.equal(write.mock.calls.length, 0);
    assert.equal(picker.mock.calls.length, 0);
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
