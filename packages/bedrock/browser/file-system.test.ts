import assert from "node:assert/strict";

import { describe, it, vi } from "vitest";

import { writeFileHandle } from "$/file-system";

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
