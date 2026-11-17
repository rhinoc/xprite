import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import { diagnoseWorkerScript } from "$/adapters/pwa/worker-script-diagnostic";

function setup() {
  vi.useFakeTimers();
  vi.stubGlobal("window", { location: { origin: "https://xprite.test" } });
  vi.stubGlobal("navigator", { onLine: true });
  const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, controller: new AbortController() };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("single safe worker script diagnostic", () => {
  it("records only the HTTP outcome and status using a credentialless uncached GET", async () => {
    const { fetcher, controller } = setup();
    assert.deepEqual(await diagnoseWorkerScript("/", controller.signal), {
      script_probe_outcome: "http",
      script_probe_status: 503,
    });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    assert.equal(url, "https://xprite.test/sw.js");
    assert.equal(options?.method, "GET");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.redirect, "manual");
    assert.equal(options?.mode, "same-origin");
    assert.equal(options?.body, undefined);
    assert.equal(options?.headers, undefined);
    assert.equal(fetcher.mock.calls.length, 1);
  });

  it("does not follow a redirect or record its destination", async () => {
    const { controller } = setup();
    vi.mocked(fetch).mockResolvedValue({
      type: "opaqueredirect",
      status: 0,
      body: null,
    } as Response);
    assert.deepEqual(await diagnoseWorkerScript("/", controller.signal), {
      script_probe_outcome: "redirect",
      script_probe_status: 0,
    });
  });

  it("records a network failure without the raw error or response body", async () => {
    const { controller } = setup();
    vi.mocked(fetch).mockRejectedValue(new TypeError("private URL and details"));
    assert.deepEqual(await diagnoseWorkerScript("/", controller.signal), {
      script_probe_outcome: "network",
      script_probe_status: null,
    });
  });

  it("bounds even an uncooperative fetch to three seconds and aborts it", async () => {
    const { controller } = setup();
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const pending = diagnoseWorkerScript("/", controller.signal);
    await vi.advanceTimersByTimeAsync(3_000);
    assert.deepEqual(await pending, { script_probe_outcome: "timeout", script_probe_status: null });
    assert.equal(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted, true);
    assert.equal(vi.getTimerCount(), 0);
  });

  it("cancels promptly on caller disposal without waiting for fetch", async () => {
    const { controller } = setup();
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const pending = diagnoseWorkerScript("/", controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    assert.deepEqual(await pending, {
      script_probe_outcome: "cancelled",
      script_probe_status: null,
    });
    assert.equal(vi.getTimerCount(), 0);
  });

  it("never fetches cross-origin, parameterized, offline, or already-cancelled requests", async () => {
    const { fetcher, controller } = setup();
    for (const base of ["https://other.test/", "//other.test/", "/?secret=", "/#private"])
      assert.equal(
        (await diagnoseWorkerScript(base, controller.signal)).script_probe_outcome,
        "unavailable",
      );
    Object.assign(navigator, { onLine: false });
    assert.equal(
      (await diagnoseWorkerScript("/", controller.signal)).script_probe_outcome,
      "offline",
    );
    controller.abort();
    assert.equal(
      (await diagnoseWorkerScript("/", controller.signal)).script_probe_outcome,
      "cancelled",
    );
    assert.equal(fetcher.mock.calls.length, 0);
  });
});
