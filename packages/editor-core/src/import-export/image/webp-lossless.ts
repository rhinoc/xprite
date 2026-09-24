import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import { assertWebpDimensions, webpFourCC } from "$/import-export/image/webp-container";

const BYTE_VALUES = 256;
const LENGTH_SYMBOLS = 24;
const MAX_COPY_LENGTH = 4096;
const INITIAL_BUFFER_SIZE = 16_384;
const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9] as const;

class BitWriter {
  private bytes: Uint8Array;
  private length = 0;
  private bits = 0;
  private used = 0;
  constructor(private readonly maxBytes: number) {
    this.bytes = new Uint8Array(Math.min(INITIAL_BUFFER_SIZE, maxBytes));
  }
  write(value: number, count: number) {
    if (!count) return;
    this.bits |= (value & ((1 << count) - 1)) << this.used;
    this.used += count;
    while (this.used >= 8) {
      this.byte(this.bits & 255);
      this.bits >>>= 8;
      this.used -= 8;
    }
  }
  private byte(value: number) {
    if (this.length === this.bytes.length) {
      if (this.length >= this.maxBytes)
        throw new RangeError("WebP output exceeds its encoding budget");
      const grown = new Uint8Array(Math.min(this.bytes.length * 2, this.maxBytes));
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = value;
  }
  finish(): Uint8Array {
    if (this.used) this.byte(this.bits);
    return this.bytes.subarray(0, this.length);
  }
}

function reverse(value: number, count: number): number {
  let result = 0;
  for (let bit = 0; bit < count; bit++) {
    result = (result << 1) | (value & 1);
    value >>>= 1;
  }
  return result;
}
const REVERSED_BYTE = Uint16Array.from({ length: BYTE_VALUES }, (_, value) => reverse(value, 8));

function singleSymbol(writer: BitWriter, value: number) {
  writer.write(1, 1); // Simple prefix code.
  writer.write(0, 1); // One symbol.
  writer.write(value > 1 ? 1 : 0, 1);
  writer.write(value, value > 1 ? 8 : 1);
}

function channelTable(writer: BitWriter, constant: number | null) {
  if (constant !== null) {
    singleSymbol(writer, constant);
    return;
  }
  // A complete 256-leaf tree with eight-bit codes. Code lengths use symbols 0/8.
  writer.write(0, 1);
  writer.write(8, 4); // Twelve code-length alphabet entries.
  for (const symbol of CODE_LENGTH_ORDER.slice(0, 12))
    writer.write(symbol === 0 || symbol === 8 ? 1 : 0, 3);
  writer.write(0, 1); // Entire literal alphabet.
  for (let value = 0; value < BYTE_VALUES; value++) writer.write(1, 1); // Length eight.
}

function greenTable(writer: BitWriter) {
  // Kraft sum: 256/512 + 8/32 + 16/64 = 1. Length symbols occupy the shorter codes.
  writer.write(0, 1);
  writer.write(9, 4); // Thirteen code-length alphabet entries.
  for (const symbol of CODE_LENGTH_ORDER) writer.write([0, 5, 6, 9].includes(symbol) ? 2 : 0, 3);
  writer.write(0, 1); // All 280 symbols.
  for (let value = 0; value < BYTE_VALUES; value++) writer.write(3, 2); // Length nine.
  for (let value = 0; value < 8; value++) writer.write(2, 2); // Length five.
  for (let value = 8; value < LENGTH_SYMBOLS; value++) writer.write(1, 2); // Length six.
}

function copyRun(writer: BitWriter, length: number) {
  let code = length - 1;
  let extra = 0;
  let extraBits = 0;
  if (length > 4) {
    const highest = 31 - Math.clz32(length - 1);
    extraBits = highest - 1;
    code = highest * 2 + (((length - 1) >>> extraBits) & 1);
    extra = (length - 1) & ((1 << extraBits) - 1);
  }
  writer.write(reverse(code < 8 ? code : code + 8, code < 8 ? 5 : 6), code < 8 ? 5 : 6);
  writer.write(extra, extraBits);
  // Distance prefix symbol one => distance code two => previous pixel. Its single-leaf tree consumes zero bits.
}

/** Independently authored VP8L encoder: exact straight RGBA, fixed prefix trees and repeated-pixel LZ77 runs.
 * No Canvas premultiplication or hidden-color cleanup. Compression is deliberately deterministic. */
export function encodeWebpLossless(pixels: PixelBuffer): Uint8Array {
  assertPixelBuffer(pixels);
  assertWebpDimensions(pixels.width, pixels.height);
  const data = pixels.data;
  const constants: (number | null)[] = [data[0], data[2], data[3]];
  const channels = [0, 2, 3];
  let alpha = false;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] !== 255) alpha = true;
    for (let channel = 0; channel < channels.length; channel++)
      if (constants[channel] !== data[offset + channels[channel]]) constants[channel] = null;
  }
  const writer = new BitWriter(Math.ceil((pixels.width * pixels.height * 33) / 8) + 1024);
  writer.write(pixels.width - 1, 14);
  writer.write(pixels.height - 1, 14);
  writer.write(alpha ? 1 : 0, 1);
  writer.write(0, 3); // VP8L version.
  writer.write(0, 1); // No transforms.
  writer.write(0, 1); // No color cache.
  writer.write(0, 1); // One prefix group.
  greenTable(writer);
  for (const constant of constants) channelTable(writer, constant);
  singleSymbol(writer, 1); // Horizontal predecessor distance.
  const same = (left: number, right: number) =>
    data[left] === data[right] &&
    data[left + 1] === data[right + 1] &&
    data[left + 2] === data[right + 2] &&
    data[left + 3] === data[right + 3];
  for (let offset = 0; offset < data.length;) {
    if (offset && same(offset, offset - 4)) {
      let length = 1;
      while (
        length < MAX_COPY_LENGTH &&
        offset + length * 4 < data.length &&
        same(offset + length * 4, offset - 4)
      )
        length++;
      copyRun(writer, length);
      offset += length * 4;
      continue;
    }
    writer.write((REVERSED_BYTE[data[offset + 1]] << 1) | 1, 9);
    for (let channel = 0; channel < channels.length; channel++)
      if (constants[channel] === null)
        writer.write(REVERSED_BYTE[data[offset + channels[channel]]], 8);
    offset += 4;
  }
  const bits = writer.finish();
  const payloadLength = bits.length + 1;
  const output = new Uint8Array(20 + payloadLength + (payloadLength & 1));
  output.set(webpFourCC("RIFF"));
  const view = new DataView(output.buffer);
  view.setUint32(4, output.length - 8, true);
  output.set(webpFourCC("WEBP"), 8);
  output.set(webpFourCC("VP8L"), 12);
  view.setUint32(16, payloadLength, true);
  output[20] = 0x2f;
  output.set(bits, 21);
  return output;
}
