import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_DOCUMENT_PIXEL_BYTES,
} from "$/base/image-limits";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { readPaletteData } from "$/import-export/palette";
import { crc32 } from "@xprite/bedrock/common/crc32";
import { joinBytes } from "@xprite/bedrock/common/join-bytes";
import { decodeUtf8 } from "@xprite/bedrock/common/utf8";

export interface PaletteRasterImage {
  pixels: PixelBuffer;
  alpha: boolean;
  grayscale: boolean;
}
const RGBA_CHANNELS = 4;
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;
function dimensions(width: number, height: number): void {
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new Error("Palette image dimensions exceed the memory budget.");
}
/** Decode source samples before color management; palette entries retain the file's working values. */
export function decodePalettePng(
  bytes: Uint8Array,
  inflate: (bytes: Uint8Array, expected: number) => Uint8Array,
): PaletteRasterImage | null {
  if (
    bytes.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20),
    bits = bytes[24],
    type = bytes[25];
  dimensions(width, height);
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
  const compressed: Uint8Array[] = [];
  let transparency: Uint8Array | null = null;
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
    if (name === "tRNS") transparency = bytes.subarray(at + 8, at + 8 + length);
    if (name === "IEND") {
      ended = true;
      break;
    }
    at = end;
  }
  if (!ended || !compressed.length) throw new Error("Incomplete PNG image.");
  const passes = bytes[28] ? ADAM7 : [[0, 0, 1, 1] as const];
  const passSize = (start: number, step: number, size: number) =>
    Math.max(0, Math.ceil((size - start) / step));
  let expected = 0;
  for (const [x, y, sx, sy] of passes) {
    const w = passSize(x, sx, width),
      h = passSize(y, sy, height);
    if (w && h) expected += (Math.ceil((w * channels * bits) / 8) + 1) * h;
  }
  if (expected > MAX_DOCUMENT_PIXEL_BYTES)
    throw new Error("Palette image exceeds the memory budget.");
  const packed = inflate(joinBytes(compressed), expected);
  if (packed.length !== expected) throw new Error("Incomplete PNG samples.");
  const palette = type === 3 ? readPaletteData(bytes, "png") : null;
  if (type === 3 && !palette) throw new Error("Missing PNG palette.");
  const pixels: PixelBuffer = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * RGBA_CHANNELS),
  };
  const transparent =
    transparency && type !== 3
      ? new DataView(transparency.buffer, transparency.byteOffset, transparency.byteLength)
      : null;
  let offset = 0;
  for (const [px, py, sx, sy] of passes) {
    const w = passSize(px, sx, width),
      h = passSize(py, sy, height);
    if (!w || !h) continue;
    const stride = Math.ceil((w * channels * bits) / 8),
      bpp = Math.max(1, Math.ceil((channels * bits) / 8));
    let previous = new Uint8Array(stride);
    for (let y = 0; y < h; y++) {
      const filter = packed[offset++];
      if (filter > 4) throw new Error("Invalid PNG filter.");
      const row = new Uint8Array(stride);
      for (let at = 0; at < stride; at++) {
        const left = at >= bpp ? row[at - bpp] : 0,
          up = previous[at],
          corner = at >= bpp ? previous[at - bpp] : 0;
        const p = left + up - corner,
          a = Math.abs(p - left),
          b = Math.abs(p - up),
          c = Math.abs(p - corner);
        const prediction =
          filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : filter === 4
                  ? a <= b && a <= c
                    ? left
                    : b <= c
                      ? up
                      : corner
                  : 0;
        row[at] = (packed[offset++] + prediction) & UINT8_MAX;
      }
      for (let x = 0; x < w; x++) {
        const raw = (channel: number) => {
          const at = x * channels + channel;
          return bits < 8
            ? (row[Math.floor((at * bits) / 8)] >>> (8 - bits - ((at * bits) % 8))) &
                ((1 << bits) - 1)
            : bits === 16
              ? row[at * 2] * 256 + row[at * 2 + 1]
              : row[at];
        };
        const sample = (channel: number) =>
          bits < 8
            ? (raw(channel) * UINT8_MAX) / ((1 << bits) - 1)
            : bits === 16
              ? raw(channel) >>> 8
              : raw(channel);
        let rgba: readonly number[];
        if (palette) {
          const color = palette[raw(0)];
          if (!color) throw new Error("PNG index exceeds its palette.");
          rgba = color;
        } else if (type === 0 || type === 4)
          rgba = [
            sample(0),
            sample(0),
            sample(0),
            type === 4
              ? sample(1)
              : transparent && raw(0) === transparent.getUint16(0)
                ? 0
                : UINT8_MAX,
          ];
        else
          rgba = [
            sample(0),
            sample(1),
            sample(2),
            type === 6
              ? sample(3)
              : transparent &&
                  [0, 1, 2].every((channel) => raw(channel) === transparent.getUint16(channel * 2))
                ? 0
                : UINT8_MAX,
          ];
        pixels.data.set(rgba, ((py + y * sy) * width + px + x * sx) * RGBA_CHANNELS);
      }
      previous = row;
    }
  }
  return {
    pixels,
    alpha: type === 4 || type === 6 || transparency !== null,
    grayscale: type === 0 || type === 4,
  };
}

export function decodePaletteTga(bytes: Uint8Array): PaletteRasterImage | null {
  if (bytes.length < 18 || ![1, 2, 3, 9, 10, 11].includes(bytes[2])) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(12, true),
    height = view.getUint16(14, true),
    bits = bytes[16],
    type = bytes[2];
  dimensions(width, height);
  const grayscale = type === 3 || type === 11,
    indexed = type === 1 || type === 9;
  if (![8, 16, 24, 32].includes(bits) || (!indexed && !grayscale && bits === 8))
    throw new Error("Invalid TGA depth.");
  const palette = indexed ? readPaletteData(bytes, "tga") : null;
  if (indexed && !palette) throw new Error("Missing TGA palette.");
  const pixels: PixelBuffer = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * RGBA_CHANNELS),
  };
  let offset = 18 + bytes[0] + (bytes[1] ? view.getUint16(5, true) * Math.ceil(bytes[7] / 8) : 0);
  const read = (): readonly number[] => {
    if (offset + bits / 8 > bytes.length) throw new Error("Incomplete TGA samples.");
    const at = offset;
    offset += bits / 8;
    if (indexed) {
      const color = palette![bits === 8 ? bytes[at] : view.getUint16(at, true)];
      if (!color) throw new Error("TGA index exceeds its palette.");
      return color;
    }
    if (grayscale)
      return [bytes[at], bytes[at], bytes[at], bits === 16 ? bytes[at + 1] : UINT8_MAX];
    if (bits === 16) {
      const packed = view.getUint16(at, true),
        expand = (value: number) => (value << 3) | (value >>> 2);
      return [
        expand((packed >>> 10) & 31),
        expand((packed >>> 5) & 31),
        expand(packed & 31),
        bytes[17] & 15 ? (packed & 32768 ? UINT8_MAX : 0) : UINT8_MAX,
      ];
    }
    return [
      bytes[at + 2],
      bytes[at + 1],
      bytes[at],
      bits === 32 && bytes[17] & 15 ? bytes[at + 3] : UINT8_MAX,
    ];
  };
  let index = 0;
  while (index < width * height) {
    const packet = type >= 9 ? bytes[offset++] : 0;
    const count = type >= 9 ? (packet & 127) + 1 : 1;
    if (index + count > width * height) throw new Error("TGA packet exceeds the image.");
    const color = packet & 128 ? read() : null;
    for (let i = 0; i < count; i++, index++) {
      const x = bytes[17] & 16 ? width - 1 - (index % width) : index % width;
      const y = bytes[17] & 32 ? Math.floor(index / width) : height - 1 - Math.floor(index / width);
      pixels.data.set(color ?? read(), (y * width + x) * RGBA_CHANNELS);
    }
  }
  return {
    pixels,
    alpha: !indexed && (grayscale ? bits === 16 : Boolean(bytes[17] & 15)),
    grayscale,
  };
}
