import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import {
  PwaInstallMethod,
  PwaInstallOutcome,
  PwaOfflineStatus,
  type PwaPlatformState,
  type PwaPort,
} from "$/managers/ports/pwa";
import { PwaManager, PwaNotice } from "$/managers/pwa/pwa-manager";

afterEach(() => vi.useRealTimers());

function fakePort() {
  let state: PwaPlatformState = {
    supported: false,
    installed: false,
    installMethod: PwaInstallMethod.None,
    offlineStatus: PwaOfflineStatus.Unsupported,
    chunkFailures: 0,
  };
  const listeners = new Set<() => void>();
  const port: PwaPort = {
    getState: () => state,
    subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    start: () => () => {},
    install: async () => PwaInstallOutcome.Unavailable,
    requestPersistentStorage: async () => {},
    dispose: () => {},
  };
  return {
    port,
    failChunk() {
      state = { ...state, chunkFailures: state.chunkFailures + 1 };
      for (const listener of listeners) listener();
    },
  };
}

describe("update notice", () => {
  it("keeps the update prompt until it is dismissed, even where installation is unsupported", () => {
    vi.useFakeTimers();
    const { port, failChunk } = fakePort();
    const manager = new PwaManager({
      port,
      preferences: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
    manager.start();
    assert.equal(manager.getState().notice, null);
    failChunk();
    assert.equal(manager.getState().notice, PwaNotice.UpdateAvailable);
    vi.advanceTimersByTime(10 * 60_000);
    assert.equal(manager.getState().notice, PwaNotice.UpdateAvailable);
    manager.dismissNotice();
    assert.equal(manager.getState().notice, null);
    failChunk();
    assert.equal(manager.getState().notice, PwaNotice.UpdateAvailable);
  });
});
