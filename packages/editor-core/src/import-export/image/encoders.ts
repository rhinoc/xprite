import { UINT8_MAX, UINT16_MAX, UINT16_VALUE_COUNT } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import type { ExportAnimationFrame } from "$/import-export/image/export-animation";
import { animationExportLoopCount, assertAnimationLoopCount } from "$/timeline/animation-loop";
import { crc32, crc32Parts } from "@xprite/bedrock/common/crc32";
import { joinBytes } from "@xprite/bedrock/common/join-bytes";
import {
  PNG_SIGNATURE,
  createPixelBufferRowSource,
  pngChunkParts,
  pngEndChunk,
  pngHeaderChunk,
  type RgbaRowSource,
} from "@xprite/bedrock/common/png-encode";

const ascii = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(s, (c) => c.charCodeAt(0));
const u32 = (n: number): Uint8Array<ArrayBuffer> => Uint8Array.of(n >>> 24, n >>> 16, n >>> 8, n);
const u16 = (n: number): Uint8Array<ArrayBuffer> => Uint8Array.of(n >>> 8, n);
function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const payload = joinBytes([ascii(type), data]);
  return joinBytes([u32(data.length), payload, u32(crc32(payload))]) as Uint8Array<ArrayBuffer>;
}
function chunkFromParts(
  type: string,
  payloadParts: readonly Uint8Array<ArrayBuffer>[],
): Uint8Array<ArrayBuffer>[] {
  const typeBytes = ascii(type);
  const length = payloadParts.reduce((total, part) => total + part.byteLength, 0);
  const header = new Uint8Array(8);
  header.set(u32(length), 0);
  header.set(typeBytes, 4);
  const crc = u32(crc32Parts([typeBytes, ...payloadParts]));
  return [header, ...payloadParts, crc];
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
export interface CompressedApngFrame {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly compressed: readonly Uint8Array<ArrayBuffer>[];
}

/** Assemble APNG Blob parts directly from pre-compressed chunks without copying frame payloads. */
export function encodeApngParts(
  frames: readonly CompressedApngFrame[],
  loopCount = 0,
): Uint8Array<ArrayBuffer>[] {
  if (!frames.length) throw new Error("No animation frames.");
  const { width, height } = frames[0];
  if (width < 1 || height < 1 || width > UINT16_MAX || height > UINT16_MAX)
    throw new RangeError("Animation dimensions are invalid.");
  for (const frame of frames) {
    if (
      frame.width !== width ||
      frame.height !== height ||
      !Number.isFinite(frame.duration) ||
      frame.duration < 1 ||
      !frame.compressed.length
    )
      throw new Error("Animation frames must have equal dimensions and positive durations.");
  }
  assertAnimationLoopCount(loopCount);
  const parts: Uint8Array<ArrayBuffer>[] = [
    PNG_SIGNATURE,
    pngHeaderChunk(width, height),
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
    for (const payload of frame.compressed) {
      if (!payload.byteLength) continue;
      if (i === 0) parts.push(...pngChunkParts("IDAT", payload));
      else parts.push(...chunkFromParts("fdAT", [u32(sequence++), payload]));
    }
  });
  parts.push(pngEndChunk());
  return parts;
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
  const prepared: CompressedApngFrame[] = frames.map((frame, i) => {
    const raw = compressed?.[i] ?? storeDeflate(pngScanlines(frame));
    const owned: Uint8Array<ArrayBuffer> =
      raw.buffer instanceof ArrayBuffer ? (raw as Uint8Array<ArrayBuffer>) : new Uint8Array(raw);
    return {
      width: frame.pixels.width,
      height: frame.pixels.height,
      duration: frame.duration,
      compressed: [owned],
    };
  });
  return joinBytes(encodeApngParts(prepared, loopCount));
}
const RGBA_CHANNELS = 4;
const GIF_CHUNK_BYTES = 65_536;
const GIF_COLOR_TABLE_ENTRIES = 256;
const GIF_COLOR_TABLE_BYTES = 768;
const GIF_MIN_CODE_SIZE = 8;
const GIF_LZW_CLEAR_CODE = 256;
const GIF_LZW_EOI_CODE = 257;
const GIF_LZW_FIRST_FREE_CODE = 258;
const GIF_LZW_INITIAL_BITS = 9;
const GIF_LZW_MAX_BITS = 12;
const GIF_LZW_MAX_TABLE_SIZE = 4096;
const GIF_LZW_HASH_SIZE = 8192;
const GIF_LZW_HASH_MASK = GIF_LZW_HASH_SIZE - 1;
const GIF_LZW_HASH_MULTIPLIER = 2_654_435_761;
const GIF_LZW_EMPTY_SLOT = -1;
const GIF_SUB_BLOCK_MAX_BYTES = 255;
const GIF_INTERLACE_PASSES = [
  [0, 8],
  [4, 8],
  [2, 4],
  [1, 2],
] as const;

interface ColorCount {
  r: number;
  g: number;
  b: number;
  count: number;
}

interface ColorBox {
  readonly items: ColorCount[];
  readonly total: number;
  readonly axis: 0 | 1 | 2;
  readonly score: number;
}

function createColorBox(items: ColorCount[]): ColorBox {
  let minR = Infinity;
  let maxR = -Infinity;
  let minG = Infinity;
  let maxG = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  let total = 0;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    total += item.count;
    if (item.r < minR) minR = item.r;
    if (item.r > maxR) maxR = item.r;
    if (item.g < minG) minG = item.g;
    if (item.g > maxG) maxG = item.g;
    if (item.b < minB) minB = item.b;
    if (item.b > maxB) maxB = item.b;
  }
  if (items.length < 2) return { items, total, axis: 0, score: -1 };
  const rangeR = maxR - minR;
  const rangeG = maxG - minG;
  const rangeB = maxB - minB;
  let axis: 0 | 1 | 2 = 0;
  let bestRange = rangeR;
  if (rangeG > bestRange) {
    axis = 1;
    bestRange = rangeG;
  }
  if (rangeB > bestRange) {
    axis = 2;
    bestRange = rangeB;
  }
  return { items, total, axis, score: bestRange * total };
}

function addQuantizedBin(
  bins: Map<number, ColorCount>,
  r: number,
  g: number,
  b: number,
  count: number,
): void {
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  const existing = bins.get(key);
  if (existing) {
    existing.count += count;
    existing.r += r * count;
    existing.g += g * count;
    existing.b += b * count;
  } else {
    bins.set(key, { r: r * count, g: g * count, b: b * count, count });
  }
}

/** Exact colors first; weighted median-cut is only used when GIF's 255 opaque
 * colors cannot represent the source. Transparent index is isolated. */
function gifColors(
  frames: readonly GifRowSourceFrame[],
  scratchRow: Uint8Array,
  palette?: readonly Rgba[],
): number[][] {
  if (palette?.length) {
    const colors = palette
      .filter((c) => c[3] > 0)
      .slice(0, UINT8_MAX)
      .map((c) => [c[0], c[1], c[2]]);
    if (colors.length) return colors;
  }
  const exact = new Map<number, number>();
  const bins = new Map<number, ColorCount>();
  let overflow = false;
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const { rowSource } = frames[frameIndex];
    const rowBytes = rowSource.width * RGBA_CHANNELS;
    for (let y = 0; y < rowSource.height; y++) {
      rowSource.fillRow(y, scratchRow);
      for (let i = 0; i < rowBytes; i += RGBA_CHANNELS) {
        if (scratchRow[i + 3] === 0) continue;
        const r = scratchRow[i];
        const g = scratchRow[i + 1];
        const b = scratchRow[i + 2];
        if (!overflow) {
          const color = (r << 16) | (g << 8) | b;
          const prevCount = exact.get(color);
          if (prevCount !== undefined) {
            exact.set(color, prevCount + 1);
            continue;
          }
          if (exact.size < UINT8_MAX) {
            exact.set(color, 1);
            continue;
          }
          overflow = true;
          for (const [exactColor, count] of exact) {
            addQuantizedBin(
              bins,
              exactColor >>> 16,
              (exactColor >>> 8) & UINT8_MAX,
              exactColor & UINT8_MAX,
              count,
            );
          }
          exact.clear();
        }
        addQuantizedBin(bins, r, g, b, 1);
      }
    }
  }
  if (!overflow) {
    const result: number[][] = [];
    for (const color of exact.keys()) {
      result.push([color >>> 16, (color >>> 8) & UINT8_MAX, color & UINT8_MAX]);
    }
    return result;
  }
  const initialItems: ColorCount[] = [];
  for (const bin of bins.values()) {
    initialItems.push({
      r: bin.r / bin.count,
      g: bin.g / bin.count,
      b: bin.b / bin.count,
      count: bin.count,
    });
  }
  const boxes: ColorBox[] = [createColorBox(initialItems)];
  while (boxes.length < UINT8_MAX) {
    let selected = -1;
    let bestScore = -1;
    for (let index = 0; index < boxes.length; index++) {
      if (boxes[index].score > bestScore) {
        bestScore = boxes[index].score;
        selected = index;
      }
    }
    if (selected < 0) break;
    const box = boxes[selected];
    const items = box.items;
    if (box.axis === 0) items.sort((a, b) => a.r - b.r);
    else if (box.axis === 1) items.sort((a, b) => a.g - b.g);
    else items.sort((a, b) => a.b - b.b);
    const half = box.total / 2;
    let sum = 0;
    let splitAt = 0;
    while (splitAt < items.length - 1 && sum < half) sum += items[splitAt++].count;
    boxes.splice(
      selected,
      1,
      createColorBox(items.slice(0, splitAt)),
      createColorBox(items.slice(splitAt)),
    );
  }
  return boxes.map((box) => {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let index = 0; index < box.items.length; index++) {
      const item = box.items[index];
      sumR += item.r * item.count;
      sumG += item.g * item.count;
      sumB += item.b * item.count;
    }
    return [
      Math.round(sumR / box.total),
      Math.round(sumG / box.total),
      Math.round(sumB / box.total),
    ];
  });
}

// Fixed 64 KiB chunked writer avoids JS array growth spikes and full-file reassembly copies.
class ChunkedGifWriter {
  private readonly chunks: Uint8Array<ArrayBuffer>[] = [];
  private current = new Uint8Array(GIF_CHUNK_BYTES);
  private offset = 0;

  writeByte(value: number): void {
    if (this.offset === this.current.byteLength) {
      this.chunks.push(this.current);
      this.current = new Uint8Array(GIF_CHUNK_BYTES);
      this.offset = 0;
    }
    this.current[this.offset++] = value & UINT8_MAX;
  }

  writeUint16LE(value: number): void {
    this.writeByte(value);
    this.writeByte(value >>> 8);
  }

  writeAscii(text: string): void {
    for (let index = 0; index < text.length; index++) {
      this.writeByte(text.charCodeAt(index));
    }
  }

  writeBytes(bytes: Uint8Array): void {
    let readOffset = 0;
    while (readOffset < bytes.byteLength) {
      const space = this.current.byteLength - this.offset;
      if (space === 0) {
        this.chunks.push(this.current);
        this.current = new Uint8Array(GIF_CHUNK_BYTES);
        this.offset = 0;
        continue;
      }
      const copyLength = Math.min(space, bytes.byteLength - readOffset);
      this.current.set(bytes.subarray(readOffset, readOffset + copyLength), this.offset);
      this.offset += copyLength;
      readOffset += copyLength;
    }
  }

  finish(): Uint8Array<ArrayBuffer>[] {
    if (this.offset > 0) {
      this.chunks.push(this.current.subarray(0, this.offset));
      this.offset = 0;
    }
    return this.chunks;
  }
}

function hasTransparentPixel(
  frames: readonly GifRowSourceFrame[],
  scratchRow: Uint8Array,
): boolean {
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const { rowSource } = frames[frameIndex];
    const rowBytes = rowSource.width * RGBA_CHANNELS;
    for (let y = 0; y < rowSource.height; y++) {
      rowSource.fillRow(y, scratchRow);
      for (let offset = 3; offset < rowBytes; offset += RGBA_CHANNELS) {
        if (scratchRow[offset] === 0) return true;
      }
    }
  }
  return false;
}

export interface GifRowSourceFrame {
  readonly rowSource: RgbaRowSource;
  readonly duration: number;
  readonly palette?: readonly Rgba[];
}

export interface GifEncodeOptions {
  loopCount?: number;
  interlaced?: boolean;
  /**
   * Preserve palette order (Aseprite's GIF option). When set, the GIF color table is the first
   * frame's `palette` (or this one), and each frame's own `palette` becomes its local table.
   * When unset, frame palettes are ignored on purpose and the table is built from the pixels,
   * with index 0 reserved for transparency. Callers that need exact indices must set it.
   */
  palette?: readonly Rgba[];
  forTwitter?: boolean;
}

function validateGifRowFrames(frames: readonly GifRowSourceFrame[]): {
  width: number;
  height: number;
} {
  if (!frames.length) throw new Error("No animation frames.");
  const { width, height } = frames[0].rowSource;
  if (width < 1 || height < 1 || width > UINT16_MAX || height > UINT16_MAX)
    throw new RangeError("Animation dimensions are invalid.");
  for (const frame of frames) {
    if (
      frame.rowSource.width !== width ||
      frame.rowSource.height !== height ||
      !Number.isFinite(frame.duration) ||
      frame.duration < 1
    ) {
      throw new Error("Animation frames must have equal dimensions and positive durations.");
    }
  }
  return { width, height };
}

/** Stream-encode GIF89a into 64 KiB chunks using variable-width 9->12-bit LZW compression. */
export function encodeGifRowSources(
  frames: readonly GifRowSourceFrame[],
  options: GifEncodeOptions = {},
): Uint8Array<ArrayBuffer>[] {
  const { width, height } = validateGifRowFrames(frames);
  const loopCount = animationExportLoopCount(undefined, options);
  const scratchRow = new Uint8Array(width * RGBA_CHANNELS);
  const paletteFor = (items: readonly GifRowSourceFrame[], palette?: readonly Rgba[]) => {
    const explicit = palette?.length ? palette.slice(0, GIF_COLOR_TABLE_ENTRIES) : undefined;
    const colors = explicit
      ? explicit.map((c) => [c[0], c[1], c[2]])
      : [[0, 0, 0], ...gifColors(items, scratchRow)];
    let transparent = explicit ? explicit.findIndex((c) => c[3] === 0) : 0;
    if (transparent < 0 && hasTransparentPixel(items, scratchRow)) {
      if (colors.length < GIF_COLOR_TABLE_ENTRIES) {
        transparent = colors.length;
        colors.push([0, 0, 0]);
      } else {
        colors.splice(0, colors.length, [0, 0, 0], ...gifColors(items, scratchRow));
        transparent = 0;
      }
    }
    const table = new Uint8Array(GIF_COLOR_TABLE_BYTES);
    const lookup = new Map<number, number>();
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      const offset = i * 3;
      table[offset] = c[0];
      table[offset + 1] = c[1];
      table[offset + 2] = c[2];
      if (i !== transparent) {
        const key = (c[0] << 16) | (c[1] << 8) | c[2];
        if (!lookup.has(key)) lookup.set(key, i);
      }
    }
    const index = (d: Uint8Array, at: number) => {
      if (d[at + 3] === 0) return transparent;
      const r = d[at];
      const g = d[at + 1];
      const b = d[at + 2];
      const key = (r << 16) | (g << 8) | b;
      let value = lookup.get(key);
      if (value !== undefined) return value;
      let best = Infinity;
      value = transparent === 0 ? 1 : 0;
      for (let i = 0; i < colors.length; i++) {
        if (i === transparent) continue;
        const c = colors[i];
        const dr = c[0] - r;
        const dg = c[1] - g;
        const db = c[2] - b;
        const distance = dr * dr + dg * dg + db * db;
        if (distance < best) {
          best = distance;
          value = i;
        }
      }
      if (lookup.size < UINT16_VALUE_COUNT) lookup.set(key, value);
      return value;
    };
    return { table, transparent, index };
  };
  const global = paletteFor(
    frames,
    options.palette ? (frames[0].palette ?? options.palette) : undefined,
  );
  const writer = new ChunkedGifWriter();
  writer.writeAscii("GIF89a");
  writer.writeUint16LE(width);
  writer.writeUint16LE(height);
  writer.writeByte(0xf7);
  writer.writeByte(Math.max(0, global.transparent));
  writer.writeByte(0);
  writer.writeBytes(global.table);
  if (loopCount !== 1) {
    writer.writeByte(0x21);
    writer.writeByte(UINT8_MAX);
    writer.writeByte(11);
    writer.writeAscii("NETSCAPE2.0");
    writer.writeByte(3);
    writer.writeByte(1);
    writer.writeUint16LE(loopCount === 0 ? 0 : loopCount - 1);
    writer.writeByte(0);
  }

  const tableKeys = new Int32Array(GIF_LZW_HASH_SIZE);
  const tableCodes = new Uint16Array(GIF_LZW_HASH_SIZE);
  const subBlock = new Uint8Array(GIF_SUB_BLOCK_MAX_BYTES);
  const rowOrder: number[] = [];
  if (options.interlaced) {
    for (const [start, step] of GIF_INTERLACE_PASSES) {
      for (let y = start; y < height; y += step) rowOrder.push(y);
    }
  } else {
    for (let y = 0; y < height; y++) rowOrder.push(y);
  }

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const frame = frames[frameIndex];
    const local = options.palette && frame.palette ? paletteFor([frame], frame.palette) : null;
    const { transparent, index } = local ?? global;
    let delay = Math.max(0, Math.min(UINT16_MAX, Math.floor(frame.duration / 10)));
    if (options.forTwitter) {
      if (frameIndex === frames.length - 1) delay = Math.floor(delay / 4);
      delay = Math.max(2, delay);
    }
    writer.writeByte(0x21);
    writer.writeByte(0xf9);
    writer.writeByte(4);
    writer.writeByte(8 + (transparent >= 0 ? 1 : 0));
    writer.writeUint16LE(delay);
    writer.writeByte(Math.max(0, transparent));
    writer.writeByte(0);
    writer.writeByte(0x2c);
    writer.writeUint16LE(0);
    writer.writeUint16LE(0);
    writer.writeUint16LE(width);
    writer.writeUint16LE(height);
    writer.writeByte((options.interlaced ? 0x40 : 0) | (local ? 0x87 : 0));
    if (local) writer.writeBytes(local.table);
    writer.writeByte(GIF_MIN_CODE_SIZE);

    tableKeys.fill(GIF_LZW_EMPTY_SLOT);
    let codeSize = GIF_LZW_INITIAL_BITS;
    let nextCode = GIF_LZW_FIRST_FREE_CODE;
    let bitBuffer = 0;
    let bitCount = 0;
    let subBlockLength = 0;

    const flushSubBlock = () => {
      if (subBlockLength > 0) {
        writer.writeByte(subBlockLength);
        writer.writeBytes(subBlock.subarray(0, subBlockLength));
        subBlockLength = 0;
      }
    };
    const writeCode = (code: number, widthBits: number) => {
      bitBuffer |= code << bitCount;
      bitCount += widthBits;
      while (bitCount >= 8) {
        subBlock[subBlockLength++] = bitBuffer & UINT8_MAX;
        bitBuffer >>>= 8;
        bitCount -= 8;
        if (subBlockLength === GIF_SUB_BLOCK_MAX_BYTES) flushSubBlock();
      }
    };

    writeCode(GIF_LZW_CLEAR_CODE, codeSize);
    let prefix = -1;
    const rowBytes = width * RGBA_CHANNELS;
    for (let rowIndex = 0; rowIndex < rowOrder.length; rowIndex++) {
      frame.rowSource.fillRow(rowOrder[rowIndex], scratchRow);
      for (let at = 0; at < rowBytes; at += RGBA_CHANNELS) {
        const k = index(scratchRow, at);
        if (prefix < 0) {
          prefix = k;
          continue;
        }
        const key = (prefix << 8) | k;
        let slot = (Math.imul(key, GIF_LZW_HASH_MULTIPLIER) >>> 19) & GIF_LZW_HASH_MASK;
        let found = -1;
        for (;;) {
          const entryKey = tableKeys[slot];
          if (entryKey === GIF_LZW_EMPTY_SLOT) break;
          if (entryKey === key) {
            found = tableCodes[slot];
            break;
          }
          slot = (slot + 1) & GIF_LZW_HASH_MASK;
        }
        if (found >= 0) {
          prefix = found;
          continue;
        }
        writeCode(prefix, codeSize);
        if (nextCode < GIF_LZW_MAX_TABLE_SIZE) {
          tableKeys[slot] = key;
          tableCodes[slot] = nextCode;
          if (nextCode === 1 << codeSize && codeSize < GIF_LZW_MAX_BITS) codeSize++;
          nextCode++;
        } else {
          writeCode(GIF_LZW_CLEAR_CODE, codeSize);
          tableKeys.fill(GIF_LZW_EMPTY_SLOT);
          codeSize = GIF_LZW_INITIAL_BITS;
          nextCode = GIF_LZW_FIRST_FREE_CODE;
        }
        prefix = k;
      }
    }
    if (prefix >= 0) {
      writeCode(prefix, codeSize);
      if (nextCode === 1 << codeSize && codeSize < GIF_LZW_MAX_BITS) codeSize++;
    }
    writeCode(GIF_LZW_EOI_CODE, codeSize);
    if (bitCount > 0) {
      subBlock[subBlockLength++] = bitBuffer & UINT8_MAX;
      if (subBlockLength === GIF_SUB_BLOCK_MAX_BYTES) flushSubBlock();
    }
    flushSubBlock();
    writer.writeByte(0);
  }
  writer.writeByte(0x3b);
  return writer.finish();
}

export function encodeGif(
  frames: readonly ExportAnimationFrame[],
  options: GifEncodeOptions = {},
): Uint8Array {
  validateFrames(frames);
  return joinBytes(
    encodeGifRowSources(
      frames.map((frame) => ({
        rowSource: createPixelBufferRowSource(frame.pixels),
        duration: frame.duration,
        palette: frame.palette,
      })),
      options,
    ),
  );
}
