import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("autosave-coordinator", () => {
  it("autosave-coordinator behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/session/autosave-coordinator.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { createAutosaveCoordinator } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const tick = async () => {
      for (let i = 0; i < 12; i++) await Promise.resolve();
    };
    function clock() {
      let time = 0,
        id = 0;
      const timers = new Map();
      return {
        now: () => time,
        setTimeout(callback, delay) {
          timers.set(++id, { callback, at: time + delay });
          return id;
        },
        clearTimeout(handle) {
          timers.delete(handle);
        },
        advance(ms) {
          time += ms;
          for (const [key, timer] of Array.from(timers.entries()))
            if (timer.at <= time) {
              timers.delete(key);
              timer.callback();
            }
        },
        get pending() {
          return timers.size;
        },
      };
    }
    function deferred() {
      let resolve, reject;
      const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
      });
      return { promise, resolve, reject };
    }
    {
      const timer = clock(),
        writes = [],
        changes = [];
      let revision = 0;
      const coordinator = createAutosaveCoordinator({
        projectId: "one",
        clock: timer,
        capture: () => ({ revision, snapshot: { revision } }),
        save: (snapshot, head) => {
          const request = deferred();
          writes.push({ snapshot, head, request });
          return request.promise;
        },
        onStateChange: (state) => changes.push(state),
      });
      coordinator.notifyCommitted(revision);
      timer.advance(749);
      await tick();
      assert.equal(writes.length, 0);
      timer.advance(1);
      await tick();
      assert.equal(writes.length, 1);
      revision = 1;
      coordinator.notifyCommitted(revision);
      revision = 2;
      coordinator.notifyCommitted(revision);
      const flushing = coordinator.flush();
      assert.equal(writes.length, 1);
      writes[0].request.resolve("head-0");
      await tick();
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[1].snapshot, { revision: 2 });
      assert.equal(writes[1].head, "head-0");
      assert.equal(coordinator.getState().persistedRevision, 0);
      assert.equal(
        changes.some((s) => s.status === "saved" && s.committedRevision > s.persistedRevision),
        false,
      );
      writes[1].request.resolve("head-2");
      await flushing;
      assert.equal(coordinator.getState().status, "saved");
      assert.equal(coordinator.getState().persistedRevision, 2);
      assert.equal(timer.pending, 0);
    }
    {
      const timer = clock();
      let revision = 0,
        calls = 0;
      const coordinator = createAutosaveCoordinator({
        projectId: "max-wait",
        clock: timer,
        capture: () => ({ revision, snapshot: revision }),
        save: async () => ++calls,
      });
      coordinator.notifyCommitted(revision);
      for (let i = 0; i < 5; i++) {
        timer.advance(500);
        revision++;
        coordinator.notifyCommitted(revision);
      }
      timer.advance(500);
      await tick();
      assert.equal(calls, 1);
    }
    {
      const timer = clock();
      let fails = true,
        calls = 0;
      const coordinator = createAutosaveCoordinator({
        projectId: "errors",
        clock: timer,
        capture: () => ({ revision: 7, snapshot: "data" }),
        save: async () => {
          calls++;
          if (fails) throw new Error("full");
          return "head";
        },
      });
      coordinator.notifyCommitted(7);
      await assert.rejects(coordinator.flush(), /full/);
      assert.equal(coordinator.getState().status, "error");
      assert.equal(coordinator.getState().persistedRevision, -1);
      timer.advance(30000);
      await tick();
      assert.equal(calls, 1);
      fails = false;
      await coordinator.retry();
      assert.equal(coordinator.getState().persistedRevision, 7);
    }
    {
      const timer = clock(),
        pending = deferred();
      let updates = 0,
        calls = 0;
      const coordinator = createAutosaveCoordinator({
        projectId: "dispose",
        clock: timer,
        capture: () => ({ revision: 0, snapshot: "" }),
        save: () => {
          calls++;
          return pending.promise;
        },
        onStateChange: () => updates++,
      });
      coordinator.notifyCommitted(0);
      const flushing = coordinator.flush();
      await tick();
      coordinator.dispose();
      const before = updates;
      pending.resolve("head");
      await flushing;
      coordinator.notifyCommitted(1);
      await coordinator.flush();
      assert.equal(updates, before);
      assert.equal(calls, 1);
      assert.equal(timer.pending, 0);
    }
    {
      const timer = clock();
      let available = false,
        calls = 0;
      const coordinator = createAutosaveCoordinator({
        projectId: "committing",
        clock: timer,
        capture: () => (available ? { revision: 0, snapshot: "" } : null),
        save: async () => ++calls,
      });
      coordinator.notifyCommitted(0);
      await coordinator.flush();
      assert.equal(calls, 0);
      available = true;
      coordinator.notifyCommitted(0);
      await coordinator.flush();
      assert.equal(calls, 1);
      coordinator.notifyCommitted(1);
      coordinator.dispose();
      timer.advance(5000);
      await tick();
      assert.equal(calls, 1);
    }
    console.log(
      "Autosave scheduling, coalescing, acknowledgements, retries and disposal verified.",
    );
  }, 60_000);
});
