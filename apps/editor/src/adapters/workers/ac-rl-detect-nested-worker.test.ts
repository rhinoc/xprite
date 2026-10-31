import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const wasm = vi.hoisted(() => ({ init: vi.fn(), detect: vi.fn() }));
vi.mock("@xprite/fixer-detect-wasm", () => ({
  default: wasm.init,
  detectFastAcRl: wasm.detect,
}));

beforeEach(() => {
  vi.resetModules();
  wasm.init.mockReset();
  wasm.detect.mockReset();
  vi.stubGlobal("onmessage", null);
});

afterEach(() => vi.unstubAllGlobals());

async function loadWorker() {
  await import("$/adapters/workers/ac-rl-detect-nested-worker");
  const scope = globalThis as unknown as {
    onmessage: (event: { data: object }) => Promise<void>;
  };
  return (data: object) => scope.onmessage({ data });
}

describe("nested detector WASM initialization", () => {
  test("concurrent warm-up and detection initialize one WASM instance", async () => {
    let finish!: () => void;
    wasm.init.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    wasm.detect.mockReturnValue({ consensus: "fast:ac+rl(S)", cols: 1, rows: 1 });
    const dispatch = await loadWorker();
    const ports = Array.from({ length: 3 }, () => ({ postMessage: vi.fn() }));
    const rgba = Uint8Array.from([17, 23, 41, 255]);
    const jobs = [
      dispatch({ type: "init", port: ports[0] }),
      dispatch({ type: "init", port: ports[1] }),
      dispatch({ type: "detect", width: 1, height: 1, data: rgba.buffer, port: ports[2] }),
    ];
    expect(wasm.init).toHaveBeenCalledTimes(1);
    expect(wasm.detect).not.toHaveBeenCalled();
    finish();
    await Promise.all(jobs);
    expect(wasm.detect).toHaveBeenCalledWith(rgba, 1, 1);
    expect(ports[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, type: "init" }),
    );
    expect(ports[1].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, type: "init" }),
    );
    expect(ports[2].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, consensus: { cols: 1, rows: 1 } }),
    );
    await dispatch({ type: "init", port: ports[0] });
    expect(wasm.init).toHaveBeenCalledTimes(1);
  });

  test("a failed initialization reports all waiters and allows a retry", async () => {
    let fail!: (error: Error) => void;
    wasm.init.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
    );
    const dispatch = await loadWorker();
    const ports = Array.from({ length: 2 }, () => ({ postMessage: vi.fn() }));
    const jobs = ports.map((port) => dispatch({ type: "init", port }));
    fail(new Error("WASM unavailable"));
    await Promise.all(jobs);
    for (const port of ports)
      expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    wasm.init.mockResolvedValue(undefined);
    await dispatch({ type: "init", port: ports[0] });
    expect(wasm.init).toHaveBeenCalledTimes(2);
    expect(ports[0].postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true }));
  });
});
