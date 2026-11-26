import { describe, expect, it, vi } from "vitest";

import { createBrowserPixelationPort } from "$/adapters/pixelation/browser-pixelation";
import type { PixelationWorkerRequest } from "$/adapters/pixelation/worker-protocol";
import type { ManagedWorkerTransport } from "@xprite/bedrock/browser/managed-worker";
import { PixelationAlgorithm } from "@xprite/pixelate";

class MockPixelationWorker implements ManagedWorkerTransport<PixelationWorkerRequest> {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: Event) => void) | null = null;
  terminated = false;

  constructor(private readonly loads: boolean) {}

  postMessage(): void {
    queueMicrotask(() => {
      if (!this.loads) {
        this.onerror?.(new Event("error"));
      } else {
        this.onmessage?.({
          data: {
            grid: {
              width: 2,
              height: 2,
              cellWidth: 1,
              cellHeight: 1,
              offsetX: 0,
              offsetY: 0,
              reliable: true,
              confidence: 1,
            },
          },
        } as MessageEvent);
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe("browser pixelation port managed worker", () => {
  it("retries startup load failure once and reuses the loaded worker across jobs", async () => {
    const workers: MockPixelationWorker[] = [];
    const exhausted = vi.fn();
    const port = createBrowserPixelationPort({
      createWorker: () => {
        const worker = new MockPixelationWorker(workers.length > 0);
        workers.push(worker);
        return worker;
      },
      retryDelayMs: 1,
      onStartupFailureExhausted: exhausted,
    });
    port.prepare();
    expect(workers).toHaveLength(1);
    const image = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    const first = await port.detectGrid(image, PixelationAlgorithm.Auto);
    expect(first.width).toBe(2);
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(exhausted).not.toHaveBeenCalled();

    const second = await port.detectGrid(image, PixelationAlgorithm.Auto);
    expect(second.width).toBe(2);
    expect(workers).toHaveLength(2);
    port.dispose();
    expect(workers[1].terminated).toBe(true);
  });

  it("calls onStartupFailureExhausted when both startup attempts fail", async () => {
    const workers: MockPixelationWorker[] = [];
    const exhausted = vi.fn();
    const port = createBrowserPixelationPort({
      createWorker: () => {
        const worker = new MockPixelationWorker(false);
        workers.push(worker);
        return worker;
      },
      retryDelayMs: 1,
      onStartupFailureExhausted: exhausted,
    });
    const image = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    await expect(port.detectGrid(image, PixelationAlgorithm.Auto)).rejects.toThrow(
      "Unable to pixelate this image.",
    );
    expect(workers).toHaveLength(2);
    expect(exhausted).toHaveBeenCalledOnce();
    port.dispose();
  });
});
