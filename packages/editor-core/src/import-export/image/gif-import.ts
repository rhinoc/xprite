import type { PixelBuffer } from "$/base/primitives";
import { assertDimension, assertPixelCount } from "$/document/pixel-validation";
import {
  MIN_IMPORTED_FRAME_DURATION_MS,
  assertImportedFrameDuration,
  assertRasterAnimationCapacity,
  type RasterAnimation,
  type RasterAnimationFrame,
} from "$/import-export/image/animation";

const GIF_HEADER_BYTES = 6;
const GIF_CONTROL_EXTENSION = 0xf9;
const GIF_PLAIN_TEXT_EXTENSION = 0x01;
const GIF_APPLICATION_EXTENSION = 0xff;
const GIF_EXTENSION = 0x21;
const GIF_IMAGE = 0x2c;
const GIF_TRAILER = 0x3b;
const GIF_COLOR_CHANNELS = 3;
const RGBA_CHANNELS = 4;
const OPAQUE_ALPHA = 255;
const GIF_DELAY_MS = 10;
const GIF_DICTIONARY_SIZE = 4096;
const GIF_MAX_CODE_BITS = 12;
const GIF_INTERLACE_PASSES = [
  [0, 8],
  [4, 8],
  [2, 4],
  [1, 2],
] as const;

enum GifDisposal {
  Unspecified,
  Keep,
  Background,
  Previous,
}

interface GifFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly interlaced: boolean;
  readonly palette: Uint8Array;
  readonly transparentIndex: number;
  readonly durationMs: number;
  readonly disposal: GifDisposal;
  readonly minimumCodeSize: number;
  readonly compressed: Uint8Array;
}

interface GifAnimation {
  readonly loopCount: number;
  readonly hasLoopCount: boolean;
  readonly width: number;
  readonly height: number;
  readonly background: readonly number[];
  readonly frames: readonly GifFrame[];
}

class GifReader {
  offset = 0;
  constructor(readonly bytes: Uint8Array) {}
  byte() {
    if (this.offset >= this.bytes.length) throw new Error("Truncated GIF data");
    return this.bytes[this.offset++];
  }
  word() {
    return this.byte() | (this.byte() << 8);
  }
  take(length: number) {
    if (this.offset + length > this.bytes.length) throw new Error("Truncated GIF data");
    const data = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return data;
  }
  subBlocks(collect: boolean): Uint8Array {
    const blocks: Uint8Array[] = [];
    let length = 0;
    for (let size = this.byte(); size; size = this.byte()) {
      const block = this.take(size);
      if (collect) {
        blocks.push(block);
        length += size;
      }
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const block of blocks) {
      result.set(block, offset);
      offset += block.length;
    }
    return result;
  }
}

/** Probe by signature rather than trusting a filename or browser MIME type. */
export function isGifData(bytes: Uint8Array): boolean {
  const header = String.fromCharCode(...bytes.subarray(0, GIF_HEADER_BYTES));
  return header === "GIF87a" || header === "GIF89a";
}

function parseGif(bytes: Uint8Array): GifAnimation {
  if (!isGifData(bytes)) throw new Error("Invalid GIF signature");
  const reader = new GifReader(bytes);
  reader.offset = GIF_HEADER_BYTES;
  const width = reader.word();
  const height = reader.word();
  assertDimension(width, "GIF width");
  assertDimension(height, "GIF height");
  assertPixelCount(width, height, "GIF canvas");
  const packed = reader.byte();
  const backgroundIndex = reader.byte();
  reader.byte(); // Pixel aspect ratio does not affect raster frame dimensions.
  const globalPalette =
    packed & 0x80 ? reader.take((1 << ((packed & 7) + 1)) * GIF_COLOR_CHANNELS) : null;
  const background =
    globalPalette && backgroundIndex * GIF_COLOR_CHANNELS < globalPalette.length
      ? [
          ...globalPalette.subarray(
            backgroundIndex * GIF_COLOR_CHANNELS,
            (backgroundIndex + 1) * GIF_COLOR_CHANNELS,
          ),
          OPAQUE_ALPHA,
        ]
      : [0, 0, 0, 0];
  const frames: GifFrame[] = [];
  let transparentIndex = -1;
  let durationMs = GIF_DELAY_MS;
  let disposal = GifDisposal.Unspecified;
  let loopCount = 1;
  let hasLoopCount = false;
  while (true) {
    const block = reader.byte();
    if (block === GIF_TRAILER) break;
    if (block === GIF_EXTENSION) {
      const label = reader.byte();
      if (label === GIF_CONTROL_EXTENSION) {
        if (reader.byte() !== 4) throw new Error("Invalid GIF graphics control extension");
        const control = reader.byte();
        const method = (control >> 2) & 7;
        if (method > GifDisposal.Previous) throw new Error("Unsupported GIF disposal method");
        disposal = method;
        durationMs = Math.max(MIN_IMPORTED_FRAME_DURATION_MS, reader.word() * GIF_DELAY_MS);
        const index = reader.byte();
        transparentIndex = control & 1 ? index : -1;
        if (reader.byte() !== 0) throw new Error("Invalid GIF control extension terminator");
      } else if (label === GIF_APPLICATION_EXTENSION) {
        const identifier = String.fromCharCode(...reader.take(reader.byte()));
        const looping = identifier === "NETSCAPE2.0" || identifier === "ANIMEXTS1.0";
        const data = reader.subBlocks(looping);
        if (looping && data[0] === 1 && !hasLoopCount) {
          if (data.length < 3) throw new Error("Truncated GIF loop extension");
          const repetitions = data[1] | (data[2] << 8);
          loopCount = repetitions === 0 ? 0 : repetitions + 1;
          hasLoopCount = true;
        }
      } else {
        if (label === GIF_PLAIN_TEXT_EXTENSION)
          throw new Error("GIF plain-text rendering extensions are not supported");
        reader.subBlocks(false);
      }
      continue;
    }
    if (block !== GIF_IMAGE) throw new Error("Invalid GIF image block");
    const x = reader.word();
    const y = reader.word();
    const frameWidth = reader.word();
    const frameHeight = reader.word();
    if (!frameWidth || !frameHeight || x + frameWidth > width || y + frameHeight > height)
      throw new Error("GIF frame rectangle exceeds the canvas bounds");
    if (frames.length) assertRasterAnimationCapacity(width, height, frames.length + 1);
    const flags = reader.byte();
    const palette =
      flags & 0x80 ? reader.take((1 << ((flags & 7) + 1)) * GIF_COLOR_CHANNELS) : globalPalette;
    if (!palette) throw new Error("GIF frame has no color table");
    const minimumCodeSize = reader.byte();
    if (minimumCodeSize < 2 || minimumCodeSize > 8)
      throw new Error("Invalid GIF LZW minimum code size");
    frames.push({
      x,
      y,
      width: frameWidth,
      height: frameHeight,
      interlaced: !!(flags & 0x40),
      palette,
      transparentIndex,
      durationMs,
      disposal,
      minimumCodeSize,
      compressed: reader.subBlocks(true),
    });
    transparentIndex = -1;
    durationMs = GIF_DELAY_MS;
    disposal = GifDisposal.Unspecified;
  }
  if (!frames.length) throw new Error("GIF contains no image frames");
  return { width, height, background, frames, loopCount, hasLoopCount };
}

/** GIF LZW uses least-significant-bit codes and a resettable 12-bit dictionary. */
function decodeIndices(frame: GifFrame): Uint8Array {
  const clear = 1 << frame.minimumCodeSize;
  const end = clear + 1;
  const prefix = new Uint16Array(GIF_DICTIONARY_SIZE);
  const suffix = new Uint8Array(GIF_DICTIONARY_SIZE);
  const stack = new Uint8Array(GIF_DICTIONARY_SIZE);
  const output = new Uint8Array(frame.width * frame.height);
  for (let index = 0; index < clear; index++) suffix[index] = index;
  let bits = frame.minimumCodeSize + 1;
  let next = end + 1;
  let old = -1;
  let first = 0;
  let bitOffset = 0;
  let offset = 0;
  let terminated = false;
  while (bitOffset + bits <= frame.compressed.length * 8) {
    const byteOffset = bitOffset >> 3;
    const raw =
      frame.compressed[byteOffset] |
      ((frame.compressed[byteOffset + 1] ?? 0) << 8) |
      ((frame.compressed[byteOffset + 2] ?? 0) << 16);
    let code = (raw >>> (bitOffset & 7)) & ((1 << bits) - 1);
    bitOffset += bits;
    if (code === clear) {
      bits = frame.minimumCodeSize + 1;
      next = end + 1;
      old = -1;
      continue;
    }
    if (code === end) {
      terminated = true;
      break;
    }
    if (old < 0) {
      if (code >= clear || offset >= output.length) throw new Error("Invalid GIF LZW initial code");
      output[offset++] = first = code;
      old = code;
      continue;
    }
    const incoming = code;
    let depth = 0;
    if (code === next) {
      stack[depth++] = first;
      code = old;
    } else if (code > next) {
      throw new Error("Invalid GIF LZW dictionary reference");
    }
    while (code >= clear) {
      if (code <= end || code >= next || depth >= stack.length - 1)
        throw new Error("Invalid GIF LZW dictionary chain");
      stack[depth++] = suffix[code];
      code = prefix[code];
    }
    stack[depth++] = first = suffix[code];
    if (offset + depth > output.length)
      throw new Error("GIF LZW data exceeds the frame dimensions");
    while (depth) output[offset++] = stack[--depth];
    if (next < GIF_DICTIONARY_SIZE) {
      prefix[next] = old;
      suffix[next++] = first;
      if (next === 1 << bits && bits < GIF_MAX_CODE_BITS) bits++;
    }
    old = incoming;
  }
  if (!terminated || offset !== output.length) throw new Error("Truncated GIF LZW frame data");
  return output;
}

function fillRectangle(
  canvas: Uint8ClampedArray,
  canvasWidth: number,
  frame: Pick<GifFrame, "x" | "y" | "width" | "height">,
  color: readonly number[],
) {
  for (let y = frame.y; y < frame.y + frame.height; y++) {
    for (let x = frame.x; x < frame.x + frame.width; x++)
      canvas.set(color, (y * canvasWidth + x) * RGBA_CHANNELS);
  }
}

/** Decode all composed GIF frames. A static GIF remains on the ordinary raster import path. */
export function decodeGifAnimation(
  bytes: Uint8Array,
  options: { includeStatic?: boolean } = {},
): RasterAnimation | null {
  const gif = parseGif(bytes);
  if (gif.frames.length === 1 && !gif.hasLoopCount && !options.includeStatic) return null;
  assertRasterAnimationCapacity(gif.width, gif.height, gif.frames.length);
  for (const frame of gif.frames) assertImportedFrameDuration(frame.durationMs);
  const canvas = new Uint8ClampedArray(gif.width * gif.height * RGBA_CHANNELS);
  const transparent = [0, 0, 0, 0];
  // Like the reference editor, the first frame determines whether the sprite background is transparent.
  const clearColor = gif.frames[0].transparentIndex >= 0 ? transparent : gif.background;
  fillRectangle(
    canvas,
    gif.width,
    { x: 0, y: 0, width: gif.width, height: gif.height },
    clearColor,
  );
  const frames: RasterAnimationFrame[] = [];
  for (const frame of gif.frames) {
    const previous = frame.disposal === GifDisposal.Previous ? canvas.slice() : null;
    const indices = decodeIndices(frame);
    let sourceOffset = 0;
    const paintRow = (y: number) => {
      for (let x = 0; x < frame.width; x++) {
        const index = indices[sourceOffset++];
        if (index === frame.transparentIndex) continue;
        const paletteOffset = index * GIF_COLOR_CHANNELS;
        if (paletteOffset + GIF_COLOR_CHANNELS > frame.palette.length)
          throw new Error("GIF pixel references a missing palette color");
        const targetOffset = ((frame.y + y) * gif.width + frame.x + x) * RGBA_CHANNELS;
        canvas[targetOffset] = frame.palette[paletteOffset];
        canvas[targetOffset + 1] = frame.palette[paletteOffset + 1];
        canvas[targetOffset + 2] = frame.palette[paletteOffset + 2];
        canvas[targetOffset + 3] = OPAQUE_ALPHA;
      }
    };
    if (frame.interlaced) {
      for (const [start, step] of GIF_INTERLACE_PASSES)
        for (let y = start; y < frame.height; y += step) paintRow(y);
    } else {
      for (let y = 0; y < frame.height; y++) paintRow(y);
    }
    const pixels: PixelBuffer = { width: gif.width, height: gif.height, data: canvas.slice() };
    frames.push({ pixels, durationMs: frame.durationMs });
    if (frame.disposal === GifDisposal.Background)
      fillRectangle(canvas, gif.width, frame, clearColor);
    else if (previous) canvas.set(previous);
  }
  return { width: gif.width, height: gif.height, frames, loopCount: gif.loopCount };
}
