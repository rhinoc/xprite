import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decodeImageBlob = vi.fn();
vi.mock("@xprite/bedrock/browser/images", () => ({ decodeImageBlob }));
vi.mock("@xprite/editor-core/import-export", () => ({
  projectFromClipboardImage: (input: unknown) => ({ project: input }),
  copyStoredPalette: () => null,
}));

import {
  VIEWER_TRANSFER_FAILED_MESSAGE,
  takeViewerProject,
} from "$/adapters/viewer/editor-transfer";

function put(record: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("xprite.viewer-transfer");
    open.onupgradeneeded = () => open.result.createObjectStore("files", { keyPath: "token" });
    open.onsuccess = () => {
      const tx = open.result.transaction("files", "readwrite");
      tx.objectStore("files").put(record);
      tx.oncomplete = () => {
        open.result.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}
function count(): Promise<number> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("xprite.viewer-transfer");
    open.onsuccess = () => {
      const all = open.result.transaction("files").objectStore("files").count();
      all.onsuccess = () => {
        open.result.close();
        resolve(all.result);
      };
      all.onerror = () => reject(all.error);
    };
  });
}
const replaceState = vi.fn();
const location = { hash: "", pathname: "/editor", search: "" };
beforeEach(() => {
  decodeImageBlob.mockReset();
  replaceState.mockReset();
  location.hash = "#viewer-import=t1";
  vi.stubGlobal("window", { location, history: { state: null, replaceState } });
});
afterEach(() => vi.unstubAllGlobals());

describe("editor viewer transfer", () => {
  it("decodes byte payloads from memory, then deletes the record and clears the hash", async () => {
    decodeImageBlob.mockResolvedValue({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
    await put({
      token: "t1",
      bytes: new Uint8Array([1, 2, 3]).buffer,
      type: "image/png",
      name: "a.png",
      expires: Date.now() + 60_000,
    });
    const result = await takeViewerProject()!;
    expect(result?.name).toBe("a.png");
    const blob = decodeImageBlob.mock.calls[0][0] as Blob;
    expect(blob.size).toBe(3);
    expect(blob.type).toBe("image/png");
    expect(await count()).toBe(0);
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("still reads records written by older tool pages as a File", async () => {
    decodeImageBlob.mockResolvedValue({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
    await put({
      token: "t1",
      file: new File([new Uint8Array([9, 9])], "b.png", { type: "image/png" }),
      name: "b.png",
      expires: Date.now() + 60_000,
    });
    await takeViewerProject();
    expect((decodeImageBlob.mock.calls[0][0] as Blob).size).toBe(2);
  });

  it("keeps the record and the hash when decoding fails so a reload can retry", async () => {
    decodeImageBlob.mockRejectedValue(new Error("Unable to decode image blob"));
    await put({
      token: "t1",
      bytes: new Uint8Array([1]).buffer,
      type: "image/png",
      name: "a.png",
      expires: Date.now() + 60_000,
    });
    await expect(takeViewerProject()!).rejects.toThrow(VIEWER_TRANSFER_FAILED_MESSAGE);
    expect(await count()).toBe(1);
    expect(replaceState).not.toHaveBeenCalled();
    decodeImageBlob.mockResolvedValue({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
    expect((await takeViewerProject()!)?.name).toBe("a.png");
    expect(await count()).toBe(0);
  });

  it("rejects an empty payload with the friendly message", async () => {
    await put({
      token: "t1",
      bytes: new ArrayBuffer(0),
      type: "image/png",
      name: "a.png",
      expires: Date.now() + 60_000,
    });
    await expect(takeViewerProject()!).rejects.toThrow(VIEWER_TRANSFER_FAILED_MESSAGE);
    expect(decodeImageBlob).not.toHaveBeenCalled();
  });
});
