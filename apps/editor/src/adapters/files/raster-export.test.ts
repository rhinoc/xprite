import jpeg from "jpeg-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBrowserRasterExportPort } from "$/adapters/files/raster-export";
import { decodeImageBlob } from "@xprite/bedrock/browser/images";
import { decodeGifAnimation, parseJpegMatte } from "@xprite/editor-core/import-export";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser raster export port", () => {
  it("streams PNG and wide/fallback JPEG without touching canvas APIs", async () => {
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("document", undefined);

    const port = createBrowserRasterExportPort();
    const pixels = {
      width: 4,
      height: 2,
      data: new Uint8ClampedArray([
        200, 50, 40, 255, 200, 50, 40, 255, 20, 120, 220, 128, 0, 0, 0, 0, 200, 50, 40, 255, 200,
        50, 40, 255, 20, 120, 220, 128, 0, 0, 0, 0,
      ]),
    };

    const pngBlob = await port.encodePngBuffer(pixels);
    expect(pngBlob.type).toBe("image/png");
    const decodedPng = await decodeImageBlob(pngBlob);
    expect(decodedPng.data).toEqual(pixels.data);

    // Falls back seamlessly to portable JPEG even when native canvas JPEG is unavailable.
    const jpegBlob = await port.encodeJpegPlan(
      {
        source: pixels,
        bounds: { x: 0, y: 0, width: 4, height: 2 },
        width: 8,
        height: 4,
        jpegMatte: parseJpegMatte("#ffffff"),
      },
      92,
    );
    expect(jpegBlob.type).toBe("image/jpeg");
    const decodedJpeg = jpeg.decode(new Uint8Array(await jpegBlob.arrayBuffer()), {
      useTArray: true,
    });
    expect([decodedJpeg.width, decodedJpeg.height]).toEqual([8, 4]);
    // Transparent pixel on the far right should be blended onto #ffffff matte.
    const rightOffset = 7 * 4;
    expect(decodedJpeg.data[rightOffset]).toBeGreaterThan(240);
    expect(decodedJpeg.data[rightOffset + 1]).toBeGreaterThan(240);
    expect(decodedJpeg.data[rightOffset + 2]).toBeGreaterThan(240);
  });

  it("transfers source buffers to workers only when transfer is requested", async () => {
    const transfers: Transferable[][] = [];
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: { data: unknown }) => void) | null = null;
        onerror = null;
        onmessageerror = null;
        terminate = vi.fn();
        postMessage(_request: unknown, transfer?: Transferable[]) {
          transfers.push(transfer ?? []);
          queueMicrotask(() => {
            this.onmessage?.({ data: { ok: true, blob: new Blob(["ok"], { type: "image/png" }) } });
          });
        }
      },
    );

    const port = createBrowserRasterExportPort();
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) };
    await port.encodePngBuffer(pixels, { transfer: false });
    await port.encodePngBuffer(pixels, { transfer: true });
    expect(transfers[0]).toEqual([]);
    expect(transfers[1]).toEqual([pixels.data.buffer]);
  });

  it("streams upscaled GIF animations without Worker and deduplicates transferred Worker buffers", async () => {
    vi.stubGlobal("Worker", undefined);
    const port = createBrowserRasterExportPort();
    const frameA = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]),
    };
    const frameB = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 255, 255]),
    };
    const planA = {
      source: frameA,
      bounds: { x: 0, y: 0, width: 2, height: 1 },
      width: 4,
      height: 2,
    };
    const planB = {
      source: frameB,
      bounds: { x: 0, y: 0, width: 2, height: 1 },
      width: 4,
      height: 2,
    };

    const gifBlob = await port.encodeGifSources(
      [
        { plan: planA, duration: 80, sourceFrame: 0 },
        { plan: planB, duration: 120, sourceFrame: 1 },
        { plan: planA, duration: 80, sourceFrame: 0 },
      ],
      { loopCount: 0 },
    );
    expect(gifBlob.type).toBe("image/gif");
    const decoded = decodeGifAnimation(new Uint8Array(await gifBlob.arrayBuffer()))!;
    expect([decoded.width, decoded.height]).toEqual([4, 2]);
    expect(decoded.frames.map((frame) => frame.durationMs)).toEqual([80, 120, 80]);
    expect(decoded.frames[0].pixels.data).toEqual(decoded.frames[2].pixels.data);

    const staticGifBlob = await port.encodeGifBuffer(frameB, { loopCount: 1, duration: 100 });
    expect(staticGifBlob.type).toBe("image/gif");
    const decodedStatic = decodeGifAnimation(new Uint8Array(await staticGifBlob.arrayBuffer()), {
      includeStatic: true,
    })!;
    expect(decodedStatic.frames[0].pixels.data).toEqual(frameB.data);

    // Verify Worker GIF offload deduplicates shared source buffers and transferables.
    const postedRequests: unknown[] = [];
    const transfers: Transferable[][] = [];
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: { data: unknown }) => void) | null = null;
        onerror = null;
        onmessageerror = null;
        terminate = vi.fn();
        postMessage(request: unknown, transfer?: Transferable[]) {
          postedRequests.push(request);
          transfers.push(transfer ?? []);
          queueMicrotask(() => {
            this.onmessage?.({
              data: { ok: true, blob: new Blob(["GIF89a"], { type: "image/gif" }) },
            });
          });
        }
      },
    );

    const workerPort = createBrowserRasterExportPort();
    await workerPort.encodeGifSources(
      [
        { plan: planA, duration: 80, sourceFrame: 0 },
        { plan: planB, duration: 120, sourceFrame: 1 },
        { plan: planA, duration: 80, sourceFrame: 0 },
      ],
      { loopCount: 0, transfer: true },
    );
    const workerRequest = postedRequests[0] as {
      format: string;
      sources: unknown[];
      frames: Array<{ sourceIndex: number }>;
    };
    expect(workerRequest.format).toBe("gif");
    expect(workerRequest.sources).toHaveLength(2);
    expect(workerRequest.frames.map((frame) => frame.sourceIndex)).toEqual([0, 1, 0]);
    expect(transfers[0]).toEqual([frameA.data.buffer, frameB.data.buffer]);
  });
});
