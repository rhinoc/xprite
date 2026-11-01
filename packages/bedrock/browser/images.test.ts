import { deflateSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { crc32 } from "$/common/crc32";
import { joinBytes } from "$/common/join-bytes";
import { decodeImageBlob, ImageDimensionError } from "$/images";

function chunk(name: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(name), 4);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}

function png(
  samples: number[],
  { width = 1, height = 1, type = 6, bits = 8, interlace = 0, chunks = [] as Uint8Array[] } = {},
): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([bits, type, 0, 0, interlace], 8);
  return joinBytes([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk("IHDR", header),
    ...chunks,
    chunk("IDAT", deflateSync(Uint8Array.from(samples))),
    chunk("IEND", new Uint8Array()),
  ]);
}

function blob(bytes: Uint8Array, type = "image/png"): Blob {
  return new Blob([new Uint8Array(bytes).buffer], { type });
}

afterEach(() => vi.unstubAllGlobals());

describe("PNG browser imports", () => {
  it("retains every source channel at all alpha levels without a canvas round trip", async () => {
    // Includes hidden RGB and translucent channels that premultiplication cannot round-trip.
    const pixels = Array.from({ length: 256 }, (_, alpha) => [17, 35, 71, alpha]).flat();
    const browserDecoder = vi.fn(() => {
      throw new Error("PNG must bypass the canvas decoder");
    });
    vi.stubGlobal("createImageBitmap", browserDecoder);
    const source = png([0, ...pixels], { width: 256 });
    // Detect the PNG signature even when the supplied MIME type is empty or incorrect.
    for (const mime of ["image/png", "", "application/octet-stream", "image/jpeg"]) {
      const image = await decodeImageBlob(blob(source, mime));
      expect([image.width, image.height]).toEqual([256, 1]);
      expect(Array.from(image.data)).toEqual(pixels);
    }
    expect(browserDecoder).not.toHaveBeenCalled();
  });

  it("expands packed palette samples and preserves tRNS alpha and working RGB", async () => {
    const source = png([0, 0b00011011], {
      width: 4,
      type: 3,
      bits: 2,
      chunks: [
        chunk("PLTE", Uint8Array.of(17, 35, 71, 3, 5, 7, 11, 13, 15, 19, 21, 23)),
        chunk("tRNS", Uint8Array.of(0, 128, 254)),
        chunk("gAMA", Uint8Array.of(0, 1, 134, 160)),
      ],
    });
    expect(Array.from((await decodeImageBlob(blob(source))).data)).toEqual([
      17, 35, 71, 0, 3, 5, 7, 128, 11, 13, 15, 254, 19, 21, 23, 255,
    ]);
  });

  it("reads grayscale, grayscale alpha, RGB transparency and 16-bit samples", async () => {
    const cases = [
      {
        source: png([0, 0b01000000], { bits: 1, type: 0, width: 2 }),
        expected: [0, 0, 0, 255, 255, 255, 255, 255],
      },
      { source: png([0, 17, 128], { type: 4 }), expected: [17, 17, 17, 128] },
      {
        source: png([0, 17, 35, 71], {
          type: 2,
          chunks: [chunk("tRNS", Uint8Array.of(0, 17, 0, 35, 0, 71))],
        }),
        expected: [17, 35, 71, 0],
      },
      { source: png([0, 17, 1, 35, 2, 71, 3, 128, 4], { bits: 16 }), expected: [17, 35, 71, 128] },
    ];
    for (const { source, expected } of cases)
      expect(Array.from((await decodeImageBlob(blob(source))).data)).toEqual(expected);
  });

  it("reconstructs Sub, Up, Average and Paeth rows", async () => {
    // Two RGB pixels per row; filter predictors refer to already reconstructed bytes.
    const source = png(
      [
        1, 10, 20, 30, 30, 30, 30, 2, 1, 2, 3, 4, 5, 6, 3, 5, 9, 13, 17, 18, 19, 4, 1, 2, 3, 4, 5,
        6,
      ],
      { width: 2, height: 4, type: 2 },
    );
    expect(Array.from((await decodeImageBlob(blob(source))).data)).toEqual([
      10, 20, 30, 255, 40, 50, 60, 255, 11, 22, 33, 255, 44, 55, 66, 255, 10, 20, 29, 255, 44, 55,
      66, 255, 11, 22, 32, 255, 48, 60, 72, 255,
    ]);
  });

  it("decodes all seven Adam7 passes, including empty passes in small images", async () => {
    const values = [
      0,
      1,
      2,
      3,
      128, // (0,0), pass 1
      0,
      5,
      6,
      7,
      128, // (2,0), pass 4
      0,
      13,
      14,
      15,
      128,
      17,
      18,
      19,
      128, // (0,2), (2,2), pass 5
      0,
      9,
      10,
      11,
      128, // (1,0), pass 6
      0,
      21,
      22,
      23,
      128, // (1,2), pass 6
      0,
      25,
      26,
      27,
      128,
      29,
      30,
      31,
      128,
      33,
      34,
      35,
      128, // row 1, pass 7
    ];
    const image = await decodeImageBlob(blob(png(values, { width: 3, height: 3, interlace: 1 })));
    expect(Array.from(image.data)).toEqual([
      1, 2, 3, 128, 9, 10, 11, 128, 5, 6, 7, 128, 25, 26, 27, 128, 29, 30, 31, 128, 33, 34, 35, 128,
      13, 14, 15, 128, 21, 22, 23, 128, 17, 18, 19, 128,
    ]);
  });

  it("checks all dimension limits before decompressing or allocating image pixels", async () => {
    const source = png([], { width: 10, height: 20 });
    for (const options of [
      { maxDimension: 19 },
      { maxWidth: 9 },
      { maxHeight: 19 },
      { maxPixels: 199 },
    ])
      await expect(decodeImageBlob(blob(source), options)).rejects.toBeInstanceOf(
        ImageDimensionError,
      );
    await expect(decodeImageBlob(blob(source), { maxPixels: 0 })).rejects.toThrow(RangeError);
  });

  it("rejects broken PNGs and short or oversized inflation without falling back to canvas", async () => {
    const decoder = vi.fn();
    vi.stubGlobal("createImageBitmap", decoder);
    const broken = png([0, 17, 35, 71, 128]);
    broken[broken.length - 1] ^= 1;
    const cases = [
      broken,
      broken.subarray(0, 12),
      png([0, 17, 35, 71]),
      png([0, 17, 35, 71, 128, 0]),
      png([5, 17, 35, 71, 128]),
    ];
    for (const source of cases) await expect(decodeImageBlob(blob(source))).rejects.toThrow();
    expect(decoder).not.toHaveBeenCalled();
  });

  it("continues to use browser decoding and release bitmaps for other formats", async () => {
    const data = Uint8ClampedArray.of(17, 35, 71, 128);
    const close = vi.fn();
    const decoder = vi.fn(async () => ({ width: 1, height: 1, close }));
    vi.stubGlobal("createImageBitmap", decoder);
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { drawImage() {}, getImageData: () => ({ data }) };
        }
      },
    );
    const source = new Blob(["not a PNG"], { type: "image/jpeg" });
    expect((await decodeImageBlob(source)).data).toEqual(data);
    expect(decoder).toHaveBeenCalledWith(source);
    expect(close).toHaveBeenCalledOnce();
  });
});
