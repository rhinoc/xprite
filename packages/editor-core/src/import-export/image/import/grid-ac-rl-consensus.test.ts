import { MessageChannel, type MessagePort } from "node:worker_threads";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

interface DetectMessage {
  type: "init" | "detect";
  port: MessagePort;
  width?: number;
  height?: number;
  data?: ArrayBuffer;
}

/** Uses the real structured-clone/transfer boundary and real response message ports. */
class BrowserDetector {
  onerror: ((event: unknown) => void) | null = null;
  readonly requests: { width: number; height: number; bytes: Uint8Array; detached: boolean }[] = [];
  readonly ports: MessagePort[] = [];
  initCount = 0;
  holdInit = false;
  holdDetect = false;
  consensus: { cols: number; rows: number } | null = { cols: 2, rows: 1 };

  postMessage(message: DetectMessage, transfer: (ArrayBuffer | MessagePort)[]): void {
    const received = structuredClone(message, { transfer });
    this.ports.push(received.port);
    if (received.type === "init") {
      this.initCount++;
      if (this.holdInit) return;
      received.port.postMessage({ ok: true, type: "init" });
    } else {
      this.requests.push({
        width: received.width!,
        height: received.height!,
        bytes: new Uint8Array(received.data!).slice(),
        detached: message.data!.byteLength === 0,
      });
      if (this.holdDetect) return;
      received.port.postMessage({ ok: true, type: "detect", consensus: this.consensus });
    }
    received.port.close();
  }

  terminate(): void {
    for (const port of this.ports) port.close();
  }
}

let detector: BrowserDetector;
let api: typeof import("$/import-export/image/import/grid-ac-rl-consensus");

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("XPRITE_AC_RL_WORKER", "0");
  vi.stubGlobal("MessageChannel", MessageChannel);
  detector = new BrowserDetector();
  api = await import("$/import-export/image/import/grid-ac-rl-consensus");
  api.setAcRlBrowserWorkerFactory(() => detector);
  expect(await api.warmAcRlBrowserWorker()).toBe(true);
});

afterEach(() => {
  api.setAcRlBrowserWorkerFactory(null);
  detector.terminate();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AC+RL nested-worker image ownership", () => {
  test("warm-up and concurrent first jobs share one initialization", async () => {
    api.setAcRlBrowserWorkerFactory(() => detector);
    detector.holdInit = true;
    const previousInits = detector.initCount;
    const warm = api.warmAcRlBrowserWorker();
    const image = { width: 1, height: 1, data: Uint8ClampedArray.from([17, 23, 41, 255]) };
    const jobs = Array.from({ length: 3 }, () => api.beginAcRlConsensusJobAsync(image));
    expect(detector.initCount).toBe(previousInits + 1);
    detector.ports.at(-1)!.postMessage({ ok: true, type: "init" });
    expect(await warm).toBe(true);
    for (const job of await Promise.all(jobs))
      expect(await api.finishAcRlConsensusJobAsync(job)).toEqual(detector.consensus);
    expect(detector.initCount).toBe(previousInits + 1);
  });

  test("a startup error releases the initialization waiter", async () => {
    api.setAcRlBrowserWorkerFactory(() => detector);
    detector.holdInit = true;
    const warm = api.warmAcRlBrowserWorker();
    detector.onerror?.(new Error("worker load failed"));
    expect(await warm).toBe(false);
    const job = await api.beginAcRlConsensusJobAsync({
      width: 1,
      height: 1,
      data: Uint8ClampedArray.from([17, 23, 41, 255]),
    });
    expect(job.mode).toBe("sync");
  });

  test("a worker error releases every in-flight detection", async () => {
    detector.holdDetect = true;
    const image = { width: 1, height: 1, data: Uint8ClampedArray.from([17, 23, 41, 255]) };
    const jobs = await Promise.all([
      api.beginAcRlConsensusJobAsync(image),
      api.beginAcRlConsensusJobAsync(image),
    ]);
    detector.onerror?.(new Error("worker stopped"));
    for (const job of jobs) expect(await api.finishAcRlConsensusJobAsync(job)).toBeNull();
    expect(await api.warmAcRlBrowserWorker()).toBe(false);
    expect(image.data).toEqual(Uint8ClampedArray.from([17, 23, 41, 255]));
  });

  test("replacing a worker cancels its warm-up without changing the replacement", async () => {
    api.setAcRlBrowserWorkerFactory(() => detector);
    detector.holdInit = true;
    const old = detector;
    const warm = api.warmAcRlBrowserWorker();
    detector = new BrowserDetector();
    api.setAcRlBrowserWorkerFactory(() => detector);
    const replacement = api.warmAcRlBrowserWorker();
    expect(await warm).toBe(false);
    expect(await replacement).toBe(true);
    old.onerror?.(new Error("late error"));
    expect(await api.warmAcRlBrowserWorker()).toBe(true);
    expect(detector.initCount).toBe(1);
  });

  for (const Source of [Uint8Array, Uint8ClampedArray])
    test.each([1, 3, 7])(
      `${Source.name} subview at byte offset %i transfers only its own pixels`,
      async (offset) => {
        const backing = new Uint8Array(offset + 8 + 9).fill(199);
        const source = new Source(backing.buffer, offset, 8);
        source.set([0, 16, 32, 255, 64, 128, 240, 127]);
        const original = backing.slice();
        const job = await api.beginAcRlConsensusJobAsync({ width: 2, height: 1, data: source });
        expect(await api.finishAcRlConsensusJobAsync(job)).toEqual({ cols: 2, rows: 1 });
        expect(detector.initCount).toBe(1);
        expect(detector.requests).toEqual([
          {
            width: 2,
            height: 1,
            bytes: Uint8Array.from([0, 16, 32, 255, 64, 128, 240, 127]),
            detached: true,
          },
        ]);
        // Both the pixel slice and its surrounding guards still belong to the caller.
        expect(source.buffer.byteLength).toBe(original.byteLength);
        expect(source.byteOffset).toBe(offset);
        expect(source).toHaveLength(8);
        expect(backing).toEqual(original);
      },
    );

  test("keeps the initialized worker usable when one image has no consensus", async () => {
    detector.consensus = null;
    const pixels = Uint8ClampedArray.from([17, 23, 41, 255]);
    const first = await api.beginAcRlConsensusJobAsync({ width: 1, height: 1, data: pixels });
    expect(await api.finishAcRlConsensusJobAsync(first)).toBeNull();
    detector.consensus = { cols: 1, rows: 1 };
    const second = await api.beginAcRlConsensusJobAsync({ width: 1, height: 1, data: pixels });
    expect(await api.finishAcRlConsensusJobAsync(second)).toEqual({ cols: 1, rows: 1 });
    expect(detector.initCount).toBe(1);
    expect(detector.requests).toHaveLength(2);
    expect(pixels).toEqual(Uint8ClampedArray.from([17, 23, 41, 255]));
  });
});
