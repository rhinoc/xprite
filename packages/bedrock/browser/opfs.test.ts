import { afterEach, describe, expect, it, vi } from "vitest";

import { isOpfsUnavailableError, OpfsByteStore, probeOpfs, supportsOpfs } from "$/opfs";
import { BrowserStorageError, BrowserStorageErrorCode } from "$/storage-error";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OPFS availability", () => {
  it("treats Safari private-mode UnknownError as unavailable", () => {
    expect(
      isOpfsUnavailableError(
        "UnknownError",
        "The operation failed for an unknown transient reason (e.g. out of memory).",
      ),
    ).toBe(true);
    expect(isOpfsUnavailableError("QuotaExceededError", "Full")).toBe(false);
    expect(isOpfsUnavailableError("NotFoundError", "Missing")).toBe(false);
  });

  it("maps worker UnknownError responses to BrowserStorageError unavailable", async () => {
    const listeners: {
      onmessage?: (event: MessageEvent) => void;
    } = {};
    const worker = {
      postMessage(request: { id: number }) {
        queueMicrotask(() => {
          listeners.onmessage?.({
            data: {
              id: request.id,
              ok: false,
              name: "UnknownError",
              message: "The operation failed for an unknown transient reason (e.g. out of memory).",
            },
          } as MessageEvent);
        });
      },
      terminate() {},
      set onmessage(handler: ((event: MessageEvent) => void) | null) {
        listeners.onmessage = handler ?? undefined;
      },
      get onmessage() {
        return listeners.onmessage ?? null;
      },
      onerror: null,
      onmessageerror: null,
    };
    const store = new OpfsByteStore("test", () => worker as unknown as Worker);
    await expect(store.write("key", new Uint8Array([1]))).rejects.toMatchObject({
      name: "BrowserStorageError",
      code: BrowserStorageErrorCode.Unavailable,
    });
    await expect(store.write("key", new Uint8Array([2]))).rejects.toBeInstanceOf(
      BrowserStorageError,
    );
  });

  it("probeOpfs returns false when getDirectory rejects", async () => {
    class FakeFileHandle {}
    (FakeFileHandle.prototype as { createWritable?: () => void }).createWritable = () => undefined;
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("FileSystemFileHandle", FakeFileHandle);
    vi.stubGlobal("navigator", {
      storage: {
        getDirectory: async () => {
          throw new DOMException(
            "The operation failed for an unknown transient reason (e.g. out of memory).",
            "UnknownError",
          );
        },
      },
      locks: {},
    });
    expect(supportsOpfs()).toBe(true);
    expect(await probeOpfs()).toBe(false);
  });
});
