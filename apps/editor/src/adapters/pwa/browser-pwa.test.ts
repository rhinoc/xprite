import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import { createBrowserPwaPort } from "$/adapters/pwa/browser-pwa";
import { PwaOfflineStatus, type PwaPort } from "$/managers/ports/pwa";

const STATUS_MESSAGE = "XPRITE_OFFLINE_STATUS";
const STATUS_TIMEOUT_MS = 15_000;
const ports: PwaPort[] = [];

class ReplyPort {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  peer?: ReplyPort;
  closed = false;
  postMessage(data: unknown) {
    if (!this.closed && !this.peer?.closed) this.peer?.onmessage?.({ data });
  }
  close() {
    this.closed = true;
  }
}

class ReplyChannel {
  port1 = new ReplyPort();
  port2 = new ReplyPort();
  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

function harness() {
  vi.useFakeTimers();
  vi.stubGlobal("MessageChannel", ReplyChannel);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 200 })),
  );
  const worker = Object.assign(new EventTarget(), {
    state: "activated",
    postMessage: vi.fn((_message: unknown, _transfer: ReplyPort[]) => {}),
  });
  const registration = Object.assign(new EventTarget(), {
    active: worker,
    installing: null,
    waiting: null,
    update: vi.fn(async () => {}),
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: worker,
    register: vi.fn(async () => registration),
  });
  const browserDocument = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  vi.stubGlobal("document", browserDocument);
  vi.stubGlobal("navigator", {
    serviceWorker,
    onLine: true,
    userAgent: "Chrome",
    maxTouchPoints: 0,
  });
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      isSecureContext: true,
      location: { origin: "https://xprite.test" },
      matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    }),
  );
  const errors: (Error & {
    diagnosticDetails?: { pwa?: Record<string, unknown> };
  })[] = [];
  const port = createBrowserPwaPort({
    enabled: true,
    baseUrl: "/",
    onError: (error) => errors.push(error as Error),
  });
  ports.push(port);
  return { port, worker, registration, serviceWorker, errors, browserDocument };
}

afterEach(() => {
  for (const port of ports.splice(0)) port.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PWA timeout recovery", () => {
  it("recovers from one missed status response without reporting a failed offline session", async () => {
    const { port, worker, errors } = harness();
    worker.postMessage.mockImplementationOnce(() => {});
    worker.postMessage.mockImplementation((_message, transfer) =>
      transfer[0].postMessage({
        type: STATUS_MESSAGE,
        ready: true,
        version: "release-123",
      }),
    );
    port.start();
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS);
    assert.equal(worker.postMessage.mock.calls.length, 2);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
    assert.equal(errors.length, 0);
  });

  it("bounds retries, logs the final status timeout without an exception and retries when the user returns", async () => {
    const { port, worker, errors, browserDocument } = harness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    port.start();
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS * 2);
    assert.equal(worker.postMessage.mock.calls.length, 2);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Failed);
    assert.equal(errors.length, 0, "a status-ping timeout is not an exception");
    assert.equal(warn.mock.calls.length, 1);
    assert.equal(warn.mock.calls[0][0], "pwa_status_timeout");
    const logged = warn.mock.calls[0][1] as Record<string, unknown>;
    assert.equal(logged.stage, "status");
    assert.equal(logged.failure, "timeout");
    assert.equal(logged.attempt, 2);
    assert.equal(logged.worker_state, "activated");
    assert.equal(logged.timeout_ms, STATUS_TIMEOUT_MS);
    assert.equal(typeof logged.elapsed_ms, "number");
    worker.postMessage.mockImplementation((_message, transfer) =>
      transfer[0].postMessage({ type: STATUS_MESSAGE, ready: true }),
    );
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
    assert.equal(errors.length, 0);
  });

  it("does not retry or report a timeout from a stopped session", async () => {
    const { port, worker, errors } = harness();
    const stop = port.start();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS * 2);
    assert.equal(worker.postMessage.mock.calls.length, 1);
    assert.equal(errors.length, 0);
  });

  it("reports cache preparation timeout without a second activation timeout", async () => {
    const { port, worker, errors } = harness();
    worker.postMessage.mockImplementationOnce((_message, transfer) =>
      transfer[0].postMessage({
        type: STATUS_MESSAGE,
        ready: false,
        version: "release-123",
      }),
    );
    port.start();
    await vi.advanceTimersByTimeAsync(120_000);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Failed);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].diagnosticDetails?.pwa?.stage, "prepare");
    assert.equal(
      errors[0].diagnosticDetails?.pwa?.worker_version,
      null,
      "no cache version was ever verified ready",
    );
    assert.equal(worker.postMessage.mock.calls.length, 2);
  });

  it("records rejected registration separately from message timeouts", async () => {
    const { port, serviceWorker, errors } = harness();
    serviceWorker.register.mockRejectedValue(new Error("Rejected"));
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Failed);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].diagnosticDetails?.pwa?.stage, "register");
    assert.equal(errors[0].diagnosticDetails?.pwa?.register_native, false);
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS * 2);
    assert.equal(serviceWorker.register.mock.calls.length, 1);
  });

  it("demotes activation timeout while the worker is still installing", async () => {
    const { port, serviceWorker, errors } = harness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const installing = Object.assign(new EventTarget(), {
      state: "installing",
      postMessage: vi.fn(
        (_message: unknown, transfer: { postMessage: (data: unknown) => void }[]) => {
          transfer[0].postMessage({
            type: STATUS_MESSAGE,
            ready: true,
            version: "release-install",
          });
        },
      ),
    });
    let resolveRegister: (value: unknown) => void = () => {};
    serviceWorker.register.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegister = resolve;
        }),
    );
    Object.assign(serviceWorker, { controller: null });
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    const registration = Object.assign(new EventTarget(), {
      active: null,
      installing,
      waiting: null,
      update: vi.fn(async () => {}),
    });
    resolveRegister(registration);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120_000);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Failed);
    assert.equal(errors.length, 0, "install-in-progress timeout must not raise an exception");
    assert.equal(
      warn.mock.calls.some((call) => call[0] === "pwa_activation_timeout"),
      true,
    );
    warn.mockRestore();
    // Completing install later still prepares offline.
    Object.assign(installing, { state: "activated" });
    Object.assign(registration, { active: installing, installing: null });
    installing.dispatchEvent(new Event("statechange"));
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
  });

  it("prepares from an existing controller even when register never resolves", async () => {
    const { port, worker, serviceWorker, errors } = harness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Never resolve register — mirrors Safari hangs while an older controller stays active.
    serviceWorker.register.mockImplementation(() => new Promise(() => {}));
    worker.postMessage.mockImplementation((_message, transfer) =>
      transfer[0].postMessage({
        type: STATUS_MESSAGE,
        ready: true,
        version: "release-controller",
      }),
    );
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
    await vi.advanceTimersByTimeAsync(120_000);
    assert.equal(errors.length, 0, "register hang with controller must not raise an exception");
    assert.equal(
      warn.mock.calls.some((call) => call[0] === "pwa_activation_timeout"),
      false,
      "successful prepare clears the activation budget",
    );
    warn.mockRestore();
  });
});

describe("stale chunk reporting", () => {
  const CHUNK_URL = "https://xprite.test/assets/animation-preview-C439ED4q.js";

  function chunkFailure(window: EventTarget) {
    window.dispatchEvent(
      new CustomEvent("xprite:chunk-load-failed", {
        detail: {
          error: new TypeError(`Failed to fetch dynamically imported module: ${CHUNK_URL}`),
        },
      }),
    );
  }

  it("raises the update signal and reports worker context for a missing chunk", async () => {
    const { port, worker, errors } = harness();
    Object.assign(worker, { scriptURL: "https://xprite.test/sw.js?x=1" });
    worker.postMessage.mockImplementation((message: { type: string }, transfer) =>
      message.type === "XPRITE_OFFLINE_HAS_RESOURCE"
        ? transfer[0].postMessage({
            type: message.type,
            present: false,
            version: "release-9",
          })
        : transfer[0].postMessage({
            type: STATUS_MESSAGE,
            ready: true,
            version: "release-9",
          }),
    );
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    chunkFailure(window);
    assert.equal(port.getState().chunkFailures, 1);
    await vi.advanceTimersByTimeAsync(0);
    const details = errors.at(-1)?.diagnosticDetails?.pwa;
    assert.equal(details?.stage, "chunk");
    assert.equal(details?.failure, "chunk-load");
    assert.equal(details?.controlled, true);
    assert.equal(details?.controller_state, "activated");
    assert.equal(details?.script_path, "/sw.js");
    assert.equal(details?.chunk, "/assets/animation-preview-C439ED4q.js");
    assert.equal(details?.chunk_in_worker_build, false);
    assert.equal(details?.worker_version, "release-9");
  });

  it("reports an uncontrolled page and listens even when the worker is unsupported", async () => {
    const { port, serviceWorker, errors } = harness();
    Object.assign(serviceWorker, { controller: null });
    const unsupported = createBrowserPwaPort({
      enabled: false,
      baseUrl: "/",
      onError: (error) => errors.push(error as Error),
    });
    ports.push(unsupported);
    unsupported.start();
    chunkFailure(window);
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(unsupported.getState().chunkFailures, 1);
    assert.equal(port.getState().chunkFailures, 0);
    const details = errors.at(-1)?.diagnosticDetails?.pwa;
    assert.equal(details?.controlled, false);
    assert.equal(details?.chunk_in_worker_build, null);
  });

  it("re-registers instead of reporting when update finds no registration", async () => {
    const { port, serviceWorker, errors } = harness();
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    const registration = (await serviceWorker.register.mock.results[0].value) as {
      update: ReturnType<typeof vi.fn>;
    };
    registration.update.mockRejectedValueOnce(
      Object.assign(new Error("The registration has no worker"), { name: "InvalidStateError" }),
    );
    const registrations = serviceWorker.register.mock.calls.length;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(serviceWorker.register.mock.calls.length, registrations + 1);
    assert.equal(
      errors.filter((error) => error.diagnosticDetails?.pwa?.stage === "update").length,
      0,
    );
  });

  it("still reports unexpected update failures", async () => {
    const { port, serviceWorker, errors } = harness();
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    const registration = (await serviceWorker.register.mock.results[0].value) as {
      update: ReturnType<typeof vi.fn>;
    };
    registration.update.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const registrations = serviceWorker.register.mock.calls.length;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(serviceWorker.register.mock.calls.length, registrations);
    assert.equal(errors.at(-1)?.diagnosticDetails?.pwa?.stage, "update");
  });

  it("reports a worker fetch or integrity failure explicitly", async () => {
    const { port, serviceWorker, errors } = harness();
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    serviceWorker.dispatchEvent(
      Object.assign(new Event("message"), {
        data: {
          type: "XPRITE_OFFLINE_FETCH_FAILED",
          path: "/assets/chunk-NEW22222.js",
          failure: "integrity",
          status: null,
          version: "release-9",
        },
      }),
    );
    const details = errors.at(-1)?.diagnosticDetails?.pwa;
    assert.equal(details?.stage, "fetch");
    assert.equal(details?.failure, "integrity");
    assert.equal(details?.worker_version, "release-9");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function replyReady(worker: ReturnType<typeof harness>["worker"]) {
  worker.postMessage.mockImplementation((_message, transfer) =>
    transfer[0].postMessage({ type: STATUS_MESSAGE, ready: true, version: "fixture" }),
  );
}

describe("SW request lifetime", () => {
  it("coalesces startup/reconnect registration and ignores rejection after disposal", async () => {
    const { port, worker, serviceWorker, errors } = harness();
    replyReady(worker);
    const pending = deferred<Awaited<ReturnType<typeof serviceWorker.register>>>();
    serviceWorker.register.mockImplementation(() => pending.promise);
    port.start();
    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(serviceWorker.register.mock.calls.length, 1);
    port.dispose();
    pending.reject(new TypeError("Failed to fetch"));
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(serviceWorker.register.mock.calls.length, 1);
    assert.equal(errors.length, 0);
  });

  it("coalesces concurrent updates and retries a transient failure without another online event", async () => {
    const { port, worker, serviceWorker, errors } = harness();
    replyReady(worker);
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    const registration = await serviceWorker.register.mock.results[0].value;
    const pending = deferred<void>();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registration.update.mockImplementationOnce(() => pending.promise);
    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(registration.update.mock.calls.length, 1);
    pending.reject(new TypeError("Failed to fetch"));
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(registration.update.mock.calls.length, 2);
    assert.equal(serviceWorker.register.mock.calls.length, 1);
    assert.equal(errors.filter((e) => e.diagnosticDetails?.pwa?.stage === "update").length, 0);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(registration.update.mock.calls.length, 3, "a later reconnect begins a new cycle");
    assert.equal(warn.mock.calls.filter((call) => call[0] === "pwa_update_retry").length, 1);
    warn.mockRestore();
  });

  for (const name of ["InvalidStateError", "TypeError"])
    it(`ignores late ${name} update failure from a stopped session`, async () => {
      const { port, worker, serviceWorker, errors } = harness();
      replyReady(worker);
      const stop = port.start();
      await vi.advanceTimersByTimeAsync(0);
      const registration = await serviceWorker.register.mock.results[0].value;
      const pending = deferred<void>();
      registration.update.mockImplementationOnce(() => pending.promise);
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(250);
      stop();
      port.start();
      await vi.advanceTimersByTimeAsync(0);
      pending.reject(Object.assign(new Error("late result"), { name }));
      await vi.advanceTimersByTimeAsync(0);
      assert.equal(serviceWorker.register.mock.calls.length, 2);
      assert.equal(errors.length, 0);
      assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
    });

  it("does not install a registration resolved after its session stopped", async () => {
    const { port, worker, serviceWorker } = harness();
    replyReady(worker);
    const original = await serviceWorker.register();
    serviceWorker.register.mockClear();
    const pending = deferred<typeof original>();
    const replacement = Object.assign(new EventTarget(), {
      ...original,
      update: vi.fn(async () => {}),
    });
    serviceWorker.register
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(replacement);
    const stop = port.start();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    pending.resolve(original);
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(original.update.mock.calls.length, 0);
    assert.equal(replacement.update.mock.calls.length, 1);
  });

  it("reports SecurityError once without retrying or invalidating a verified controller", async () => {
    const { port, worker, serviceWorker, errors } = harness();
    replyReady(worker);
    const pending = deferred<Awaited<ReturnType<typeof serviceWorker.register>>>();
    serviceWorker.register.mockImplementation(() => pending.promise);
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
    pending.reject(new DOMException("blocked by policy", "SecurityError"));
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(serviceWorker.register.mock.calls.length, 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].name, "SecurityError");
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
  });
});

describe("bounded online update recovery", () => {
  it("debounces online bursts, warns only for verified cache, then recovers automatically", async () => {
    const h = harness();
    replyReady(h.worker);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    h.registration.update.mockRejectedValueOnce(new TypeError("network"));
    for (let n = 0; n < 20; n++) window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(249);
    assert.equal(h.registration.update.mock.calls.length, 0);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(h.registration.update.mock.calls.length, 1);
    assert.equal(h.errors.length, 0);
    assert.equal(h.port.getState().offlineStatus, PwaOfflineStatus.Ready);
    assert.equal(warn.mock.calls[0][0], "pwa_update_retry");
    await vi.advanceTimersByTimeAsync(999);
    assert.equal(h.registration.update.mock.calls.length, 1);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(h.registration.update.mock.calls.length, 2);
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(h.registration.update.mock.calls.length, 2);
    assert.equal(h.errors.length, 0);
    assert.equal(vi.mocked(fetch).mock.calls.length, 1);
  });

  it("reports exhaustion after three attempts, even with a verified ready worker", async () => {
    const h = harness();
    replyReady(h.worker);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    const failure = new TypeError("network");
    h.registration.update.mockRejectedValue(failure);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(5_250);
    assert.equal(h.registration.update.mock.calls.length, 3);
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0], failure);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.attempt, 3);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.retry_exhausted, true);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.usable_worker, true);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.worker_version, "fixture");
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.script_probe_status, 200);
    assert.equal(h.port.getState().offlineStatus, PwaOfflineStatus.Ready);
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(h.registration.update.mock.calls.length, 3);
    assert.equal(vi.mocked(fetch).mock.calls.length, 1);
  });

  it("does not suppress the first update failure when no cache has been verified", async () => {
    const h = harness();
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    h.registration.update.mockRejectedValueOnce(new TypeError("network"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.usable_worker, false);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.worker_version, null);
  });

  it("retains the last verified version while a new status probe is unanswered", async () => {
    const h = harness();
    replyReady(h.worker);
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    h.worker.postMessage.mockImplementation(() => {});
    h.registration.update.mockRejectedValue(new DOMException("policy", "SecurityError"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.worker_version, "fixture");
    assert.equal(h.port.getState().offlineStatus, PwaOfflineStatus.Ready);
    await vi.advanceTimersByTimeAsync(10_000);
    assert.equal(h.registration.update.mock.calls.length, 1, "policy errors are not retried");
  });

  it("does not call an activated but different controller a verified usable worker", async () => {
    const h = harness();
    replyReady(h.worker);
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    const unknown = Object.assign(new EventTarget(), { state: "activated", postMessage: vi.fn() });
    Object.assign(h.serviceWorker, { controller: unknown });
    h.registration.update.mockRejectedValueOnce(new TypeError("network"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.usable_worker, false);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.worker_version, null);
  });

  it("pauses offline and resumes without resetting backoff or the three-attempt budget", async () => {
    const h = harness();
    replyReady(h.worker);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    h.registration.update.mockRejectedValue(new TypeError("network"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    Object.assign(navigator, { onLine: false });
    window.dispatchEvent(new Event("offline"));
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(h.registration.update.mock.calls.length, 1);
    Object.assign(navigator, { onLine: true });
    for (let n = 0; n < 20; n++) window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(999);
    assert.equal(h.registration.update.mock.calls.length, 1);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(h.registration.update.mock.calls.length, 2);
    Object.assign(navigator, { onLine: false });
    window.dispatchEvent(new Event("offline"));
    Object.assign(navigator, { onLine: true });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(4_000);
    assert.equal(h.registration.update.mock.calls.length, 3);
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0].diagnosticDetails?.pwa?.retry_exhausted, true);
    assert.equal(vi.mocked(fetch).mock.calls.length, 1);
  });

  it("does no update while offline even if an online event is misfired", async () => {
    const h = harness();
    replyReady(h.worker);
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    Object.assign(navigator, { onLine: false });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(h.registration.update.mock.calls.length, 0);
    assert.equal(vi.mocked(fetch).mock.calls.length, 0);
  });

  it("cancels scheduled retry and pending diagnostic on dispose", async () => {
    const h = harness();
    replyReady(h.worker);
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    h.registration.update.mockRejectedValue(new TypeError("network"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    h.port.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(signal?.aborted, true);
    assert.equal(h.registration.update.mock.calls.length, 1);
    assert.equal(h.errors.length, 0);
  });

  it("cancels a queued initial update on stop and does not carry it to a new session", async () => {
    const h = harness();
    replyReady(h.worker);
    const stop = h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("online"));
    stop();
    h.port.start();
    await vi.advanceTimersByTimeAsync(10_000);
    assert.equal(h.registration.update.mock.calls.length, 0);
    assert.equal(h.errors.length, 0);
  });
});

describe("SW update retries and diagnostics", () => {
  it("reports once after three failed attempts and preserves the verified cache", async () => {
    const { port, worker, serviceWorker, errors } = harness();
    replyReady(worker);
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    const registration = await serviceWorker.register.mock.results[0].value;
    registration.update.mockRejectedValue(new TypeError("Failed to fetch sw.js"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(42_000);
    assert.equal(registration.update.mock.calls.length, 3);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].diagnosticDetails?.pwa?.attempt, 3);
    assert.equal(errors[0].diagnosticDetails?.pwa?.retry_exhausted, true);
    assert.equal(errors[0].diagnosticDetails?.pwa?.verified_controller, true);
    assert.equal(errors[0].diagnosticDetails?.pwa?.offline_status, PwaOfflineStatus.Ready);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
    await vi.advanceTimersByTimeAsync(120_000);
    assert.equal(registration.update.mock.calls.length, 3);
  });

  for (const action of ["stop", "dispose", "offline", "controllerchange"] as const)
    it(`cancels scheduled retries on ${action}`, async () => {
      const { port, worker, serviceWorker, errors } = harness();
      replyReady(worker);
      const stop = port.start();
      await vi.advanceTimersByTimeAsync(0);
      const registration = await serviceWorker.register.mock.results[0].value;
      registration.update.mockRejectedValue(new TypeError("Failed to fetch"));
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(250);
      if (action === "stop") stop();
      else if (action === "dispose") port.dispose();
      else if (action === "offline") {
        Object.assign(navigator, { onLine: false });
        window.dispatchEvent(new Event("offline"));
      } else serviceWorker.dispatchEvent(new Event("controllerchange"));
      await vi.advanceTimersByTimeAsync(60_000);
      assert.equal(registration.update.mock.calls.length, 1);
      assert.equal(errors.length, 0);
      if (action === "offline") {
        Object.assign(navigator, { onLine: true });
        registration.update.mockResolvedValue(undefined);
        window.dispatchEvent(new Event("online"));
        await vi.advanceTimersByTimeAsync(1_000);
        assert.equal(registration.update.mock.calls.length, 2);
      }
    });

  it("never retries a policy error even when the cache is verified", async () => {
    const { port, worker, serviceWorker, errors } = harness();
    replyReady(worker);
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    const registration = await serviceWorker.register.mock.results[0].value;
    registration.update.mockRejectedValue(new DOMException("Blocked", "SecurityError"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(registration.update.mock.calls.length, 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].name, "SecurityError");
  });

  it("keeps the known version while a status probe is pending", async () => {
    const { port, worker, serviceWorker, errors } = harness();
    replyReady(worker);
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    worker.postMessage.mockImplementation(() => {});
    const registration = await serviceWorker.register.mock.results[0].value;
    registration.update.mockRejectedValue(new DOMException("Blocked", "SecurityError"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    const details = errors[0].diagnosticDetails?.pwa;
    assert.equal(details?.worker_version, "fixture");
    assert.equal(details?.status_pending, true);
    assert.equal(details?.verified_controller, true);
    assert.equal(details?.offline_status, PwaOfflineStatus.Ready);
    assert.equal(details?.usable_worker, true);
    assert.equal(details?.script_probe_outcome, "http");
    assert.equal(details?.script_probe_status, 200);
  });

  it("does not reuse a previous controller's version or suppress its replacement's failure", async () => {
    const { port, worker, serviceWorker, errors } = harness();
    replyReady(worker);
    port.start();
    await vi.advanceTimersByTimeAsync(0);
    const replacement = Object.assign(new EventTarget(), {
      state: "activated",
      postMessage: vi.fn(() => {}),
    });
    Object.assign(serviceWorker, { controller: replacement });
    serviceWorker.dispatchEvent(new Event("controllerchange"));
    const registration = await serviceWorker.register.mock.results[0].value;
    registration.update.mockRejectedValue(new TypeError("Failed to fetch"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    const details = errors[0].diagnosticDetails?.pwa;
    assert.equal(details?.worker_version, null);
    assert.equal(details?.verified_controller, false);
    assert.equal(details?.status_pending, true);
    assert.equal(registration.update.mock.calls.length, 1);
  });

  it("cancels in-flight update failures and probes when the controller changes", async () => {
    const h = harness();
    replyReady(h.worker);
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    const pending = deferred<void>();
    h.registration.update.mockImplementationOnce(() => pending.promise);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    const replacement = Object.assign(new EventTarget(), {
      state: "activated",
      postMessage: vi.fn(() => {}),
    });
    Object.assign(h.serviceWorker, { controller: replacement });
    h.serviceWorker.dispatchEvent(new Event("controllerchange"));
    pending.reject(new TypeError("stale controller"));
    await vi.advanceTimersByTimeAsync(1_000);
    assert.equal(h.errors.length, 0);
    assert.equal(h.registration.update.mock.calls.length, 1);
    assert.equal(vi.mocked(fetch).mock.calls.length, 0);
  });

  it("does not attribute an active worker's version to a page without a controller", async () => {
    const h = harness();
    replyReady(h.worker);
    h.port.start();
    await vi.advanceTimersByTimeAsync(0);
    Object.assign(h.serviceWorker, { controller: null });
    h.serviceWorker.dispatchEvent(new Event("controllerchange"));
    h.registration.update.mockRejectedValueOnce(new TypeError("network"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(250);
    const details = h.errors[0].diagnosticDetails?.pwa;
    assert.equal(details?.worker_version, null);
    assert.equal(details?.verified_controller, false);
    assert.equal(details?.usable_worker, false);
    assert.equal(details?.status_pending, false);
  });
});
