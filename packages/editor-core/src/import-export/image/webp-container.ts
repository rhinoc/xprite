import { UINT16_MAX } from "$/base/numeric-constants";
import { assertPixelCount } from "$/document/pixel-validation";
import { joinBytes } from "@xprite/bedrock/common/join-bytes";

const MAX_WEBP_DIMENSION = 16_384;
const MAX_LOSSY_WEBP_DIMENSION = MAX_WEBP_DIMENSION - 1;
export const MAX_WEBP_LOOP_COUNT = UINT16_MAX;
export const MAX_WEBP_FRAME_DURATION = 0xff_ffff;
const MAX_RIFF_BYTES = 0xffff_ffff;

export enum WebpCompression {
  Lossless = "lossless",
  Lossy = "lossy",
}

export function assertWebpDimensions(width: number, height: number, lossy = false) {
  const max = lossy ? MAX_LOSSY_WEBP_DIMENSION : MAX_WEBP_DIMENSION;
  if (![width, height].every((value) => Number.isSafeInteger(value) && value >= 1 && value <= max))
    throw new RangeError(`WebP dimensions must be between 1 and ${max} pixels`);
  assertPixelCount(width, height, "WebP image");
}

export function webpFourCC(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

export function webpChunk(kind: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(8 + payload.length + (payload.length & 1));
  output.set(webpFourCC(kind));
  new DataView(output.buffer).setUint32(4, payload.length, true);
  output.set(payload, 8);
  return output;
}

export function webpRiff(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((size, chunk) => size + chunk.length, 12);
  if (!Number.isSafeInteger(length) || length - 8 > MAX_RIFF_BYTES)
    throw new RangeError("WebP output exceeds the RIFF size limit");
  const header = new Uint8Array(12);
  header.set(webpFourCC("RIFF"));
  new DataView(header.buffer).setUint32(4, length - 8, true);
  header.set(webpFourCC("WEBP"), 8);
  return joinBytes([header, ...chunks]);
}

export function webpUint24(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value;
  bytes[offset + 1] = value >>> 8;
  bytes[offset + 2] = value >>> 16;
}
