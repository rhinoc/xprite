import { describe, expect, it } from "vitest";

import { assembleWebpAnimation } from "$/import-export/image/webp-export";
import { parseWebpAnimation, webpAnimationFrameData } from "$/import-export/image/webp-import";
import { encodeWebpLossless } from "$/import-export/image/webp-lossless";

/** Independent specification reader: canonical tree traversal rather than encoder code/reversal tables.
 * Covers untransformed VP8L streams, generic prefix-length runs and scan-line backward references. */
function decodeLiteralWebp(bytes: Uint8Array) {
  expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let chunkOffset = 12;
  while (String.fromCharCode(...bytes.subarray(chunkOffset, chunkOffset + 4)) !== "VP8L") {
    const length = view.getUint32(chunkOffset + 4, true);
    chunkOffset += 8 + length + (length & 1);
    if (chunkOffset >= bytes.length) throw new Error("No VP8L payload");
  }
  expect(bytes[chunkOffset + 8]).toBe(0x2f);
  let bit = (chunkOffset + 9) * 8;
  const read = (count: number) => {
    let value = 0;
    for (let index = 0; index < count; index++, bit++) {
      if (bit >= bytes.length * 8) throw new Error("Truncated VP8L test input");
      value |= ((bytes[bit >>> 3] >>> (bit & 7)) & 1) << index;
    }
    return value;
  };
  interface Node {
    value?: number;
    children?: [Node, Node];
  }
  const tree = (lengths: readonly number[]) => {
    const symbols = lengths
      .map((length, value) => ({ length, value }))
      .filter((entry) => entry.length);
    if (symbols.length === 1) return { value: symbols[0].value } as Node;
    expect(symbols.reduce((sum, entry) => sum + 2 ** -entry.length, 0)).toBe(1);
    const counts = Array.from({ length: 16 }, () => 0);
    for (const symbol of symbols) counts[symbol.length]++;
    const codes = Array.from({ length: 16 }, () => 0);
    for (let length = 1; length < codes.length; length++)
      codes[length] = (codes[length - 1] + counts[length - 1]) * 2;
    const root: Node = {};
    for (const { length, value } of symbols) {
      const code = codes[length]++;
      let node = root;
      for (let shift = length - 1; shift >= 0; shift--) {
        node.children ??= [{}, {}];
        node = node.children[(code >>> shift) & 1];
      }
      node.value = value;
    }
    return root;
  };
  const symbol = (root: Node) => {
    let node = root;
    while (node.value === undefined) {
      if (!node.children) throw new Error("Invalid VP8L prefix");
      node = node.children[read(1)];
    }
    return node.value;
  };
  const prefix = (size: number): Node => {
    const lengths = Array.from({ length: size }, () => 0);
    if (read(1)) {
      const count = read(1) + 1,
        bits = read(1) ? 8 : 1;
      lengths[read(bits)] = 1;
      if (count === 2) lengths[read(8)] = 1;
    } else {
      const count = read(4) + 4;
      const order = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
      const metaLengths = Array.from({ length: 19 }, () => 0);
      for (let index = 0; index < count; index++) metaLengths[order[index]] = read(3);
      const meta = tree(metaLengths);
      const limit = read(1) ? 2 + read(2 + 2 * read(3)) : size;
      expect(limit).toBeLessThanOrEqual(size);
      let previous = 8;
      for (let index = 0; index < limit;) {
        const value = symbol(meta);
        if (value < 16) {
          lengths[index++] = value;
          if (value) previous = value;
        } else {
          const repeat = value === 16 ? 3 + read(2) : value === 17 ? 3 + read(3) : 11 + read(7);
          for (let end = index + repeat; index < end; index++)
            lengths[index] = value === 16 ? previous : 0;
          expect(index).toBeLessThanOrEqual(limit);
        }
      }
    }
    return tree(lengths);
  };
  const width = read(14) + 1,
    height = read(14) + 1;
  read(1);
  expect(read(3)).toBe(0);
  expect(read(1)).toBe(0);
  expect(read(1)).toBe(0);
  expect(read(1)).toBe(0);
  const green = prefix(280),
    red = prefix(256),
    blue = prefix(256),
    alpha = prefix(256),
    distance = prefix(40);
  const integer = (code: number) =>
    code < 4 ? code + 1 : ((2 + (code & 1)) << ((code >>> 1) - 1)) + read((code >>> 1) - 1) + 1;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height;) {
    const value = symbol(green);
    if (value < 256) {
      data.set([symbol(red), value, symbol(blue), symbol(alpha)], pixel++ * 4);
    } else {
      const length = integer(value - 256);
      const plane = integer(symbol(distance));
      const offset = plane === 1 ? width : plane === 2 ? 1 : plane - 120;
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThanOrEqual(pixel);
      expect(pixel + length).toBeLessThanOrEqual(width * height);
      for (let end = pixel + length; pixel < end; pixel++)
        for (let channel = 0; channel < 4; channel++)
          data[pixel * 4 + channel] = data[(pixel - offset) * 4 + channel];
    }
  }
  return { width, height, data };
}

describe("WebP export", () => {
  it("preserves arbitrary straight RGBA, partial alpha and invisible colors without mutating input", () => {
    const image = {
      width: 4,
      height: 2,
      data: new Uint8ClampedArray([
        13, 25, 39, 0, 255, 120, 60, 64, 2, 34, 56, 255, 22, 44, 66, 128, 255, 0, 0, 255, 0, 255, 0,
        255, 0, 0, 255, 255, 13, 25, 39, 0,
      ]),
    };
    const before = image.data.slice();
    expect(decodeLiteralWebp(encodeWebpLossless(image))).toEqual(image);
    expect(image.data).toEqual(before);
  });
  it("handles constant channels and overlapping runs longer than the maximum copy length", () => {
    const data = new Uint8ClampedArray(9000 * 4);
    for (let index = 0; index < 9000; index++) data.set([55, 77, 99, 0], index * 4);
    const image = { width: 100, height: 90, data };
    const bytes = encodeWebpLossless(image);
    expect(bytes.length).toBeLessThan(1000);
    expect(decodeLiteralWebp(bytes)).toEqual(image);
    for (const values of [
      [0, 0, 0, 0],
      [255, 255, 255, 255],
      [1, 1, 1, 1],
    ]) {
      const single = { width: 1, height: 1, data: new Uint8ClampedArray(values) };
      expect(decodeLiteralWebp(encodeWebpLossless(single))).toEqual(single);
    }
  });
  it("stores every duration and play count and replaces whole frames to avoid alpha accumulation", () => {
    const first = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 128]) };
    const second = { width: 1, height: 1, data: new Uint8ClampedArray([7, 8, 9, 0]) };
    const bytes = assembleWebpAnimation(
      [
        { bytes: encodeWebpLossless(first), duration: 37 },
        { bytes: encodeWebpLossless(second), duration: 81 },
      ],
      1,
      1,
      3,
    );
    const animation = parseWebpAnimation(bytes)!;
    expect(animation.loopCount).toBe(3);
    expect(animation.frames.map((frame) => frame.durationMs)).toEqual([37, 81]);
    expect(animation.frames.every((frame) => frame.replace && !frame.disposeBackground)).toBe(true);
    expect(decodeLiteralWebp(webpAnimationFrameData(animation.frames[0]))).toEqual(first);
    expect(decodeLiteralWebp(webpAnimationFrameData(animation.frames[1]))).toEqual(second);
  });
  it("rejects overflow counts, mismatched dimensions, nested animations and invalid frames", () => {
    const bytes = encodeWebpLossless({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
    expect(() => assembleWebpAnimation([{ bytes, duration: 1 }], 1, 1, 65536)).toThrow(/65535/);
    expect(() => assembleWebpAnimation([{ bytes, duration: 1 }], 2, 1)).toThrow(/dimensions/);
    expect(() => assembleWebpAnimation([{ bytes, duration: 0 }], 1, 1)).toThrow(/duration/);
    const animation = assembleWebpAnimation([{ bytes, duration: 1 }], 1, 1);
    expect(() => assembleWebpAnimation([{ bytes: animation, duration: 1 }], 1, 1)).toThrow(/still/);
  });
});
