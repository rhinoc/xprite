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

class TestWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminate = vi.fn();
  postMessage =
    vi.fn<(request: { id: number; operation: string; key: string; bytes?: ArrayBuffer }) => void>();
  respond(id: number, bytes = new Uint8Array([7]).buffer) {
    this.onmessage?.({ data: { id, ok: true, bytes } } as MessageEvent);
  }
}

function transportError(worker: TestWorker) {
  const error = new Error("Script could not be loaded");
  const event = Object.assign(new Event("error"), {
    message: error.message,
    filename: "https://xprite.cc/assets/opfs-worker.js?secret=discarded",
    lineno: 12,
    colno: 3,
    error,
  });
  worker.onerror?.(event as ErrorEvent);
  return error;
}

describe("OPFS worker recovery", () => {
  it("retries a read once on a fresh worker and ignores late responses from the failed worker", async () => {
    const first = new TestWorker(),
      second = new TestWorker();
    let late: ((event: MessageEvent) => void) | null = null;
    first.postMessage.mockImplementation(() =>
      queueMicrotask(() => {
        late = first.onmessage;
        transportError(first);
      }),
    );
    second.postMessage.mockImplementation(({ id }) =>
      queueMicrotask(() => {
        late?.({ data: { id, ok: true, bytes: new Uint8Array([99]).buffer } } as MessageEvent);
        second.respond(id);
      }),
    );
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const store = new OpfsByteStore("test", factory);
    expect([...(await store.read("key"))]).toEqual([7]);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(first.terminate).toHaveBeenCalledOnce();
    store.close();
  });

  it("bounds failed reads and preserves the worker event context", async () => {
    const workers: TestWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new TestWorker();
      workers.push(worker);
      worker.postMessage.mockImplementation(() => queueMicrotask(() => transportError(worker)));
      return worker as unknown as Worker;
    });
    const store = new OpfsByteStore("test", factory);
    await expect(store.read("key")).rejects.toMatchObject({
      code: BrowserStorageErrorCode.Io,
      cause: { message: "Script could not be loaded" },
      diagnosticDetails: {
        opfs: {
          stage: "error",
          operation: "read",
          workerAnswered: false,
          filename: "https://xprite.cc/assets/opfs-worker.js",
          line: 12,
          column: 3,
        },
      },
    });
    expect(factory).toHaveBeenCalledTimes(2);
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
    store.close();
  });

  it("does not replay an uncertain write, and a later read can inspect its bytes", async () => {
    const first = new TestWorker(),
      second = new TestWorker();
    let saved: ArrayBuffer | undefined;
    first.postMessage.mockImplementation(({ bytes }) =>
      queueMicrotask(() => {
        saved = bytes;
        first.onmessageerror?.(new Event("messageerror") as MessageEvent);
      }),
    );
    second.postMessage.mockImplementation(({ id }) =>
      queueMicrotask(() => second.respond(id, saved)),
    );
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const store = new OpfsByteStore("test", factory);
    const input = new Uint8Array([1, 2, 3]);
    await expect(store.write("key", input)).rejects.toMatchObject({
      diagnosticDetails: { opfs: { stage: "messageerror", operation: "write" } },
    });
    expect(factory).toHaveBeenCalledOnce();
    expect(first.postMessage).toHaveBeenCalledOnce();
    expect([...(await store.read("key"))]).toEqual([1, 2, 3]);
    expect(second.postMessage.mock.calls.map(([r]) => r.operation)).toEqual(["read"]);
    expect([...input]).toEqual([1, 2, 3]);
    store.close();
  });

  it("does not retry deletes or recreate a worker after close", async () => {
    const worker = new TestWorker();
    const factory = vi.fn(() => worker as unknown as Worker);
    worker.postMessage.mockImplementation(() => queueMicrotask(() => transportError(worker)));
    const store = new OpfsByteStore("test", factory);
    await expect(store.remove("key")).rejects.toMatchObject({ code: BrowserStorageErrorCode.Io });
    expect(factory).toHaveBeenCalledOnce();
    const reading = store.read("key");
    store.close();
    await expect(reading).rejects.toMatchObject({ code: BrowserStorageErrorCode.Closed });
    expect(factory).toHaveBeenCalledTimes(2);
    await expect(store.read("key")).rejects.toMatchObject({ code: BrowserStorageErrorCode.Closed });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
