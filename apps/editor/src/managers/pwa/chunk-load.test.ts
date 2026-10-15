import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import { CHUNK_LOAD_FAILED_EVENT } from "$/managers/ports/chunk-load";
import { CHUNK_LOAD_RETRY_DELAY_MS, loadChunk } from "$/managers/pwa/chunk-load";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function windowStub() {
  const target = new EventTarget();
  const failures: unknown[] = [];
  target.addEventListener(CHUNK_LOAD_FAILED_EVENT, (event) =>
    failures.push((event as CustomEvent).detail.error),
  );
  vi.stubGlobal("window", target);
  return failures;
}

describe("loadChunk", () => {
  it("returns a chunk that loads on the retry without announcing a failure", async () => {
    vi.useFakeTimers();
    const failures = windowStub();
    const importer = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockResolvedValue("module");
    const loading = loadChunk(importer);
    await vi.advanceTimersByTimeAsync(CHUNK_LOAD_RETRY_DELAY_MS);
    assert.equal(await loading, "module");
    assert.equal(importer.mock.calls.length, 2);
    assert.equal(failures.length, 0);
  });

  it("retries once, announces the second failure and rethrows without reloading", async () => {
    vi.useFakeTimers();
    const failures = windowStub();
    const reload = vi.fn();
    (window as unknown as { location: { reload: () => void } }).location = { reload };
    const error = new TypeError("Failed to fetch dynamically imported module: https://x/a.js");
    const importer = vi.fn<() => Promise<string>>().mockRejectedValue(error);
    const loading = loadChunk(importer);
    const settled = assert.rejects(loading, error);
    await vi.advanceTimersByTimeAsync(CHUNK_LOAD_RETRY_DELAY_MS);
    await settled;
    assert.equal(importer.mock.calls.length, 2);
    assert.deepEqual(failures, [error]);
    assert.equal(reload.mock.calls.length, 0);
  });
});
