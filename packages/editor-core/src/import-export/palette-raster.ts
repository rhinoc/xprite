import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_DOCUMENT_PIXEL_BYTES,
} from "$/base/image-limits";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { readPaletteData } from "$/import-export/palette";
import { readPng } from "@xprite/bedrock/common/png";

export interface PaletteRasterImage {
  pixels: PixelBuffer;
  alpha: boolean;
  grayscale: boolean;
}
const RGBA_CHANNELS = 4;
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
/** Decode a palette source within the editor's image and memory limits. */
export function decodePalettePng(
  bytes: Uint8Array,
  inflate: (bytes: Uint8Array, expected: number) => Uint8Array,
): PaletteRasterImage | null {
  const source = readPng(bytes);
  if (!source) return null;
  dimensions(source.width, source.height);
  if (source.inflatedByteLength > MAX_DOCUMENT_PIXEL_BYTES)
    throw new Error("Palette image exceeds the memory budget.");
  return {
    pixels: source.decode(inflate(source.compressed, source.inflatedByteLength)),
    alpha: source.alpha,
    grayscale: source.grayscale,
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
