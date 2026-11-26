import { describe, expect, it, vi } from "vitest";

import {
  createAnimalCrossingPreviewRenderer,
  type AnimalCrossingPreviewWorkerTransport,
} from "$/animal-crossing/preview-client";
import type { AnimalCrossingPreviewRequest } from "$/animal-crossing/preview-types";

class MockPreviewWorker implements AnimalCrossingPreviewWorkerTransport {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: Event) => void) | null = null;
  readonly posted: AnimalCrossingPreviewRequest[] = [];
  terminated = false;

  constructor(private readonly loads: boolean) {}

  postMessage(request: AnimalCrossingPreviewRequest): void {
    this.posted.push(request);
    queueMicrotask(() => {
      if (!this.loads) {
        this.onerror?.(new Event("error"));
      } else {
        this.onmessage?.({
          data: {
            ok: true,
            preview: { result: {} as never, selected: request.selected, qr: {} as never },
          },
        } as MessageEvent);
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe("Animal Crossing preview worker client", () => {
  it("retries opaque startup load failure and resends source pixels to the replacement worker", async () => {
    const workers: MockPreviewWorker[] = [];
    const exhausted = vi.fn();
    const renderer = createAnimalCrossingPreviewRenderer((m) => m, {
      createWorker: () => {
        const worker = new MockPreviewWorker(workers.length > 0);
        workers.push(worker);
        return worker;
      },
      retryDelayMs: 1,
      onStartupFailureExhausted: exhausted,
    });
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) };
    const preview = await renderer.preview(pixels, {} as never, 0, new AbortController().signal);
    expect(preview.selected).toBe(0);
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].posted[0].pixels).toBeDefined();
    expect(exhausted).not.toHaveBeenCalled();

    // Second preview reuses worker 2 without resending source pixels.
    await renderer.preview(pixels, {} as never, 1, new AbortController().signal);
    expect(workers).toHaveLength(2);
    expect(workers[1].posted[1].pixels).toBeUndefined();
    renderer.releasePreview(pixels);
    expect(workers[1].terminated).toBe(true);
  });

  it("reports exhausted startup failure once when all attempts fail to load", async () => {
    const workers: MockPreviewWorker[] = [];
    const exhausted = vi.fn();
    const renderer = createAnimalCrossingPreviewRenderer((m) => m, {
      createWorker: () => {
        const worker = new MockPreviewWorker(false);
        workers.push(worker);
        return worker;
      },
      retryDelayMs: 1,
      onStartupFailureExhausted: exhausted,
    });
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) };
    await expect(
      renderer.preview(pixels, {} as never, 0, new AbortController().signal),
    ).rejects.toThrow("Unable to generate preview.");
    expect(workers).toHaveLength(2);
    expect(exhausted).toHaveBeenCalledOnce();
  });
});
