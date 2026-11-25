import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { joinBytes } from "@xprite/bedrock/common/join-bytes";
import { createPixelBufferRowSource, type RgbaRowSource } from "@xprite/bedrock/common/png-encode";

const RGBA_CHANNELS = 4;
const BLOCK_EDGE = 8;
const BLOCK_SIZE = 64;
const CHUNK_BYTES = 65_536;
const DEFAULT_JPEG_QUALITY = 92;
const MIN_JPEG_QUALITY = 1;
const MAX_JPEG_QUALITY = 100;
const QUALITY_MIDPOINT = 50;
const MAX_QUANT_VALUE = 255;
const BYTE_STUFF_MARKER = 0xff;
const HUFFMAN_ZRL_SYMBOL = 0xf0;
const HUFFMAN_EOB_SYMBOL = 0x00;
const MAX_ZERO_RUN = 16;
const Y_LEVEL_SHIFT = 128;

// ITU-T T.81 Annex K.1 standard luminance and chrominance quantization tables (natural 8x8 order).
const LUMINANCE_QUANT_BASE = Uint8Array.of(
  16,
  11,
  10,
  16,
  24,
  40,
  51,
  61,
  12,
  12,
  14,
  19,
  26,
  58,
  60,
  55,
  14,
  13,
  16,
  24,
  40,
  57,
  69,
  56,
  14,
  17,
  22,
  29,
  51,
  87,
  80,
  62,
  18,
  22,
  37,
  56,
  68,
  109,
  103,
  77,
  24,
  35,
  55,
  64,
  81,
  104,
  113,
  92,
  49,
  64,
  78,
  87,
  103,
  121,
  120,
  101,
  72,
  92,
  95,
  98,
  112,
  100,
  103,
  99,
);

const CHROMINANCE_QUANT_BASE = Uint8Array.of(
  17,
  18,
  24,
  47,
  99,
  99,
  99,
  99,
  18,
  21,
  26,
  66,
  99,
  99,
  99,
  99,
  24,
  26,
  56,
  99,
  99,
  99,
  99,
  99,
  47,
  66,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
);

// Zigzag index -> natural 8x8 index mapping.
const ZIGZAG_TO_NATURAL = Uint8Array.of(
  0,
  1,
  8,
  16,
  9,
  2,
  3,
  10,
  17,
  24,
  32,
  25,
  18,
  11,
  4,
  5,
  12,
  19,
  26,
  33,
  40,
  48,
  41,
  34,
  27,
  20,
  13,
  6,
  7,
  14,
  21,
  28,
  35,
  42,
  49,
  56,
  57,
  50,
  43,
  36,
  29,
  22,
  15,
  23,
  30,
  37,
  44,
  51,
  58,
  59,
  52,
  45,
  38,
  31,
  39,
  46,
  53,
  60,
  61,
  54,
  47,
  55,
  62,
  63,
);

// AAN FDCT post-scaling factors: s[0] = 1, s[k] = cos(k * pi / 16) * sqrt(2).
const AAN_SCALE = Float64Array.of(
  1.0,
  1.3870398453221475,
  1.3065629648763766,
  1.1758756024193588,
  1.0,
  0.7856949583871023,
  0.5411961001461971,
  0.2758993792829431,
);

const AAN_C4 = 0.7071067811865476;
const AAN_C6 = 0.3826834323650898;
const AAN_C2_MINUS_C6 = 0.541196100146197;
const AAN_C2_PLUS_C6 = 1.3065629648763766;

// ITU-T T.81 Annex K.3 standard Huffman tables.
const DC_LUMA_BITS = Uint8Array.of(0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0);
const DC_LUMA_VALUES = Uint8Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
const AC_LUMA_BITS = Uint8Array.of(0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d);
const AC_LUMA_VALUES = Uint8Array.of(
  0x01,
  0x02,
  0x03,
  0x00,
  0x04,
  0x11,
  0x05,
  0x12,
  0x21,
  0x31,
  0x41,
  0x06,
  0x13,
  0x51,
  0x61,
  0x07,
  0x22,
  0x71,
  0x14,
  0x32,
  0x81,
  0x91,
  0xa1,
  0x08,
  0x23,
  0x42,
  0xb1,
  0xc1,
  0x15,
  0x52,
  0xd1,
  0xf0,
  0x24,
  0x33,
  0x62,
  0x72,
  0x82,
  0x09,
  0x0a,
  0x16,
  0x17,
  0x18,
  0x19,
  0x1a,
  0x25,
  0x26,
  0x27,
  0x28,
  0x29,
  0x2a,
  0x34,
  0x35,
  0x36,
  0x37,
  0x38,
  0x39,
  0x3a,
  0x43,
  0x44,
  0x45,
  0x46,
  0x47,
  0x48,
  0x49,
  0x4a,
  0x53,
  0x54,
  0x55,
  0x56,
  0x57,
  0x58,
  0x59,
  0x5a,
  0x63,
  0x64,
  0x65,
  0x66,
  0x67,
  0x68,
  0x69,
  0x6a,
  0x73,
  0x74,
  0x75,
  0x76,
  0x77,
  0x78,
  0x79,
  0x7a,
  0x83,
  0x84,
  0x85,
  0x86,
  0x87,
  0x88,
  0x89,
  0x8a,
  0x92,
  0x93,
  0x94,
  0x95,
  0x96,
  0x97,
  0x98,
  0x99,
  0x9a,
  0xa2,
  0xa3,
  0xa4,
  0xa5,
  0xa6,
  0xa7,
  0xa8,
  0xa9,
  0xaa,
  0xb2,
  0xb3,
  0xb4,
  0xb5,
  0xb6,
  0xb7,
  0xb8,
  0xb9,
  0xba,
  0xc2,
  0xc3,
  0xc4,
  0xc5,
  0xc6,
  0xc7,
  0xc8,
  0xc9,
  0xca,
  0xd2,
  0xd3,
  0xd4,
  0xd5,
  0xd6,
  0xd7,
  0xd8,
  0xd9,
  0xda,
  0xe1,
  0xe2,
  0xe3,
  0xe4,
  0xe5,
  0xe6,
  0xe7,
  0xe8,
  0xe9,
  0xea,
  0xf1,
  0xf2,
  0xf3,
  0xf4,
  0xf5,
  0xf6,
  0xf7,
  0xf8,
  0xf9,
  0xfa,
);

const DC_CHROMA_BITS = Uint8Array.of(0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0);
const DC_CHROMA_VALUES = Uint8Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
const AC_CHROMA_BITS = Uint8Array.of(0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77);
const AC_CHROMA_VALUES = Uint8Array.of(
  0x00,
  0x01,
  0x02,
  0x03,
  0x11,
  0x04,
  0x05,
  0x21,
  0x31,
  0x06,
  0x12,
  0x41,
  0x51,
  0x07,
  0x61,
  0x71,
  0x13,
  0x22,
  0x32,
  0x81,
  0x08,
  0x14,
  0x42,
  0x91,
  0xa1,
  0xb1,
  0xc1,
  0x09,
  0x23,
  0x33,
  0x52,
  0xf0,
  0x15,
  0x62,
  0x72,
  0xd1,
  0x0a,
  0x16,
  0x24,
  0x34,
  0xe1,
  0x25,
  0xf1,
  0x17,
  0x18,
  0x19,
  0x1a,
  0x26,
  0x27,
  0x28,
  0x29,
  0x2a,
  0x35,
  0x36,
  0x37,
  0x38,
  0x39,
  0x3a,
  0x43,
  0x44,
  0x45,
  0x46,
  0x47,
  0x48,
  0x49,
  0x4a,
  0x53,
  0x54,
  0x55,
  0x56,
  0x57,
  0x58,
  0x59,
  0x5a,
  0x63,
  0x64,
  0x65,
  0x66,
  0x67,
  0x68,
  0x69,
  0x6a,
  0x73,
  0x74,
  0x75,
  0x76,
  0x77,
  0x78,
  0x79,
  0x7a,
  0x82,
  0x83,
  0x84,
  0x85,
  0x86,
  0x87,
  0x88,
  0x89,
  0x8a,
  0x92,
  0x93,
  0x94,
  0x95,
  0x96,
  0x97,
  0x98,
  0x99,
  0x9a,
  0xa2,
  0xa3,
  0xa4,
  0xa5,
  0xa6,
  0xa7,
  0xa8,
  0xa9,
  0xaa,
  0xb2,
  0xb3,
  0xb4,
  0xb5,
  0xb6,
  0xb7,
  0xb8,
  0xb9,
  0xba,
  0xc2,
  0xc3,
  0xc4,
  0xc5,
  0xc6,
  0xc7,
  0xc8,
  0xc9,
  0xca,
  0xd2,
  0xd3,
  0xd4,
  0xd5,
  0xd6,
  0xd7,
  0xd8,
  0xd9,
  0xda,
  0xe2,
  0xe3,
  0xe4,
  0xe5,
  0xe6,
  0xe7,
  0xe8,
  0xe9,
  0xea,
  0xf2,
  0xf3,
  0xf4,
  0xf5,
  0xf6,
  0xf7,
  0xf8,
  0xf9,
  0xfa,
);

interface HuffmanCodeTable {
  readonly codes: Uint16Array;
  readonly lengths: Uint8Array;
}

function buildHuffmanTable(bits: Uint8Array, values: Uint8Array): HuffmanCodeTable {
  const codes = new Uint16Array(256);
  const lengths = new Uint8Array(256);
  let code = 0;
  let valueIndex = 0;
  for (let bitLength = 1; bitLength <= 16; bitLength++) {
    const count = bits[bitLength - 1];
    for (let index = 0; index < count; index++) {
      const symbol = values[valueIndex++];
      codes[symbol] = code;
      lengths[symbol] = bitLength;
      code++;
    }
    code <<= 1;
  }
  return { codes, lengths };
}

const DC_LUMA_TABLE = buildHuffmanTable(DC_LUMA_BITS, DC_LUMA_VALUES);
const AC_LUMA_TABLE = buildHuffmanTable(AC_LUMA_BITS, AC_LUMA_VALUES);
const DC_CHROMA_TABLE = buildHuffmanTable(DC_CHROMA_BITS, DC_CHROMA_VALUES);
const AC_CHROMA_TABLE = buildHuffmanTable(AC_CHROMA_BITS, AC_CHROMA_VALUES);

// Fixed-size chunked writer prevents large JS Array GC spikes and avoids full-file copies.
class ChunkedJpegWriter {
  private readonly chunks: Uint8Array<ArrayBuffer>[] = [];
  private current = new Uint8Array(CHUNK_BYTES);
  private offset = 0;
  private bitBuffer = 0;
  private bitCount = 0;

  writeByte(value: number): void {
    if (this.offset === this.current.byteLength) {
      this.chunks.push(this.current);
      this.current = new Uint8Array(CHUNK_BYTES);
      this.offset = 0;
    }
    this.current[this.offset++] = value & UINT8_MAX;
  }

  writeUint16(value: number): void {
    this.writeByte(value >>> 8);
    this.writeByte(value);
  }

  writeBytes(bytes: Uint8Array): void {
    for (let index = 0; index < bytes.byteLength; index++) this.writeByte(bytes[index]);
  }

  writeBits(code: number, length: number): void {
    this.bitBuffer = (this.bitBuffer << length) | (code & ((1 << length) - 1));
    this.bitCount += length;
    while (this.bitCount >= 8) {
      this.bitCount -= 8;
      const byte = (this.bitBuffer >>> this.bitCount) & UINT8_MAX;
      this.writeByte(byte);
      if (byte === BYTE_STUFF_MARKER) this.writeByte(0);
    }
  }

  flushBits(): void {
    if (this.bitCount > 0) {
      const pad = 8 - this.bitCount;
      this.writeBits((1 << pad) - 1, pad);
    }
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  finish(): Uint8Array<ArrayBuffer>[] {
    if (this.offset > 0) {
      this.chunks.push(this.current.subarray(0, this.offset));
      this.offset = 0;
    }
    return this.chunks;
  }
}

function scaledQuantTable(
  base: Uint8Array,
  qualityPercent: number,
): {
  readonly zigzag: Uint8Array;
  readonly aanReciprocal: Float64Array;
} {
  const clamped = Math.max(
    MIN_JPEG_QUALITY,
    Math.min(MAX_JPEG_QUALITY, Math.round(qualityPercent)),
  );
  const scale = clamped < QUALITY_MIDPOINT ? Math.floor(5000 / clamped) : 200 - clamped * 2;
  const natural = new Uint8Array(BLOCK_SIZE);
  const zigzag = new Uint8Array(BLOCK_SIZE);
  const aanReciprocal = new Float64Array(BLOCK_SIZE);
  for (let index = 0; index < BLOCK_SIZE; index++) {
    const quantized = Math.max(
      1,
      Math.min(MAX_QUANT_VALUE, Math.floor((base[index] * scale + 50) / 100)),
    );
    natural[index] = quantized;
    const row = index >>> 3;
    const col = index & 7;
    aanReciprocal[index] = 1 / (quantized * BLOCK_EDGE * AAN_SCALE[row] * AAN_SCALE[col]);
  }
  for (let index = 0; index < BLOCK_SIZE; index++) {
    zigzag[index] = natural[ZIGZAG_TO_NATURAL[index]];
  }
  return { zigzag, aanReciprocal };
}

function forwardDct(block: Float64Array): void {
  // Pass 1: rows
  for (let offset = 0; offset < BLOCK_SIZE; offset += BLOCK_EDGE) {
    const tmp0 = block[offset + 0] + block[offset + 7];
    const tmp7 = block[offset + 0] - block[offset + 7];
    const tmp1 = block[offset + 1] + block[offset + 6];
    const tmp6 = block[offset + 1] - block[offset + 6];
    const tmp2 = block[offset + 2] + block[offset + 5];
    const tmp5 = block[offset + 2] - block[offset + 5];
    const tmp3 = block[offset + 3] + block[offset + 4];
    const tmp4 = block[offset + 3] - block[offset + 4];

    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;
    block[offset + 0] = tmp10 + tmp11;
    block[offset + 4] = tmp10 - tmp11;
    const z1 = (tmp12 + tmp13) * AAN_C4;
    block[offset + 2] = tmp13 + z1;
    block[offset + 6] = tmp13 - z1;

    const o10 = tmp4 + tmp5;
    const o11 = tmp5 + tmp6;
    const o12 = tmp6 + tmp7;
    const z5 = (o10 - o12) * AAN_C6;
    const z2 = AAN_C2_MINUS_C6 * o10 + z5;
    const z4 = AAN_C2_PLUS_C6 * o12 + z5;
    const z3 = o11 * AAN_C4;
    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;
    block[offset + 5] = z13 + z2;
    block[offset + 3] = z13 - z2;
    block[offset + 1] = z11 + z4;
    block[offset + 7] = z11 - z4;
  }

  // Pass 2: columns
  for (let col = 0; col < BLOCK_EDGE; col++) {
    const i0 = col;
    const i1 = col + 8;
    const i2 = col + 16;
    const i3 = col + 24;
    const i4 = col + 32;
    const i5 = col + 40;
    const i6 = col + 48;
    const i7 = col + 56;

    const tmp0 = block[i0] + block[i7];
    const tmp7 = block[i0] - block[i7];
    const tmp1 = block[i1] + block[i6];
    const tmp6 = block[i1] - block[i6];
    const tmp2 = block[i2] + block[i5];
    const tmp5 = block[i2] - block[i5];
    const tmp3 = block[i3] + block[i4];
    const tmp4 = block[i3] - block[i4];

    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;
    block[i0] = tmp10 + tmp11;
    block[i4] = tmp10 - tmp11;
    const z1 = (tmp12 + tmp13) * AAN_C4;
    block[i2] = tmp13 + z1;
    block[i6] = tmp13 - z1;

    const o10 = tmp4 + tmp5;
    const o11 = tmp5 + tmp6;
    const o12 = tmp6 + tmp7;
    const z5 = (o10 - o12) * AAN_C6;
    const z2 = AAN_C2_MINUS_C6 * o10 + z5;
    const z4 = AAN_C2_PLUS_C6 * o12 + z5;
    const z3 = o11 * AAN_C4;
    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;
    block[i5] = z13 + z2;
    block[i3] = z13 - z2;
    block[i1] = z11 + z4;
    block[i7] = z11 - z4;
  }
}

function coefficientCategory(magnitude: number): number {
  let category = 0;
  let remaining = magnitude;
  while (remaining > 0) {
    category++;
    remaining >>>= 1;
  }
  return category;
}

function encodeBlock(
  writer: ChunkedJpegWriter,
  block: Float64Array,
  aanReciprocal: Float64Array,
  previousDc: number,
  dcTable: HuffmanCodeTable,
  acTable: HuffmanCodeTable,
  quantized: Int32Array,
): number {
  forwardDct(block);
  for (let index = 0; index < BLOCK_SIZE; index++) {
    const naturalIndex = ZIGZAG_TO_NATURAL[index];
    quantized[index] = Math.round(block[naturalIndex] * aanReciprocal[naturalIndex]);
  }
  const dc = quantized[0];
  const dcDiff = dc - previousDc;
  if (dcDiff === 0) {
    writer.writeBits(dcTable.codes[0], dcTable.lengths[0]);
  } else {
    const magnitude = dcDiff < 0 ? -dcDiff : dcDiff;
    const category = coefficientCategory(magnitude);
    writer.writeBits(dcTable.codes[category], dcTable.lengths[category]);
    writer.writeBits(dcDiff < 0 ? dcDiff - 1 : dcDiff, category);
  }

  let lastNonZero = BLOCK_SIZE - 1;
  while (lastNonZero > 0 && quantized[lastNonZero] === 0) lastNonZero--;
  if (lastNonZero === 0) {
    writer.writeBits(acTable.codes[HUFFMAN_EOB_SYMBOL], acTable.lengths[HUFFMAN_EOB_SYMBOL]);
    return dc;
  }

  let zeroRun = 0;
  for (let index = 1; index <= lastNonZero; index++) {
    const value = quantized[index];
    if (value === 0) {
      zeroRun++;
      if (zeroRun === MAX_ZERO_RUN) {
        writer.writeBits(acTable.codes[HUFFMAN_ZRL_SYMBOL], acTable.lengths[HUFFMAN_ZRL_SYMBOL]);
        zeroRun = 0;
      }
      continue;
    }
    const magnitude = value < 0 ? -value : value;
    const category = coefficientCategory(magnitude);
    const symbol = (zeroRun << 4) | category;
    writer.writeBits(acTable.codes[symbol], acTable.lengths[symbol]);
    writer.writeBits(value < 0 ? value - 1 : value, category);
    zeroRun = 0;
  }
  if (lastNonZero < BLOCK_SIZE - 1) {
    writer.writeBits(acTable.codes[HUFFMAN_EOB_SYMBOL], acTable.lengths[HUFFMAN_EOB_SYMBOL]);
  }
  return dc;
}

function writeDhtSegment(
  writer: ChunkedJpegWriter,
  tableInfo: number,
  bits: Uint8Array,
  values: Uint8Array,
): void {
  writer.writeUint16(0xffc4);
  writer.writeUint16(2 + 1 + 16 + values.byteLength);
  writer.writeByte(tableInfo);
  writer.writeBytes(bits);
  writer.writeBytes(values);
}

/** Stream straight RGBA rows into Baseline 4:4:4 JPEG chunks without a 2D canvas. */
export function encodeJpegChunks(
  source: RgbaRowSource,
  qualityPercent = DEFAULT_JPEG_QUALITY,
  matte?: readonly [number, number, number],
): Uint8Array<ArrayBuffer>[] {
  const { width, height } = source;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new RangeError(`JPEG dimensions ${width} × ${height} exceed the image limit.`);
  }
  if (!Number.isFinite(qualityPercent) || qualityPercent < 0 || qualityPercent > 100) {
    throw new RangeError("JPEG quality must be between 0 and 100.");
  }

  const lumaQuant = scaledQuantTable(LUMINANCE_QUANT_BASE, qualityPercent);
  const chromaQuant = scaledQuantTable(CHROMINANCE_QUANT_BASE, qualityPercent);
  const writer = new ChunkedJpegWriter();

  // SOI
  writer.writeUint16(0xffd8);
  // APP0 (JFIF 1.01)
  writer.writeUint16(0xffe0);
  writer.writeUint16(16);
  writer.writeBytes(Uint8Array.of(0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0));
  // DQT (table 0 = luminance, table 1 = chrominance)
  writer.writeUint16(0xffdb);
  writer.writeUint16(2 + (1 + BLOCK_SIZE) * 2);
  writer.writeByte(0);
  writer.writeBytes(lumaQuant.zigzag);
  writer.writeByte(1);
  writer.writeBytes(chromaQuant.zigzag);
  // SOF0 (Baseline DCT, 8-bit precision, 3 components, 4:4:4 sampling for crisp pixel art)
  writer.writeUint16(0xffc0);
  writer.writeUint16(17);
  writer.writeByte(8);
  writer.writeUint16(height);
  writer.writeUint16(width);
  writer.writeByte(3);
  writer.writeBytes(Uint8Array.of(1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1));
  // DHT
  writeDhtSegment(writer, 0x00, DC_LUMA_BITS, DC_LUMA_VALUES);
  writeDhtSegment(writer, 0x10, AC_LUMA_BITS, AC_LUMA_VALUES);
  writeDhtSegment(writer, 0x01, DC_CHROMA_BITS, DC_CHROMA_VALUES);
  writeDhtSegment(writer, 0x11, AC_CHROMA_BITS, AC_CHROMA_VALUES);
  // SOS
  writer.writeUint16(0xffda);
  writer.writeUint16(12);
  writer.writeByte(3);
  writer.writeBytes(Uint8Array.of(1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0));

  const rowBytes = width * RGBA_CHANNELS;
  const strip = new Uint8Array(BLOCK_EDGE * rowBytes);
  const stripViews = Array.from({ length: BLOCK_EDGE }, (_, row) =>
    strip.subarray(row * rowBytes, (row + 1) * rowBytes),
  );
  const yBlock = new Float64Array(BLOCK_SIZE);
  const cbBlock = new Float64Array(BLOCK_SIZE);
  const crBlock = new Float64Array(BLOCK_SIZE);
  const quantized = new Int32Array(BLOCK_SIZE);
  const matteR = matte?.[0] ?? 0;
  const matteG = matte?.[1] ?? 0;
  const matteB = matte?.[2] ?? 0;
  const blendMatte = matte !== undefined;

  let dcY = 0;
  let dcCb = 0;
  let dcCr = 0;

  for (let blockY = 0; blockY < height; blockY += BLOCK_EDGE) {
    const validRows = Math.min(BLOCK_EDGE, height - blockY);
    for (let row = 0; row < validRows; row++) {
      source.fillRow(blockY + row, stripViews[row]);
    }
    for (let blockX = 0; blockX < width; blockX += BLOCK_EDGE) {
      let cell = 0;
      for (let row = 0; row < BLOCK_EDGE; row++) {
        const clampedRow = row < validRows ? row : validRows - 1;
        const rowData = stripViews[clampedRow];
        for (let col = 0; col < BLOCK_EDGE; col++) {
          const x = blockX + col;
          const clampedX = x < width ? x : width - 1;
          const pixelOffset = clampedX * RGBA_CHANNELS;
          let r = rowData[pixelOffset];
          let g = rowData[pixelOffset + 1];
          let b = rowData[pixelOffset + 2];
          if (blendMatte) {
            const alphaByte = rowData[pixelOffset + 3];
            if (alphaByte < UINT8_MAX) {
              const alpha = alphaByte / UINT8_MAX;
              const inv = 1 - alpha;
              r = r * alpha + matteR * inv;
              g = g * alpha + matteG * inv;
              b = b * alpha + matteB * inv;
            }
          }
          yBlock[cell] = 0.299 * r + 0.587 * g + 0.114 * b - Y_LEVEL_SHIFT;
          cbBlock[cell] = -0.168735892 * r - 0.331264108 * g + 0.5 * b;
          crBlock[cell] = 0.5 * r - 0.418687589 * g - 0.081312411 * b;
          cell++;
        }
      }
      dcY = encodeBlock(
        writer,
        yBlock,
        lumaQuant.aanReciprocal,
        dcY,
        DC_LUMA_TABLE,
        AC_LUMA_TABLE,
        quantized,
      );
      dcCb = encodeBlock(
        writer,
        cbBlock,
        chromaQuant.aanReciprocal,
        dcCb,
        DC_CHROMA_TABLE,
        AC_CHROMA_TABLE,
        quantized,
      );
      dcCr = encodeBlock(
        writer,
        crBlock,
        chromaQuant.aanReciprocal,
        dcCr,
        DC_CHROMA_TABLE,
        AC_CHROMA_TABLE,
        quantized,
      );
    }
  }

  writer.flushBits();
  // EOI
  writer.writeUint16(0xffd9);
  return writer.finish();
}

/** Convenience wrapper returning a single JPEG buffer for tests and non-Blob callers. */
export function encodeJpeg(
  pixels: PixelBuffer,
  qualityPercent = DEFAULT_JPEG_QUALITY,
  matte?: readonly [number, number, number],
): Uint8Array {
  return joinBytes(encodeJpegChunks(createPixelBufferRowSource(pixels), qualityPercent, matte));
}
