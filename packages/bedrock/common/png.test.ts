import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { crc32 } from "./crc32";
import { joinBytes } from "./join-bytes";
import { readPng } from "./png";

function makeChunk(name: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(name), 4);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function encodeScanlines(
  rawRows: readonly Uint8Array[],
  filters: readonly number[],
  bpp: number,
): Uint8Array {
  const stride = rawRows[0].length;
  const out = new Uint8Array((stride + 1) * rawRows.length);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < rawRows.length; y++) {
    const row = rawRows[y];
    const filter = filters[y % filters.length];
    const rowOffset = y * (stride + 1);
    out[rowOffset] = filter;
    for (let at = 0; at < stride; at++) {
      const left = at >= bpp ? row[at - bpp] : 0;
      const up = prev[at];
      const corner = at >= bpp ? prev[at - bpp] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >>> 1;
      else if (filter === 4) predicted = paeth(left, up, corner);
      out[rowOffset + 1 + at] = (row[at] - predicted) & 255;
    }
    prev = row;
  }
  return out;
}

function buildPng(options: {
  width: number;
  height: number;
  type: number;
  bits: number;
  interlace?: number;
  samples: Uint8Array;
  chunks?: Uint8Array[];
}): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, options.width);
  view.setUint32(4, options.height);
  ihdr.set([options.bits, options.type, 0, 0, options.interlace ?? 0], 8);
  return joinBytes([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    makeChunk("IHDR", ihdr),
    ...(options.chunks ?? []),
    makeChunk("IDAT", deflateSync(options.samples)),
    makeChunk("IEND", new Uint8Array()),
  ]);
}

function streamPushInSlices(
  pngBytes: Uint8Array,
  inflated: Uint8Array,
  chunkSizes: readonly number[],
): Uint8ClampedArray {
  const source = readPng(pngBytes)!;
  const decoder = source.createRowDecoder();
  expect(decoder).not.toBeNull();
  let offset = 0;
  let sizeIndex = 0;
  while (offset < inflated.length) {
    const size = chunkSizes[sizeIndex++ % chunkSizes.length];
    if (size === 0) {
      decoder!.push(new Uint8Array(0));
      continue;
    }
    const end = Math.min(inflated.length, offset + size);
    decoder!.push(inflated.subarray(offset, end));
    offset = end;
  }
  return decoder!.finish().data;
}

describe("streaming PNG row decoder", () => {
  it("decodes all color types, bit depths, filters (0..4), and tRNS identically across arbitrary chunk boundaries", () => {
    const palette = Uint8Array.of(
      10,
      20,
      30, // 0
      40,
      50,
      60, // 1
      70,
      80,
      90, // 2
      100,
      110,
      120, // 3
      130,
      140,
      150, // 4
      160,
      170,
      180, // 5
      190,
      200,
      210, // 6
      220,
      230,
      240, // 7
    );
    const allFilters = [0, 1, 2, 3, 4];

    const cases: Array<{
      label: string;
      width: number;
      height: number;
      type: number;
      bits: number;
      rawRows: Uint8Array[];
      chunks?: Uint8Array[];
      expected: number[];
    }> = [
      // Color type 0 (Grayscale), bit depths 1, 2, 4, 8, 16 + tRNS
      {
        label: "gray 1-bit + tRNS",
        width: 5,
        height: 5,
        type: 0,
        bits: 1,
        rawRows: [
          Uint8Array.of(0b10101000),
          Uint8Array.of(0b01010000),
          Uint8Array.of(0b11001000),
          Uint8Array.of(0b00110000),
          Uint8Array.of(0b11111000),
        ],
        chunks: [makeChunk("tRNS", Uint8Array.of(0, 0))],
        expected: [
          [1, 0, 1, 0, 1],
          [0, 1, 0, 1, 0],
          [1, 1, 0, 0, 1],
          [0, 0, 1, 1, 0],
          [1, 1, 1, 1, 1],
        ]
          .flat()
          .flatMap((bit) => (bit ? [255, 255, 255, 255] : [0, 0, 0, 0])),
      },
      {
        label: "gray 2-bit",
        width: 4,
        height: 5,
        type: 0,
        bits: 2,
        rawRows: Array.from({ length: 5 }, (_, y) =>
          Uint8Array.of(
            ((y & 3) << 6) | (((y + 1) & 3) << 4) | (((y + 2) & 3) << 2) | ((y + 3) & 3),
          ),
        ),
        expected: Array.from({ length: 5 }, (_, y) =>
          [0, 1, 2, 3].flatMap((x) => {
            const v = ((y + x) & 3) * 85;
            return [v, v, v, 255];
          }),
        ).flat(),
      },
      {
        label: "gray 4-bit",
        width: 3,
        height: 5,
        type: 0,
        bits: 4,
        rawRows: Array.from({ length: 5 }, (_, y) =>
          Uint8Array.of((((y * 2) & 15) << 4) | ((y * 2 + 1) & 15), ((y * 2 + 2) & 15) << 4),
        ),
        expected: Array.from({ length: 5 }, (_, y) =>
          [0, 1, 2].flatMap((x) => {
            const v = ((y * 2 + x) & 15) * 17;
            return [v, v, v, 255];
          }),
        ).flat(),
      },
      {
        label: "gray 8-bit + tRNS",
        width: 3,
        height: 5,
        type: 0,
        bits: 8,
        rawRows: Array.from({ length: 5 }, (_, y) => Uint8Array.of(10 + y, 42, 200 + y)),
        chunks: [makeChunk("tRNS", Uint8Array.of(0, 42))],
        expected: Array.from({ length: 5 }, (_, y) => [
          10 + y,
          10 + y,
          10 + y,
          255,
          42,
          42,
          42,
          0,
          200 + y,
          200 + y,
          200 + y,
          255,
        ]).flat(),
      },
      {
        label: "gray 16-bit + tRNS",
        width: 2,
        height: 5,
        type: 0,
        bits: 16,
        rawRows: Array.from({ length: 5 }, (_, y) => Uint8Array.of(0x12, 0x34, 0xab, y)),
        chunks: [makeChunk("tRNS", Uint8Array.of(0x12, 0x34))],
        expected: Array.from({ length: 5 }, () => [
          0x12, 0x12, 0x12, 0, 0xab, 0xab, 0xab, 255,
        ]).flat(),
      },
      // Color type 2 (RGB), bit depths 8 and 16, with and without tRNS
      {
        label: "rgb 8-bit opaque",
        width: 3,
        height: 5,
        type: 2,
        bits: 8,
        rawRows: Array.from({ length: 5 }, (_, y) =>
          Uint8Array.of(
            10 + y,
            20 + y,
            30 + y,
            100 + y,
            110 + y,
            120 + y,
            200 + y,
            210 + y,
            220 + y,
          ),
        ),
        expected: Array.from({ length: 5 }, (_, y) => [
          10 + y,
          20 + y,
          30 + y,
          255,
          100 + y,
          110 + y,
          120 + y,
          255,
          200 + y,
          210 + y,
          220 + y,
          255,
        ]).flat(),
      },
      {
        label: "rgb 16-bit + tRNS",
        width: 2,
        height: 5,
        type: 2,
        bits: 16,
        rawRows: Array.from({ length: 5 }, (_, y) =>
          Uint8Array.of(
            0x10,
            0x01,
            0x20,
            0x02,
            0x30,
            0x03,
            0x40 + y,
            0x99,
            0x50 + y,
            0x88,
            0x60 + y,
            0x77,
          ),
        ),
        chunks: [makeChunk("tRNS", Uint8Array.of(0x10, 0x01, 0x20, 0x02, 0x30, 0x03))],
        expected: Array.from({ length: 5 }, (_, y) => [
          0x10,
          0x20,
          0x30,
          0,
          0x40 + y,
          0x50 + y,
          0x60 + y,
          255,
        ]).flat(),
      },
      // Color type 3 (Indexed), bit depths 1, 2, 4, 8 + tRNS
      {
        label: "indexed 1-bit + tRNS",
        width: 2,
        height: 5,
        type: 3,
        bits: 1,
        rawRows: Array.from({ length: 5 }, (_, y) =>
          Uint8Array.of(y % 2 ? 0b10000000 : 0b01000000),
        ),
        chunks: [makeChunk("PLTE", palette), makeChunk("tRNS", Uint8Array.of(0, 128))],
        expected: Array.from({ length: 5 }, (_, y) =>
          y % 2 ? [40, 50, 60, 128, 10, 20, 30, 0] : [10, 20, 30, 0, 40, 50, 60, 128],
        ).flat(),
      },
      {
        label: "indexed 2-bit + tRNS",
        width: 4,
        height: 5,
        type: 3,
        bits: 2,
        rawRows: Array.from({ length: 5 }, () => Uint8Array.of(0b00011011)),
        chunks: [makeChunk("PLTE", palette), makeChunk("tRNS", Uint8Array.of(0, 64, 192))],
        expected: Array.from({ length: 5 }, () => [
          10, 20, 30, 0, 40, 50, 60, 64, 70, 80, 90, 192, 100, 110, 120, 255,
        ]).flat(),
      },
      {
        label: "indexed 4-bit + tRNS",
        width: 2,
        height: 5,
        type: 3,
        bits: 4,
        rawRows: Array.from({ length: 5 }, (_, y) => Uint8Array.of(((y & 7) << 4) | ((y + 3) & 7))),
        chunks: [makeChunk("PLTE", palette), makeChunk("tRNS", Uint8Array.of(10, 20, 30, 40))],
        expected: Array.from({ length: 5 }, (_, y) => {
          const i0 = y & 7;
          const i1 = (y + 3) & 7;
          const alpha = [10, 20, 30, 40];
          return [
            palette[i0 * 3],
            palette[i0 * 3 + 1],
            palette[i0 * 3 + 2],
            alpha[i0] ?? 255,
            palette[i1 * 3],
            palette[i1 * 3 + 1],
            palette[i1 * 3 + 2],
            alpha[i1] ?? 255,
          ];
        }).flat(),
      },
      {
        label: "indexed 8-bit + tRNS",
        width: 3,
        height: 5,
        type: 3,
        bits: 8,
        rawRows: Array.from({ length: 5 }, (_, y) => Uint8Array.of(y, (y + 1) & 7, (y + 2) & 7)),
        chunks: [makeChunk("PLTE", palette), makeChunk("tRNS", Uint8Array.of(0, 100))],
        expected: Array.from({ length: 5 }, (_, y) =>
          [y, (y + 1) & 7, (y + 2) & 7].flatMap((idx) => [
            palette[idx * 3],
            palette[idx * 3 + 1],
            palette[idx * 3 + 2],
            idx === 0 ? 0 : idx === 1 ? 100 : 255,
          ]),
        ).flat(),
      },
      // Color type 4 (Grayscale + Alpha), bit depths 8 and 16
      {
        label: "gray+alpha 8-bit",
        width: 2,
        height: 5,
        type: 4,
        bits: 8,
        rawRows: Array.from({ length: 5 }, (_, y) => Uint8Array.of(30 + y, 64, 180 + y, 250)),
        expected: Array.from({ length: 5 }, (_, y) => [
          30 + y,
          30 + y,
          30 + y,
          64,
          180 + y,
          180 + y,
          180 + y,
          250,
        ]).flat(),
      },
      {
        label: "gray+alpha 16-bit",
        width: 2,
        height: 5,
        type: 4,
        bits: 16,
        rawRows: Array.from({ length: 5 }, (_, y) =>
          Uint8Array.of(15 + y, 0xaa, 0x80, 0x55, 220 + y, 0x11, 0xff, 0x00),
        ),
        expected: Array.from({ length: 5 }, (_, y) => [
          15 + y,
          15 + y,
          15 + y,
          0x80,
          220 + y,
          220 + y,
          220 + y,
          0xff,
        ]).flat(),
      },
      // Color type 6 (RGBA), bit depths 8 and 16
      {
        label: "rgba 8-bit",
        width: 3,
        height: 5,
        type: 6,
        bits: 8,
        rawRows: Array.from({ length: 5 }, (_, y) =>
          Uint8Array.of(
            1 + y,
            2 + y,
            3 + y,
            0,
            40 + y,
            50 + y,
            60 + y,
            128,
            200 + y,
            210 + y,
            220 + y,
            255,
          ),
        ),
        expected: Array.from({ length: 5 }, (_, y) => [
          1 + y,
          2 + y,
          3 + y,
          0,
          40 + y,
          50 + y,
          60 + y,
          128,
          200 + y,
          210 + y,
          220 + y,
          255,
        ]).flat(),
      },
      {
        label: "rgba 16-bit",
        width: 2,
        height: 5,
        type: 6,
        bits: 16,
        rawRows: Array.from({ length: 5 }, (_, y) =>
          Uint8Array.of(
            10 + y,
            1,
            20 + y,
            2,
            30 + y,
            3,
            40 + y,
            4,
            100 + y,
            5,
            110 + y,
            6,
            120 + y,
            7,
            255,
            8,
          ),
        ),
        expected: Array.from({ length: 5 }, (_, y) => [
          10 + y,
          20 + y,
          30 + y,
          40 + y,
          100 + y,
          110 + y,
          120 + y,
          255,
        ]).flat(),
      },
    ];

    for (const testCase of cases) {
      const channels =
        testCase.type === 0 || testCase.type === 3
          ? 1
          : testCase.type === 2
            ? 3
            : testCase.type === 4
              ? 2
              : 4;
      const bpp = Math.max(1, Math.ceil((channels * testCase.bits) / 8));
      const samples = encodeScanlines(testCase.rawRows, allFilters, bpp);
      const pngBytes = buildPng({
        width: testCase.width,
        height: testCase.height,
        type: testCase.type,
        bits: testCase.bits,
        samples,
        chunks: testCase.chunks,
      });

      const source = readPng(pngBytes)!;
      expect(source.interlaced, testCase.label).toBe(false);
      expect(Array.from(source.decode(samples).data), `${testCase.label} decode`).toEqual(
        testCase.expected,
      );
      // Feed 1 byte at a time, empty chunks, and uneven chunk sizes across row boundaries.
      expect(
        Array.from(streamPushInSlices(pngBytes, samples, [1])),
        `${testCase.label} 1-byte chunks`,
      ).toEqual(testCase.expected);
      expect(
        Array.from(streamPushInSlices(pngBytes, samples, [0, 3, 7, 2, 11])),
        `${testCase.label} uneven chunks`,
      ).toEqual(testCase.expected);
    }
  });

  it("rejects truncated and oversized streams and returns null createRowDecoder for Adam7 interlaced PNGs", () => {
    const samples = Uint8Array.of(0, 10, 20, 30, 255, 0, 40, 50, 60, 255);
    const pngBytes = buildPng({ width: 1, height: 2, type: 6, bits: 8, samples });
    const source = readPng(pngBytes)!;

    // Truncated stream
    const shortDecoder = source.createRowDecoder()!;
    shortDecoder.push(samples.subarray(0, samples.length - 1));
    expect(() => shortDecoder.finish()).toThrow(/Incomplete PNG samples/);

    // Oversized stream
    const overDecoder = source.createRowDecoder()!;
    overDecoder.push(samples);
    expect(() => overDecoder.push(Uint8Array.of(0))).toThrow(/exceed the declared size/);

    // Adam7 interlaced PNG stays on decode() path
    const interlacedSamples = Uint8Array.of(0, 1, 2, 3, 255);
    const interlacedPng = buildPng({
      width: 1,
      height: 1,
      type: 6,
      bits: 8,
      interlace: 1,
      samples: interlacedSamples,
    });
    const interlacedSource = readPng(interlacedPng)!;
    expect(interlacedSource.interlaced).toBe(true);
    expect(interlacedSource.createRowDecoder()).toBeNull();
    expect(Array.from(interlacedSource.decode(interlacedSamples).data)).toEqual([1, 2, 3, 255]);
  });
});
