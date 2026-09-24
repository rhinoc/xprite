import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { WorkspaceResizeScheduler } from "$/managers/workspace/workspace-resize-scheduler";

describe("workspace resize cadence", () => {
  it("coalesces moves and flushes the final position without waiting for a frame", () => {
    const callbacks = new Map<number, () => void>();
    let serial = 0,
      position = 0;
    const scheduler = new WorkspaceResizeScheduler(
      (callback) => {
        callbacks.set(++serial, callback);
        return serial;
      },
      (id) => {
        callbacks.delete(id);
      },
    );
    scheduler.schedule(() => {
      position = 10;
    });
    scheduler.schedule(() => {
      position = 20;
    });
    assert.equal(callbacks.size, 1);
    assert.equal(position, 0);
    callbacks.values().next().value!();
    assert.equal(position, 20);
    assert.equal(callbacks.size, 0);
    scheduler.schedule(() => {
      position = 30;
    });
    scheduler.flush();
    assert.equal(position, 30);
    assert.equal(callbacks.size, 0);
    scheduler.schedule(() => {
      position = 40;
    });
    scheduler.cancel();
    scheduler.flush();
    assert.equal(position, 30);
  });
});
