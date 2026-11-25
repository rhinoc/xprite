import { crc32 } from "./crc32";
import { joinBytes } from "./join-bytes";
import { UINT8_MAX } from "./numeric-constants";
import { decodeUtf8 } from "./utf8";

const RGBA_CHANNELS = 4;
const PNG_HEADER_BYTES = 33;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export interface PngStreamDecoder {
  /** Feed an inflated deflate chunk; throws immediately on overflow or invalid row data. */
  push(chunk: Uint8Array): void;
  /** Verify exact inflated byte count and return the decoded RGBA image. */
  finish(): { width: number; height: number; data: Uint8ClampedArray };
}

export interface PngSource {
  width: number;
  height: number;
  alpha: boolean;
  grayscale: boolean;
  interlaced: boolean;
  compressed: Uint8Array;
  inflatedByteLength: number;
  /** Call only after checking dimensions and inflating exactly inflatedByteLength bytes. */
  decode(samples: Uint8Array): { width: number; height: number; data: Uint8ClampedArray };
  /** Streaming row-by-row decoder for non-interlaced PNGs; returns null for Adam7 interlaced PNGs. */
  createRowDecoder(): PngStreamDecoder | null;
}

export function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

function unfilterScanline(
  filter: number,
  encoded: Uint8Array,
  encodedOffset: number,
  row: Uint8Array,
  previous: Uint8Array,
  stride: number,
  bpp: number,
): void {
  switch (filter) {
    case 0:
      row.set(encoded.subarray(encodedOffset, encodedOffset + stride), 0);
      return;
    case 1: {
      const initial = Math.min(bpp, stride);
      for (let at = 0; at < initial; at++) {
        row[at] = encoded[encodedOffset + at];
      }
      for (let at = bpp; at < stride; at++) {
        row[at] = (encoded[encodedOffset + at] + row[at - bpp]) & UINT8_MAX;
      }
      return;
    }
    case 2:
      for (let at = 0; at < stride; at++) {
        row[at] = (encoded[encodedOffset + at] + previous[at]) & UINT8_MAX;
      }
      return;
    case 3: {
      const initial = Math.min(bpp, stride);
      for (let at = 0; at < initial; at++) {
        row[at] = (encoded[encodedOffset + at] + (previous[at] >>> 1)) & UINT8_MAX;
      }
      for (let at = bpp; at < stride; at++) {
        row[at] =
          (encoded[encodedOffset + at] + ((row[at - bpp] + previous[at]) >>> 1)) & UINT8_MAX;
      }
      return;
    }
    case 4: {
      const initial = Math.min(bpp, stride);
      for (let at = 0; at < initial; at++) {
        row[at] = (encoded[encodedOffset + at] + previous[at]) & UINT8_MAX;
      }
      for (let at = bpp; at < stride; at++) {
        const left = row[at - bpp];
        const up = previous[at];
        const corner = previous[at - bpp];
        const pa = Math.abs(up - corner);
        const pb = Math.abs(left - corner);
        const pc = Math.abs(left + up - corner - corner);
        const prediction = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
        row[at] = (encoded[encodedOffset + at] + prediction) & UINT8_MAX;
      }
      return;
    }
    default:
      throw new Error("Invalid PNG filter.");
  }
}

interface PngRowFormat {
  readonly width: number;
  readonly type: number;
  readonly bits: number;
  readonly channels: number;
  readonly palette: Uint8Array | null;
  readonly transparency: Uint8Array | null;
  readonly transparentGray: number;
  readonly hasTransparentRgb: boolean;
  readonly transparentR: number;
  readonly transparentG: number;
  readonly transparentB: number;
}

function writeDecodedRow(
  format: PngRowFormat,
  row: Uint8Array,
  rowWidth: number,
  px: number,
  destY: number,
  sx: number,
  outData: Uint8ClampedArray,
): void {
  const { width, type, bits, channels, palette, transparency } = format;
  const rowBase = destY * width + px;
  if (sx === 1 && bits === 8) {
    if (type === 6) {
      outData.set(row, rowBase * RGBA_CHANNELS);
      return;
    }
    if (type === 2 && !format.hasTransparentRgb) {
      let src = 0;
      let dest = rowBase * RGBA_CHANNELS;
      for (let x = 0; x < rowWidth; x++, src += 3, dest += RGBA_CHANNELS) {
        outData[dest] = row[src];
        outData[dest + 1] = row[src + 1];
        outData[dest + 2] = row[src + 2];
        outData[dest + 3] = UINT8_MAX;
      }
      return;
    }
  }
  const bitMask = bits < 8 ? (1 << bits) - 1 : 0;
  const bitScale = bits < 8 ? UINT8_MAX / bitMask : 1;
  const readRaw = (at: number): number =>
    bits < 8
      ? (row[(at * bits) >>> 3] >>> (8 - bits - ((at * bits) & 7))) & bitMask
      : bits === 16
        ? (row[at * 2] << 8) | row[at * 2 + 1]
        : row[at];
  const scaleSample = (rawValue: number): number =>
    bits < 8 ? rawValue * bitScale : bits === 16 ? rawValue >>> 8 : rawValue;

  let dest = rowBase * RGBA_CHANNELS;
  const destStep = sx * RGBA_CHANNELS;
  if (type === 3) {
    const pal = palette!;
    for (let x = 0; x < rowWidth; x++, dest += destStep) {
      const index = readRaw(x);
      const palAt = index * 3;
      if (palAt + 3 > pal.length) throw new Error("PNG index exceeds its palette.");
      outData[dest] = pal[palAt];
      outData[dest + 1] = pal[palAt + 1];
      outData[dest + 2] = pal[palAt + 2];
      outData[dest + 3] = transparency?.[index] ?? UINT8_MAX;
    }
    return;
  }
  if (type === 0) {
    const transparentGray = format.transparentGray;
    for (let x = 0; x < rowWidth; x++, dest += destStep) {
      const rawGray = readRaw(x);
      const gray = scaleSample(rawGray);
      outData[dest] = gray;
      outData[dest + 1] = gray;
      outData[dest + 2] = gray;
      outData[dest + 3] = transparentGray >= 0 && rawGray === transparentGray ? 0 : UINT8_MAX;
    }
    return;
  }
  if (type === 4) {
    for (let x = 0; x < rowWidth; x++, dest += destStep) {
      const base = x * channels;
      const gray = scaleSample(readRaw(base));
      outData[dest] = gray;
      outData[dest + 1] = gray;
      outData[dest + 2] = gray;
      outData[dest + 3] = scaleSample(readRaw(base + 1));
    }
    return;
  }
  if (type === 2) {
    const { hasTransparentRgb, transparentR, transparentG, transparentB } = format;
    for (let x = 0; x < rowWidth; x++, dest += destStep) {
      const base = x * channels;
      const rRaw = readRaw(base);
      const gRaw = readRaw(base + 1);
      const bRaw = readRaw(base + 2);
      outData[dest] = scaleSample(rRaw);
      outData[dest + 1] = scaleSample(gRaw);
      outData[dest + 2] = scaleSample(bRaw);
      outData[dest + 3] =
        hasTransparentRgb && rRaw === transparentR && gRaw === transparentG && bRaw === transparentB
          ? 0
          : UINT8_MAX;
    }
    return;
  }
  for (let x = 0; x < rowWidth; x++, dest += destStep) {
    const base = x * channels;
    outData[dest] = scaleSample(readRaw(base));
    outData[dest + 1] = scaleSample(readRaw(base + 1));
    outData[dest + 2] = scaleSample(readRaw(base + 2));
    outData[dest + 3] = scaleSample(readRaw(base + 3));
  }
}

/** Read PNG source samples without canvas alpha rounding or display color conversion. */
export function readPng(bytes: Uint8Array): PngSource | null {
  if (!hasPngSignature(bytes)) return null;
  if (bytes.length < PNG_HEADER_BYTES) throw new Error("Incomplete PNG header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20),
    bits = bytes[24],
    type = bytes[25];
  if (
    !width ||
    !height ||
    view.getUint32(8) !== 13 ||
    decodeUtf8(bytes.subarray(12, 16)) !== "IHDR"
  )
    throw new Error("Invalid PNG header.");
  const channels =
    type === 0 || type === 3 ? 1 : type === 2 ? 3 : type === 4 ? 2 : type === 6 ? 4 : 0;
  if (
    !channels ||
    ![1, 2, 4, 8, 16].includes(bits) ||
    (type !== 0 && type !== 3 && bits < 8) ||
    (type === 3 && bits === 16) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] > 1
  )
    throw new Error("Invalid PNG color layout.");
  const interlaced = bytes[28] === 1;
  const compressed: Uint8Array[] = [];
  let transparency: Uint8Array | null = null;
  let paletteBytes: Uint8Array | null = null;
  let ended = false;
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = view.getUint32(at),
      end = at + length + 12;
    if (
      end > bytes.length ||
      crc32(bytes.subarray(at + 4, at + 8 + length)) !== view.getUint32(at + 8 + length)
    )
      throw new Error("Invalid PNG chunk.");
    const name = decodeUtf8(bytes.subarray(at + 4, at + 8));
    if (name === "IDAT") compressed.push(bytes.subarray(at + 8, at + 8 + length));
    if (name === "PLTE") paletteBytes = bytes.subarray(at + 8, at + 8 + length);
    if (name === "tRNS") transparency = bytes.subarray(at + 8, at + 8 + length);
    if (name === "IEND") {
      ended = true;
      break;
    }
    at = end;
  }
  if (!ended || !compressed.length) throw new Error("Incomplete PNG image.");
  const passes = interlaced ? ADAM7 : [[0, 0, 1, 1] as const];
  const passSize = (start: number, step: number, size: number) =>
    Math.max(0, Math.ceil((size - start) / step));
  let expected = 0;
  for (const [x, y, sx, sy] of passes) {
    const w = passSize(x, sx, width),
      h = passSize(y, sy, height);
    if (w && h) expected += (Math.ceil((w * channels * bits) / 8) + 1) * h;
  }
  if (!Number.isSafeInteger(expected)) throw new Error("Invalid PNG sample size.");
  if (type === 3 && (!paletteBytes?.length || paletteBytes.length % 3 || paletteBytes.length > 768))
    throw new Error("Invalid PNG palette.");
  const palette = paletteBytes;
  if (
    transparency &&
    ((type === 0 && transparency.length !== 2) ||
      (type === 2 && transparency.length !== 6) ||
      (type === 3 && transparency.length > palette!.length / 3) ||
      type === 4 ||
      type === 6)
  )
    throw new Error("Invalid PNG transparency.");
  const transparentView =
    transparency && type !== 3
      ? new DataView(transparency.buffer, transparency.byteOffset, transparency.byteLength)
      : null;
  const rowFormat: PngRowFormat = {
    width,
    type,
    bits,
    channels,
    palette,
    transparency,
    transparentGray: transparentView && type === 0 ? transparentView.getUint16(0) : -1,
    hasTransparentRgb: Boolean(transparentView && type === 2),
    transparentR: transparentView && type === 2 ? transparentView.getUint16(0) : 0,
    transparentG: transparentView && type === 2 ? transparentView.getUint16(2) : 0,
    transparentB: transparentView && type === 2 ? transparentView.getUint16(4) : 0,
  };

  const createRowDecoder = (): PngStreamDecoder | null => {
    if (interlaced) return null;
    const stride = Math.ceil((width * channels * bits) / 8);
    const scanlineBytes = stride + 1;
    const bpp = Math.max(1, Math.ceil((channels * bits) / 8));
    const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
    let previous = new Uint8Array(stride);
    let current = new Uint8Array(stride);
    const pending = new Uint8Array(scanlineBytes);
    let pendingLength = 0;
    let rowY = 0;
    let receivedBytes = 0;

    const processScanline = (buffer: Uint8Array, offset: number): void => {
      unfilterScanline(buffer[offset], buffer, offset + 1, current, previous, stride, bpp);
      writeDecodedRow(rowFormat, current, width, 0, rowY, 1, data);
      const swap = previous;
      previous = current;
      current = swap;
      rowY++;
    };

    return {
      push(chunk: Uint8Array): void {
        if (!chunk.length) return;
        if (receivedBytes + chunk.length > expected) {
          throw new Error("PNG samples exceed the declared size.");
        }
        receivedBytes += chunk.length;
        let chunkOffset = 0;
        if (pendingLength > 0) {
          const needed = scanlineBytes - pendingLength;
          if (chunk.length < needed) {
            pending.set(chunk, pendingLength);
            pendingLength += chunk.length;
            return;
          }
          pending.set(chunk.subarray(0, needed), pendingLength);
          chunkOffset = needed;
          pendingLength = 0;
          processScanline(pending, 0);
        }
        while (chunkOffset + scanlineBytes <= chunk.length) {
          processScanline(chunk, chunkOffset);
          chunkOffset += scanlineBytes;
        }
        const remaining = chunk.length - chunkOffset;
        if (remaining > 0) {
          pending.set(chunk.subarray(chunkOffset), 0);
          pendingLength = remaining;
        }
      },
      finish() {
        if (receivedBytes !== expected || rowY !== height || pendingLength !== 0) {
          throw new Error("Incomplete PNG samples.");
        }
        return { width, height, data };
      },
    };
  };

  return {
    width,
    height,
    alpha: type === 4 || type === 6 || transparency !== null,
    grayscale: type === 0 || type === 4,
    interlaced,
    compressed: joinBytes(compressed),
    inflatedByteLength: expected,
    createRowDecoder,
    decode(packed) {
      if (packed.length !== expected) throw new Error("Incomplete PNG samples.");
      const rowDecoder = createRowDecoder();
      if (rowDecoder) {
        rowDecoder.push(packed);
        return rowDecoder.finish();
      }
      const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
      let offset = 0;
      for (const [px, py, sx, sy] of passes) {
        const w = passSize(px, sx, width),
          h = passSize(py, sy, height);
        if (!w || !h) continue;
        const stride = Math.ceil((w * channels * bits) / 8),
          bpp = Math.max(1, Math.ceil((channels * bits) / 8));
        let previous = new Uint8Array(stride);
        let current = new Uint8Array(stride);
        for (let y = 0; y < h; y++) {
          const filter = packed[offset++];
          unfilterScanline(filter, packed, offset, current, previous, stride, bpp);
          offset += stride;
          writeDecodedRow(rowFormat, current, w, px, py + y * sy, sx, data);
          const swap = previous;
          previous = current;
          current = swap;
        }
      }
      return { width, height, data };
    },
  };
}
