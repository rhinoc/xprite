import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import {
  isAbortError,
  pickOpenFiles,
  pickSaveFile,
  selectBrowserFiles,
  writeFileHandle,
} from "$/file-system";

describe("file stream cleanup", () => {
  for (const stage of ["write", "close"] as const)
    it(`aborts after ${stage} fails and preserves the original failure`, async () => {
      const reason = new DOMException("write failed", "AbortError");
      const write = vi.fn(async () => {
        if (stage === "write") throw reason;
      });
      const close = vi.fn(async () => {
        if (stage === "close") throw reason;
      });
      const abort = vi.fn(async () => {
        throw new Error("cleanup failed");
      });
      await assert.rejects(
        writeFileHandle({ createWritable: async () => ({ write, close, abort }) }, new Blob()),
        (error) => error === reason,
      );
      assert.equal(abort.mock.calls.length, 1);
      assert.equal(close.mock.calls.length, stage === "close" ? 1 : 0);
    });

  it("commits a successful write without aborting", async () => {
    const order: string[] = [];
    const blob = new Blob(["snapshot"]);
    await writeFileHandle(
      {
        createWritable: async () => ({
          write: async (data) => {
            assert.equal(data, blob);
            order.push("write");
          },
          close: async () => {
            order.push("close");
          },
          abort: async () => {
            order.push("abort");
          },
        }),
      },
      blob,
    );
    assert.deepEqual(order, ["write", "close"]);
  });
});

const saveOptions = {
  suggestedName: "sprite.png",
  types: [{ description: "PNG image", accept: { "image/png": [".png"] } }],
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function alreadyActive(api: "showOpenFilePicker" | "showSaveFilePicker") {
  return new DOMException(
    `Failed to execute '${api}' on 'Window': File picker already active.`,
    "NotAllowedError",
  );
}

function contextDenied(api: "showOpenFilePicker" | "showSaveFilePicker") {
  return new DOMException(
    `Failed to execute '${api}' on 'Window': The request is not allowed by the user agent or the platform in the current context.`,
    "NotAllowedError",
  );
}

describe("native file picker in-flight guard", () => {
  const originalOpen = (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  const originalSave = (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;

  afterEach(async () => {
    (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker = originalOpen;
    (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = originalSave;
    // Allow a just-settled picker to clear the shared guard before the next test.
    await Promise.resolve();
  });

  it("invokes the open picker synchronously and cancels a second open without another native call", async () => {
    const first = deferred<[]>();
    const open = vi.fn(() => first.promise);
    (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker = open;
    const pending = pickOpenFiles({ multiple: true });
    assert.ok(pending);
    assert.equal(open.mock.calls.length, 1);
    const duplicate = pickOpenFiles({ multiple: true });
    assert.ok(duplicate);
    await assert.rejects(duplicate, (error) => isAbortError(error));
    assert.equal(open.mock.calls.length, 1);
    first.resolve([]);
    assert.deepEqual(await pending, []);
    const after = deferred<[]>();
    open.mockImplementation(() => after.promise);
    const third = pickOpenFiles();
    assert.equal(open.mock.calls.length, 2);
    after.resolve([]);
    assert.deepEqual(await third, []);
  });

  it("shares the guard between open and save pickers", async () => {
    const openFirst = deferred<[]>();
    const open = vi.fn(() => openFirst.promise);
    const save = vi.fn();
    (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker = open;
    (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = save;
    const pendingOpen = pickOpenFiles();
    assert.ok(pendingOpen);
    await assert.rejects(pickSaveFile(saveOptions)!, (error) => isAbortError(error));
    assert.equal(save.mock.calls.length, 0);
    openFirst.resolve([]);
    await pendingOpen;

    const saveFirst = deferred<{ name: string }>();
    save.mockImplementation(() => saveFirst.promise);
    const pendingSave = pickSaveFile(saveOptions);
    assert.ok(pendingSave);
    await assert.rejects(pickOpenFiles()!, (error) => isAbortError(error));
    assert.equal(open.mock.calls.length, 1);
    saveFirst.resolve({ name: "sprite.png" });
    assert.equal((await pendingSave).name, "sprite.png");
  });

  it("releases the guard after reject, cancel, and a synchronous throw", async () => {
    const open = vi.fn();
    (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker = open;

    const rejected = deferred<[]>();
    const writeDenied = contextDenied("showOpenFilePicker");
    open.mockImplementation(() => rejected.promise);
    const first = pickOpenFiles();
    rejected.reject(writeDenied);
    await assert.rejects(first!, (error) => error === writeDenied);

    const cancelled = deferred<[]>();
    const abort = new DOMException("The user aborted a request.", "AbortError");
    open.mockImplementation(() => cancelled.promise);
    const second = pickOpenFiles();
    cancelled.reject(abort);
    await assert.rejects(second!, (error) => error === abort);

    const sync = new Error("picker failed to open");
    open.mockImplementation(() => {
      throw sync;
    });
    await assert.rejects(pickOpenFiles()!, (error) => error === sync);

    const recovered = deferred<[]>();
    open.mockImplementation(() => recovered.promise);
    const fourth = pickOpenFiles();
    assert.equal(open.mock.calls.length, 4);
    recovered.resolve([]);
    assert.deepEqual(await fourth, []);
  });

  it("treats only already-active NotAllowedError as cancellation", async () => {
    const open = vi.fn();
    (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker = open;

    open.mockImplementation(() => {
      throw alreadyActive("showOpenFilePicker");
    });
    await assert.rejects(pickOpenFiles()!, (error) => isAbortError(error));

    const asyncActive = alreadyActive("showSaveFilePicker");
    const save = vi.fn(() => Promise.reject(asyncActive));
    (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = save;
    await assert.rejects(
      pickSaveFile(saveOptions)!,
      (error) => isAbortError(error) && error !== asyncActive,
    );

    const denied = contextDenied("showOpenFilePicker");
    open.mockImplementation(() => {
      throw denied;
    });
    await assert.rejects(pickOpenFiles()!, (error) => error === denied);

    const rejected = contextDenied("showOpenFilePicker");
    open.mockImplementation(() => Promise.reject(rejected));
    await assert.rejects(pickOpenFiles()!, (error) => error === rejected);
  });

  it("does not hold the guard across file writes or swallow createWritable permission errors", async () => {
    const openFirst = deferred<[]>();
    (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker = () => openFirst.promise;
    const pending = pickOpenFiles();
    const refused = new DOMException(
      "Failed to execute 'createWritable' on 'FileSystemFileHandle': The request is not allowed by the user agent or the platform in the current context.",
      "NotAllowedError",
    );
    await assert.rejects(
      writeFileHandle(
        {
          createWritable: async () => {
            throw refused;
          },
        },
        new Blob(["px"]),
      ),
      (error) => error === refused,
    );
    openFirst.resolve([]);
    await pending;
    await assert.rejects(
      writeFileHandle(
        {
          createWritable: async () => {
            throw refused;
          },
        },
        new Blob(["px"]),
      ),
      (error) => error === refused,
    );
  });

  it("treats a duplicate native open as a cancelled selection", async () => {
    const first = deferred<[]>();
    const open = vi.fn(() => first.promise);
    (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker = open;
    const pending = selectBrowserFiles({ preferNative: true });
    const duplicate = selectBrowserFiles({ preferNative: true });
    assert.deepEqual(await duplicate, []);
    assert.equal(open.mock.calls.length, 1);
    first.resolve([]);
    assert.deepEqual(await pending, []);
  });
});
