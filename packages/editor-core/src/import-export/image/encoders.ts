import { UINT8_MAX, UINT16_MAX, UINT16_VALUE_COUNT } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import type { ExportAnimationFrame } from "$/import-export/image/export-animation";
import { animationExportLoopCount, assertAnimationLoopCount } from "$/timeline/animation-loop";
import { crc32 } from "@xprite/bedrock/common/crc32";
import { joinBytes } from "@xprite/bedrock/common/join-bytes";

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const u32 = (n: number) => Uint8Array.of(n >>> 24, n >>> 16, n >>> 8, n);
const u16 = (n: number) => Uint8Array.of(n >>> 8, n);
function chunk(type: string, data: Uint8Array): Uint8Array {
  const payload = joinBytes([ascii(type), data]);
  return joinBytes([u32(data.length), payload, u32(crc32(payload))]);
}
/** Valid zlib/deflate stored blocks keep the core encoder platform-neutral.
 * Browser adapters may supply a compressor without altering APNG framing. */
export function storeDeflate(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [Uint8Array.of(0x78, 0x01)];
  let a = 1,
    b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  for (let offset = 0; offset < data.length; offset += UINT16_MAX) {
    const n = Math.min(UINT16_MAX, data.length - offset);
    blocks.push(
      Uint8Array.of(offset + n === data.length ? 1 : 0, n, n >>> 8, ~n, ~n >>> 8),
      data.subarray(offset, offset + n),
    );
  }
  blocks.push(u32((b << 16) | a));
  return joinBytes(blocks);
}
function validateFrames(frames: readonly ExportAnimationFrame[]) {
  if (!frames.length) throw new Error("No animation frames.");
  const { width, height } = frames[0].pixels;
  if (width < 1 || height < 1 || width > UINT16_MAX || height > UINT16_MAX)
    throw new RangeError("Animation dimensions are invalid.");
  for (const f of frames)
    if (
      f.pixels.width !== width ||
      f.pixels.height !== height ||
      f.pixels.data.length !== width * height * 4 ||
      !Number.isFinite(f.duration) ||
      f.duration < 1
    )
      throw new Error("Animation frames must have equal dimensions and positive durations.");
}
export function pngScanlines(frame: ExportAnimationFrame): Uint8Array {
  const p = frame.pixels,
    stride = p.width * 4,
    data = new Uint8Array((stride + 1) * p.height);
  for (let y = 0; y < p.height; y++)
    data.set(p.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return data;
}
/** APNG full-frame SOURCE composition and NONE disposal preserve exact RGBA,
 * including transitions from opaque to transparent pixels. */
export function encodeApng(
  frames: readonly ExportAnimationFrame[],
  loopCount = 0,
  compressed?: readonly Uint8Array[],
): Uint8Array {
  validateFrames(frames);
  assertAnimationLoopCount(loopCount);
  if (compressed && compressed.length !== frames.length)
    throw new Error("Missing APNG frame data.");
  const { width, height } = frames[0].pixels;
  const parts = [
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk("IHDR", joinBytes([u32(width), u32(height), Uint8Array.of(8, 6, 0, 0, 0)])),
    chunk("acTL", joinBytes([u32(frames.length), u32(loopCount)])),
  ];
  let sequence = 0;
  frames.forEach((frame, i) => {
    let numerator = Math.round(frame.duration),
      denominator = 1000;
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const divisor = gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
    if (numerator > UINT16_MAX) {
      numerator = Math.min(UINT16_MAX, Math.round(frame.duration / 1000));
      denominator = 1;
    }
    parts.push(
      chunk(
        "fcTL",
        joinBytes([
          u32(sequence++),
          u32(width),
          u32(height),
          u32(0),
          u32(0),
          u16(numerator),
          u16(denominator),
          Uint8Array.of(0, 0),
        ]),
      ),
    );
    const image = compressed?.[i] ?? storeDeflate(pngScanlines(frame));
    parts.push(chunk(i ? "fdAT" : "IDAT", i ? joinBytes([u32(sequence++), image]) : image));
  });
  parts.push(chunk("IEND", new Uint8Array()));
  return joinBytes(parts);
}
interface ColorCount {
  rgb: number[];
  count: number;
}
/** Exact colors first; weighted median-cut is only used when GIF's 255 opaque
 * colors cannot represent the source. Transparent index is isolated. */
function gifColors(frames: readonly ExportAnimationFrame[], palette?: readonly Rgba[]): number[][] {
  if (palette?.length) {
    const colors = palette
      .filter((c) => c[3] > 0)
      .slice(0, UINT8_MAX)
      .map((c) => [c[0], c[1], c[2]]);
    if (colors.length) return colors;
  }
  const exact = new Set<number>(),
    bins = new Map<number, ColorCount>();
  let overflow = false;
  for (const f of frames)
    for (let i = 0; i < f.pixels.data.length; i += 4) {
      const d = f.pixels.data;
      if (d[i + 3] === 0) continue;
      const color = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (!overflow) {
        exact.add(color);
        if (exact.size > UINT8_MAX) overflow = true;
      }
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3),
        bin = bins.get(key) ?? { rgb: [0, 0, 0], count: 0 };
      bin.count++;
      for (let a = 0; a < 3; a++) bin.rgb[a] += d[i + a];
      bins.set(key, bin);
    }
  if (!overflow) return [...exact].map((c) => [c >>> 16, (c >>> 8) & UINT8_MAX, c & UINT8_MAX]);
  const boxes: ColorCount[][] = [
    [...bins.values()].map((c) => ({ count: c.count, rgb: c.rgb.map((v) => v / c.count) })),
  ];
  while (boxes.length < UINT8_MAX) {
    let selected = -1,
      score = -1,
      axis = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let a = 0; a < 3; a++) {
        const values = box.map((c) => c.rgb[a]);
        const range = Math.max(...values) - Math.min(...values);
        const candidate = range * box.reduce((n, c) => n + c.count, 0);
        if (candidate > score) {
          selected = index;
          score = candidate;
          axis = a;
        }
      }
    });
    if (selected < 0) break;
    const box = boxes[selected].sort((a, b) => a.rgb[axis] - b.rgb[axis]);
    const half = box.reduce((n, c) => n + c.count, 0) / 2;
    let sum = 0,
      at = 0;
    while (at < box.length - 1 && sum < half) sum += box[at++].count;
    boxes.splice(selected, 1, box.slice(0, at), box.slice(at));
  }
  return boxes.map((box) => {
    const total = box.reduce((n, c) => n + c.count, 0);
    return [0, 1, 2].map((a) =>
      Math.round(box.reduce((n, c) => n + c.rgb[a] * c.count, 0) / total),
    );
  });
}
export interface GifEncodeOptions {
  loopCount?: number;
  interlaced?: boolean;
  palette?: readonly Rgba[];
  forTwitter?: boolean;
}
export function encodeGif(
  frames: readonly ExportAnimationFrame[],
  options: GifEncodeOptions = {},
): Uint8Array {
  validateFrames(frames);
  const loopCount = animationExportLoopCount(undefined, options);
  const { width, height } = frames[0].pixels;
  const paletteFor = (items: readonly ExportAnimationFrame[], palette?: readonly Rgba[]) => {
    const explicit = palette?.length ? palette.slice(0, 256) : undefined;
    const colors = explicit
      ? explicit.map((c) => [c[0], c[1], c[2]])
      : [[0, 0, 0], ...gifColors(items)];
    let transparent = explicit ? explicit.findIndex((c) => c[3] === 0) : 0;
    if (
      transparent < 0 &&
      items.some((f) => f.pixels.data.some((v, i) => i % 4 === 3 && v === 0))
    ) {
      if (colors.length < 256) {
        transparent = colors.length;
        colors.push([0, 0, 0]);
      } else {
        colors.splice(0, colors.length, [0, 0, 0], ...gifColors(items));
        transparent = 0;
      }
    }
    const table = new Uint8Array(768);
    colors.forEach((c, i) => table.set(c, i * 3));
    const lookup = new Map<number, number>();
    const index = (d: Uint8ClampedArray, at: number) => {
      if (d[at + 3] === 0) return transparent;
      const key = (d[at] << 16) | (d[at + 1] << 8) | d[at + 2];
      let value = lookup.get(key);
      if (value !== undefined) return value;
      let best = Infinity;
      value = transparent === 0 ? 1 : 0;
      colors.forEach((c, i) => {
        if (i === transparent) return;
        const distance = (c[0] - d[at]) ** 2 + (c[1] - d[at + 1]) ** 2 + (c[2] - d[at + 2]) ** 2;
        if (distance < best) {
          best = distance;
          value = i;
        }
      });
      if (lookup.size < UINT16_VALUE_COUNT) lookup.set(key, value);
      return value;
    };
    return { table, transparent, index };
  };
  const global = paletteFor(
    frames,
    options.palette ? (frames[0].palette ?? options.palette) : undefined,
  );
  const little = (n: number) => Uint8Array.of(n, n >>> 8);
  const parts = [
    ascii("GIF89a"),
    little(width),
    little(height),
    Uint8Array.of(0xf7, Math.max(0, global.transparent), 0),
    global.table,
  ];
  if (loopCount !== 1)
    parts.push(
      Uint8Array.of(0x21, UINT8_MAX, 11),
      ascii("NETSCAPE2.0"),
      Uint8Array.of(3, 1, ...little(loopCount === 0 ? 0 : loopCount - 1), 0),
    );
  for (const [frameIndex, frame] of frames.entries()) {
    const local = options.palette && frame.palette ? paletteFor([frame], frame.palette) : null;
    const { transparent, index } = local ?? global;
    let delay = Math.max(0, Math.min(UINT16_MAX, Math.floor(frame.duration / 10)));
    if (options.forTwitter) {
      if (frameIndex === frames.length - 1) delay = Math.floor(delay / 4);
      delay = Math.max(2, delay);
    }
    parts.push(
      Uint8Array.of(0x21, 0xf9, 4, 8 + (transparent >= 0 ? 1 : 0)),
      little(delay),
      Uint8Array.of(Math.max(0, transparent), 0),
      Uint8Array.of(0x2c),
      little(0),
      little(0),
      little(width),
      little(height),
      Uint8Array.of((options.interlaced ? 0x40 : 0) | (local ? 0x87 : 0)),
    );
    if (local) parts.push(local.table);
    const rows: number[] = [];
    if (options.interlaced) {
      for (const [start, step] of [
        [0, 8],
        [4, 8],
        [2, 4],
        [1, 2],
      ])
        for (let y = start; y < height; y += step) rows.push(y);
    } else for (let y = 0; y < height; y++) rows.push(y);
    // Clear the LZW dictionary before code width changes. This simple encoder
    // is deterministic, bounded-memory, and accepted by standard GIF decoders.
    const bytes: number[] = [];
    let bits = 0,
      bitCount = 0,
      symbols = 0;
    const code = (value: number) => {
      bits |= value << bitCount;
      bitCount += 9;
      while (bitCount >= 8) {
        bytes.push(bits & UINT8_MAX);
        bits >>>= 8;
        bitCount -= 8;
      }
    };
    code(256);
    for (const y of rows)
      for (let x = 0; x < width; x++) {
        if (symbols === 250) {
          code(256);
          symbols = 0;
        }
        code(index(frame.pixels.data, (y * width + x) * 4));
        symbols++;
      }
    code(257);
    if (bitCount) bytes.push(bits & UINT8_MAX);
    parts.push(Uint8Array.of(8));
    for (let at = 0; at < bytes.length; at += UINT8_MAX) {
      const block = bytes.slice(at, at + UINT8_MAX);
      parts.push(Uint8Array.of(block.length, ...block));
    }
    parts.push(Uint8Array.of(0));
  }
  parts.push(Uint8Array.of(0x3b));
  return joinBytes(parts);
}
