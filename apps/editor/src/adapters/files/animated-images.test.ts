import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeAnimatedImageSource } from "$/adapters/files/animated-images";

const { decodeImage, readImageAssetBlob } = vi.hoisted(() => ({
  decodeImage: vi.fn(),
  readImageAssetBlob: vi.fn(),
}));

vi.mock("$/adapters/files/images", () => ({ decodeImage, readImageAssetBlob }));

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];

function webpAnimationBlob(loopCount = 0) {
  const frame = (duration: number) => [
    65,
    78,
    77,
    70,
    30,
    0,
    0,
    0, // ANMF, 30-byte payload.
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    duration,
    0,
    0,
    2,
    86,
    80,
    56,
    76,
    5,
    0,
    0,
    0,
    47,
    0,
    0,
    0,
    0,
    0, // VP8L header; decoding is supplied by a mock.
  ];
  return new Blob(
    [
      new Uint8Array([
        82,
        73,
        70,
        70,
        112,
        0,
        0,
        0,
        87,
        69,
        66,
        80,
        86,
        80,
        56,
        88,
        10,
        0,
        0,
        0,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        65,
        78,
        73,
        77,
        6,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        loopCount & 255,
        loopCount >>> 8,
        ...frame(25),
        ...frame(50),
      ]),
    ],
    { type: "application/octet-stream" },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("browser animated image import", () => {
  it("retains play counts on the native WebP path and closes every decoded frame", async () => {
    const closeImage = vi.fn();
    const closeDecoder = vi.fn();
    class Decoder {
      static isTypeSupported = async () => true;
      tracks = { ready: Promise.resolve(), selectedTrack: { animated: true, frameCount: 2 } };
      completed = Promise.resolve();
      decode = async ({ frameIndex }: { frameIndex: number }) => ({
        complete: true,
        image: {
          displayWidth: 1,
          displayHeight: 1,
          copyTo: async (destination: Uint8ClampedArray) => {
            destination.set(frameIndex ? GREEN : RED);
          },
          close: closeImage,
        },
      });
      close = closeDecoder;
    }
    vi.stubGlobal("ImageDecoder", Decoder);
    const project = await decodeAnimatedImageSource(webpAnimationBlob(3), "animation.webp");
    expect(project?.timeline.loopCount).toBe(3);
    expect(closeImage).toHaveBeenCalledTimes(2);
    expect(closeDecoder).toHaveBeenCalledOnce();
    expect(decodeImage).not.toHaveBeenCalled();
  });
  it("uses still-WebP fallback without ImageDecoder and retains frames with exact container durations", async () => {
    vi.stubGlobal("ImageDecoder", undefined);
    decodeImage
      .mockResolvedValueOnce({ width: 1, height: 1, data: new Uint8ClampedArray(RED) })
      .mockResolvedValueOnce({ width: 1, height: 1, data: new Uint8ClampedArray(GREEN) });
    const project = await decodeAnimatedImageSource(webpAnimationBlob(3), "wrong-extension.bin");
    expect(project?.timeline.loopCount).toBe(3);
    expect(project?.timeline.frames.map((frame) => frame.duration)).toEqual([25, 50]);
    expect(Array.from(project!.timeline.frames[1].cels[0]!.pixels.data)).toEqual(GREEN);
    expect(decodeImage).toHaveBeenCalledTimes(2);
    expect((decodeImage.mock.calls[0][0] as Blob).type).toBe("image/webp");
  });

  it("closes native frames and decoder then falls back if native RGBA conversion is unavailable", async () => {
    const closeImage = vi.fn();
    const closeDecoder = vi.fn();
    class Decoder {
      static isTypeSupported = async () => true;
      tracks = { ready: Promise.resolve(), selectedTrack: { animated: true, frameCount: 2 } };
      completed = Promise.resolve();
      decode = async () => ({
        complete: true,
        image: {
          displayWidth: 1,
          displayHeight: 1,
          copyTo: async () => {
            throw new Error("RGBA unsupported");
          },
          close: closeImage,
        },
      });
      close = closeDecoder;
    }
    vi.stubGlobal("ImageDecoder", Decoder);
    decodeImage.mockResolvedValue({ width: 1, height: 1, data: new Uint8ClampedArray(RED) });
    const project = await decodeAnimatedImageSource(webpAnimationBlob(), "image.webp");
    expect(project?.timeline.frames).toHaveLength(2);
    expect(closeImage).toHaveBeenCalledOnce();
    expect(closeDecoder).toHaveBeenCalledOnce();
    expect(decodeImage).toHaveBeenCalledTimes(2);
  });

  it("reports failed WebP frame decoding instead of importing a single frame", async () => {
    vi.stubGlobal("ImageDecoder", undefined);
    decodeImage.mockRejectedValueOnce(new Error("still-WebP decoder unavailable"));
    await expect(decodeAnimatedImageSource(webpAnimationBlob(), "image.webp")).rejects.toThrow(
      /animated WebP frame.*still-WebP decoder unavailable/,
    );
  });

  it("leaves non-animation files on the ordinary image/project import path", async () => {
    expect(
      await decodeAnimatedImageSource(new Blob(["ordinary file bytes"]), "ordinary.png"),
    ).toBeNull();
    expect(decodeImage).not.toHaveBeenCalled();
    expect(
      await decodeAnimatedImageSource({ url: "/image.png", name: "image.png" }, "image.png"),
    ).toBeNull();
    expect(readImageAssetBlob).not.toHaveBeenCalled();
  });
});
