import { crc32Parts } from "./crc32";
import { UINT8_MAX, UINT16_MAX } from "./numeric-constants";

const RGBA_CHANNELS = 4;
const PNG_BIT_DEPTH_8 = 8;
const PNG_COLOR_TYPE_RGBA = 6;
const PNG_FILTER_SUB = 1;
const PNG_FILTER_UP = 2;
const PNG_IHDR_LENGTH = 13;
const PNG_CHUNK_HEADER_BYTES = 8;
const PNG_CHUNK_CRC_BYTES = 4;
const ADLER32_MODULO = 65_521;
const ZLIB_STORED_HEADER_CMF = 0x78;
const ZLIB_STORED_HEADER_FLG = 0x01;
const DEFAULT_PNG_STRIP_BYTES = 4 * 1024 * 1024;
const MAX_PNG_STRIP_ROWS = 64;

export const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

/** Streaming RGBA scanline provider shared by portable PNG and JPEG encoders. */
export interface RgbaRowSource {
  readonly width: number;
  readonly height: number;
  /** Populate `target` (length >= width * 4) with straight RGBA bytes for row `y`.
   * Return `true` only when `y > 0` and this row is byte-identical to row `y - 1`. */
  fillRow(y: number, target: Uint8Array): boolean;
}

function uint32Bytes(value: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value);
}

function asciiBytes(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

function rowsEqual(
  data: Uint8Array | Uint8ClampedArray,
  currentOffset: number,
  previousOffset: number,
  rowBytes: number,
): boolean {
  if (
    data.byteOffset % RGBA_CHANNELS === 0 &&
    currentOffset % RGBA_CHANNELS === 0 &&
    previousOffset % RGBA_CHANNELS === 0
  ) {
    const words = new Uint32Array(
      data.buffer,
      data.byteOffset,
      Math.floor(data.byteLength / RGBA_CHANNELS),
    );
    const wordCount = rowBytes >>> 2;
    const currentWord = currentOffset >>> 2;
    const previousWord = previousOffset >>> 2;
    for (let index = 0; index < wordCount; index++) {
      if (words[currentWord + index] !== words[previousWord + index]) return false;
    }
    return true;
  }
  for (let index = 0; index < rowBytes; index++) {
    if (data[currentOffset + index] !== data[previousOffset + index]) return false;
  }
  return true;
}

/** Expose a contiguous RGBA pixel buffer as a zero-allocation row stream. */
export function createPixelBufferRowSource(pixels: {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}): RgbaRowSource {
  const rowBytes = pixels.width * RGBA_CHANNELS;
  return {
    width: pixels.width,
    height: pixels.height,
    fillRow(y: number, target: Uint8Array): boolean {
      const offset = y * rowBytes;
      target.set(pixels.data.subarray(offset, offset + rowBytes), 0);
      return y > 0 && rowsEqual(pixels.data, offset, offset - rowBytes, rowBytes);
    },
  };
}

/** Wrap a chunk payload without copying the payload bytes into a second buffer. */
export function pngChunkParts(
  type: string,
  payload: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer>[] {
  const typeBytes = asciiBytes(type);
  const header = new Uint8Array(PNG_CHUNK_HEADER_BYTES);
  header.set(uint32Bytes(payload.byteLength), 0);
  header.set(typeBytes, 4);
  const crc = uint32Bytes(crc32Parts([typeBytes, payload]));
  return payload.byteLength ? [header, payload, crc] : [header, crc];
}

export function pngHeaderChunk(width: number, height: number): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(PNG_IHDR_LENGTH);
  const view = new DataView(payload.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  payload[8] = PNG_BIT_DEPTH_8;
  payload[9] = PNG_COLOR_TYPE_RGBA;
  const parts = pngChunkParts("IHDR", payload);
  const combined = new Uint8Array(PNG_CHUNK_HEADER_BYTES + PNG_IHDR_LENGTH + PNG_CHUNK_CRC_BYTES);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined;
}

export function pngEndChunk(): Uint8Array<ArrayBuffer> {
  const parts = pngChunkParts("IEND", new Uint8Array(0));
  const combined = new Uint8Array(PNG_CHUNK_HEADER_BYTES + PNG_CHUNK_CRC_BYTES);
  combined.set(parts[0], 0);
  combined.set(parts[1], PNG_CHUNK_HEADER_BYTES);
  return combined;
}

/** Bound temporary scanline strip memory regardless of image width. */
export function pngStripRowCount(width: number, maxStripBytes = DEFAULT_PNG_STRIP_BYTES): number {
  const scanlineBytes = width * RGBA_CHANNELS + 1;
  return Math.max(1, Math.min(MAX_PNG_STRIP_ROWS, Math.floor(maxStripBytes / scanlineBytes)));
}

/** Filter a strip of RGBA rows using Up (all-zero on identical rows) or Sub (pixel-art runs). */
export function pngFilteredStrip(
  source: RgbaRowSource,
  startY: number,
  rowCount: number,
  scratchRow: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const rowBytes = source.width * RGBA_CHANNELS;
  const stride = rowBytes + 1;
  const strip = new Uint8Array(stride * rowCount);
  for (let row = 0; row < rowCount; row++) {
    const y = startY + row;
    const outOffset = row * stride;
    const sameAsPrevious = source.fillRow(y, scratchRow);
    if (y > 0 && sameAsPrevious) {
      // Zero-initialized strip bytes already encode delta = 0 against the prior row.
      strip[outOffset] = PNG_FILTER_UP;
      continue;
    }
    strip[outOffset] = PNG_FILTER_SUB;
    const payloadOffset = outOffset + 1;
    const initialBytes = Math.min(RGBA_CHANNELS, rowBytes);
    for (let index = 0; index < initialBytes; index++) {
      strip[payloadOffset + index] = scratchRow[index];
    }
    for (let index = RGBA_CHANNELS; index < rowBytes; index++) {
      strip[payloadOffset + index] =
        (scratchRow[index] - scratchRow[index - RGBA_CHANNELS]) & UINT8_MAX;
    }
  }
  return strip;
}

/** Emit valid uncompressed zlib blocks across streamed strips when CompressionStream is absent. */
export function storeDeflateStrips(
  strips: Iterable<Uint8Array<ArrayBuffer>>,
): Uint8Array<ArrayBuffer>[] {
  const buffered: Uint8Array<ArrayBuffer>[] = [];
  for (const strip of strips) {
    if (strip.byteLength > 0) buffered.push(strip);
  }
  const output: Uint8Array<ArrayBuffer>[] = [
    Uint8Array.of(ZLIB_STORED_HEADER_CMF, ZLIB_STORED_HEADER_FLG),
  ];
  let s1 = 1;
  let s2 = 0;
  if (!buffered.length) {
    output.push(Uint8Array.of(1, 0, 0, UINT8_MAX, UINT8_MAX), uint32Bytes((s2 << 16) | s1));
    return output;
  }
  for (let stripIndex = 0; stripIndex < buffered.length; stripIndex++) {
    const strip = buffered[stripIndex];
    const lastStrip = stripIndex === buffered.length - 1;
    for (const byte of strip) {
      s1 = (s1 + byte) % ADLER32_MODULO;
      s2 = (s2 + s1) % ADLER32_MODULO;
    }
    for (let offset = 0; offset < strip.byteLength; offset += UINT16_MAX) {
      const length = Math.min(UINT16_MAX, strip.byteLength - offset);
      const isFinal = lastStrip && offset + length === strip.byteLength ? 1 : 0;
      const complement = ~length & UINT16_MAX;
      output.push(
        Uint8Array.of(
          isFinal,
          length & UINT8_MAX,
          length >>> 8,
          complement & UINT8_MAX,
          complement >>> 8,
        ),
        strip.subarray(offset, offset + length),
      );
    }
  }
  output.push(uint32Bytes(((s2 << 16) | s1) >>> 0));
  return output;
}
