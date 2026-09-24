import { afterEach, describe, expect, it, vi } from "vitest";

import { createBrowserWebpExportPort } from "$/adapters/files/webp-export";
import {
  assembleWebpAnimation,
  encodeWebpLossless,
  parseWebpAnimation,
  WebpCompression,
} from "@xprite/editor-core/import-export";

const { encodeImageBlob } = vi.hoisted(() => ({ encodeImageBlob: vi.fn() }));
vi.mock("@xprite/bedrock/browser/images", () => ({
  encodeImageBlob,
  ImageEncodingFormat: { Webp: "image/webp" },
}));
const frame = (red: number, duration = 50) => ({
  sourceFrame: 0,
  duration,
  pixels: { width: 1, height: 1, data: new Uint8ClampedArray([red, 0, 0, 128]) },
});
const options = {
  compression: WebpCompression.Lossless,
  qualityPercent: 90,
  animated: true,
  loopCount: 3,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("browser WebP export", () => {
  it("transfers unique owned buffers, returns real WebP data and terminates its worker", async () => {
    const first = frame(255),
      second = frame(100);
    const result = assembleWebpAnimation(
      [
        { bytes: encodeWebpLossless(first.pixels), duration: 50 },
        { bytes: encodeWebpLossless(second.pixels), duration: 50 },
      ],
      1,
      1,
      3,
    );
    const terminated = vi.fn(),
      posted = vi.fn();
    class Worker {
      onmessage?: (event: { data: unknown }) => void;
      terminate = terminated;
      postMessage(message: unknown, transfer: unknown[]) {
        posted(message, transfer);
        queueMicrotask(() => this.onmessage?.({ data: { ok: true, data: result.buffer } }));
      }
    }
    vi.stubGlobal("Worker", Worker);
    const port = createBrowserWebpExportPort();
    expect(port.supportsLossless()).toBe(true);
    const blob = await port.encode([first, second, first], options);
    expect(blob.type).toBe("image/webp");
    expect(posted.mock.calls[0][1]).toHaveLength(2);
    expect(parseWebpAnimation(new Uint8Array(await blob.arrayBuffer()))?.loopCount).toBe(3);
    expect(terminated).toHaveBeenCalledOnce();
  });
  it("terminates the worker on encoder failure and reports unsupported lossless contexts", async () => {
    const terminated = vi.fn();
    class Worker {
      onmessage?: (event: { data: unknown }) => void;
      terminate = terminated;
      postMessage() {
        queueMicrotask(() =>
          this.onmessage?.({ data: { ok: false, message: "Bad image dimensions" } }),
        );
      }
    }
    vi.stubGlobal("Worker", Worker);
    await expect(createBrowserWebpExportPort().encode([frame(1)], options)).rejects.toThrow(
      "Bad image dimensions",
    );
    expect(terminated).toHaveBeenCalledOnce();
    vi.stubGlobal("Worker", undefined);
    const port = createBrowserWebpExportPort();
    expect(port.supportsLossless()).toBe(false);
    await expect(port.encode([frame(1)], options)).rejects.toThrow(/cannot run/);
  });
  it("encodes every lossy frame with the requested quality before muxing animation metadata", async () => {
    encodeImageBlob.mockImplementation(
      async (pixels) =>
        new Blob([encodeWebpLossless(pixels).buffer as ArrayBuffer], { type: "image/webp" }),
    );
    const blob = await createBrowserWebpExportPort().encode([frame(255, 37), frame(20, 81)], {
      ...options,
      compression: WebpCompression.Lossy,
      qualityPercent: 42,
    });
    expect(encodeImageBlob).toHaveBeenCalledTimes(2);
    expect(encodeImageBlob.mock.calls.every((call) => call[2] === 0.42)).toBe(true);
    const animation = parseWebpAnimation(new Uint8Array(await blob.arrayBuffer()))!;
    expect(animation.loopCount).toBe(3);
    expect(animation.frames.map((frame) => frame.durationMs)).toEqual([37, 81]);
    encodeImageBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    await expect(
      createBrowserWebpExportPort().encode([frame(1)], {
        ...options,
        animated: false,
        compression: WebpCompression.Lossy,
      }),
    ).rejects.toThrow(/did not produce WebP/);
  });
});
