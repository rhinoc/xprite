import { describe, expect, it, vi } from "vitest";

import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { WorkspaceLifetime } from "$/managers/workspace/workspace-lifetime";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function workspace(disposal = Promise.resolve()) {
  const initialize = vi.fn(async () => {});
  const dispose = vi.fn(() => disposal);
  return {
    instance: { initialize, dispose } as unknown as DocumentWorkspace,
    initialize,
    dispose,
  };
}

describe("workspace lifetime", () => {
  it("waits for the previous writer to drain before the replacement reads storage", async () => {
    const drained = deferred();
    const previous = workspace(drained.promise);
    const next = workspace();
    const lifetime = new WorkspaceLifetime();
    await lifetime.initialize(previous.instance);

    const initialized = lifetime.initialize(next.instance);
    expect(previous.dispose).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(next.initialize).not.toHaveBeenCalled();

    drained.resolve();
    await initialized;
    expect(next.initialize).toHaveBeenCalledOnce();
  });

  it("shares initialization across effect restarts and ignores stale cleanup", async () => {
    const previous = workspace();
    const next = workspace();
    const lifetime = new WorkspaceLifetime();
    const initialized = lifetime.initialize(previous.instance);
    expect(lifetime.initialize(previous.instance)).toBe(initialized);
    await initialized;
    expect(previous.initialize).toHaveBeenCalledOnce();

    await lifetime.initialize(next.instance);
    await lifetime.retire(previous.instance);
    expect(previous.dispose).toHaveBeenCalledOnce();
    expect(next.dispose).not.toHaveBeenCalled();

    const retired = lifetime.retire();
    expect(lifetime.retire()).toBe(retired);
    await retired;
    expect(next.dispose).toHaveBeenCalledOnce();
  });

  it("skips a superseded startup without bypassing an earlier pending writer", async () => {
    const drained = deferred();
    const previous = workspace(drained.promise);
    const superseded = workspace();
    const next = workspace();
    const lifetime = new WorkspaceLifetime();
    await lifetime.initialize(previous.instance);

    const skipped = lifetime.initialize(superseded.instance);
    const initialized = lifetime.initialize(next.instance);
    await Promise.resolve();
    expect(next.initialize).not.toHaveBeenCalled();
    expect(superseded.dispose).toHaveBeenCalledOnce();

    drained.resolve();
    await Promise.all([skipped, initialized]);
    expect(superseded.initialize).not.toHaveBeenCalled();
    expect(next.initialize).toHaveBeenCalledOnce();
  });
});
