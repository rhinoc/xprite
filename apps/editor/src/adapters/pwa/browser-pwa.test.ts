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
  const browserDocument = Object.assign(new EventTarget(), { visibilityState: "visible" });
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
      matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    }),
  );
  const errors: (Error & { diagnosticDetails?: { pwa?: Record<string, unknown> } })[] = [];
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
      transfer[0].postMessage({ type: STATUS_MESSAGE, ready: true, version: "release-123" }),
    );
    port.start();
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS);
    assert.equal(worker.postMessage.mock.calls.length, 2);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
    assert.equal(errors.length, 0);
  });

  it("bounds retries, reports the final phase and retries when the user returns", async () => {
    const { port, worker, errors, browserDocument } = harness();
    port.start();
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS * 2);
    assert.equal(worker.postMessage.mock.calls.length, 2);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Failed);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].diagnosticDetails?.pwa?.stage, "status");
    assert.equal(errors[0].diagnosticDetails?.pwa?.failure, "timeout");
    assert.equal(errors[0].diagnosticDetails?.pwa?.attempt, 2);
    assert.equal(errors[0].diagnosticDetails?.pwa?.worker_state, "activated");
    worker.postMessage.mockImplementation((_message, transfer) =>
      transfer[0].postMessage({ type: STATUS_MESSAGE, ready: true }),
    );
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(port.getState().offlineStatus, PwaOfflineStatus.Ready);
    assert.equal(errors.length, 1);
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
      transfer[0].postMessage({ type: STATUS_MESSAGE, ready: false, version: "release-123" }),
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
