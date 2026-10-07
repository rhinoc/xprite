import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import type { OpfsRequest, OpfsResponse } from "$/opfs-worker";

afterEach(() => vi.unstubAllGlobals());

describe("OPFS failed-write cleanup", () => {
  it("removes a newly created partial payload but never removes an existing key on collision", async () => {
    const keys = new Set<string>(["existing"]);
    const removed: string[] = [];
    let fail = true;
    let closed = 0;
    const directory = {
      async getFileHandle(key: string, options?: { create: boolean }) {
        if (!keys.has(key) && !options?.create) throw new DOMException("Missing", "NotFoundError");
        keys.add(key);
        return {
          async createSyncAccessHandle() {
            return {
              write(bytes: Uint8Array) {
                if (fail) throw new DOMException("Full", "QuotaExceededError");
                return bytes.length;
              },
              truncate() {},
              flush() {},
              close() {
                closed++;
              },
            };
          },
        };
      },
      async removeEntry(key: string) {
        removed.push(key);
        keys.delete(key);
      },
    };
    vi.stubGlobal("navigator", {
      storage: {
        async getDirectory() {
          return {
            async getDirectoryHandle() {
              return directory;
            },
          };
        },
      },
      locks: { request: async (_name: string, operation: () => Promise<void>) => operation() },
    });
    vi.stubGlobal("onmessage", undefined);
    vi.stubGlobal("postMessage", undefined);
    await import("$/opfs-worker");
    const scope = globalThis as unknown as {
      onmessage(event: { data: OpfsRequest }): void;
      postMessage(message: OpfsResponse): void;
    };
    const write = (key: string) =>
      new Promise<OpfsResponse>((resolve) => {
        scope.postMessage = resolve;
        scope.onmessage({
          data: {
            id: 1,
            operation: "write",
            key,
            namespace: "test",
            bytes: new Uint8Array([1, 2]).buffer,
          },
        });
      });
    const failed = await write("new");
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.equal(failed.name, "QuotaExceededError");
    assert.equal(keys.has("new"), false);
    assert.equal(closed, 1);
    assert.deepEqual(removed, ["new"]);
    const collision = await write("existing");
    assert.equal(collision.ok, false);
    assert.equal(keys.has("existing"), true);
    assert.deepEqual(removed, ["new"]);
    fail = false;
    assert.equal((await write("new")).ok, true);
    assert.equal(keys.has("new"), true);
  });
});
