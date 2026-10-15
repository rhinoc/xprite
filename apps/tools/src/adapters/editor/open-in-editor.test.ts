import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  editorImportUrl,
  openInEditor,
  EDITOR_IMPORT_HASH,
} from "$/adapters/editor/open-in-editor";

interface TransferRecord {
  token: string;
  bytes: ArrayBuffer;
  type: string;
  name: string;
  palette?: unknown;
  expires: number;
}
function readRecords(): Promise<TransferRecord[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("xprite.viewer-transfer");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const all = open.result.transaction("files").objectStore("files").getAll();
      all.onsuccess = () => {
        open.result.close();
        resolve(all.result);
      };
      all.onerror = () => reject(all.error);
    };
  });
}
afterEach(() => vi.unstubAllGlobals());

describe("editor hand-off", () => {
  it("builds the explicit import URL the editor consumes", () => {
    expect(editorImportUrl("abc")).toBe("/editor#viewer-import=abc");
    expect(editorImportUrl("abc", "?lang=ja")).toBe("/editor?lang=ja#viewer-import=abc");
    expect(EDITOR_IMPORT_HASH).toBe("#viewer-import=");
  });
  it("stages the file in the short-lived transfer record and opens the editor", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const palette = [[1, 2, 3, 255]] as const;
    const file = new File([new Uint8Array([1, 2, 3])], "result.png", { type: "image/png" });
    const before = Date.now();
    await openInEditor(file, { palette });
    expect(assign).toHaveBeenCalledTimes(1);
    const url = String(assign.mock.calls[0][0]);
    expect(url.startsWith("/editor#viewer-import=")).toBe(true);
    const token = url.slice(url.indexOf("=") + 1);
    const record = (await readRecords()).find((entry) => entry.token === token)!;
    expect(record.name).toBe("result.png");
    expect(record.palette).toEqual(palette);
    expect(record.expires).toBeGreaterThan(before);
    expect(record.expires - before).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    expect(record.bytes.byteLength).toBe(3);
    expect(record.type).toBe("image/png");
  });
  it("does not navigate when the transfer cannot be staged", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("blocked");
      },
    });
    await expect(openInEditor(new File([], "x.png"))).rejects.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });
});
