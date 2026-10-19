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
  return { port, worker, serviceWorker, errors, browserDocument };
}

afterEach(() => {
  for (const port of ports.splice(0)) port.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    assert.equal(errors[0].diagnosticDetails?.pwa?.worker_version, "release-123");
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
    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(0);
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
