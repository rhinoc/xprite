import type { PixelBuffer } from "$/base/primitives";
import { assertDimension, assertPixelCount } from "$/document/pixel-validation";
import {
  MIN_IMPORTED_FRAME_DURATION_MS,
  assertImportedFrameDuration,
  assertRasterAnimationCapacity,
  type RasterAnimation,
  type RasterAnimationFrame,
} from "$/import-export/image/animation";

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const EXTENDED_HEADER_BYTES = 10;
const FRAME_HEADER_BYTES = 16;
const WEBP_ANIMATION_FLAG = 0x02;
const WEBP_ALPHA_FLAG = 0x10;
const WEBP_COLOR_PROFILE_FLAG = 0x20;
const RGBA_CHANNELS = 4;
const MAX_CHANNEL = 255;

export interface WebpAnimationFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly disposeBackground: boolean;
  readonly replace: boolean;
  /** ANMF image subchunks, including their chunk headers and padding. */
  readonly encodedChunks: Uint8Array;
  readonly alpha: boolean;
}

export interface WebpAnimationData {
  readonly loopCount?: number;
  readonly width: number;
  readonly height: number;
  readonly background: readonly [number, number, number, number];
  readonly profileChunk?: Uint8Array;
  readonly frames: readonly WebpAnimationFrame[];
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function uint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function writeUint24(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value;
  bytes[offset + 1] = value >>> 8;
  bytes[offset + 2] = value >>> 16;
}

function writeFourCC(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index++)
    bytes[offset + index] = value.charCodeAt(index);
}

function chunks(bytes: Uint8Array, start: number, end: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: { kind: string; data: Uint8Array; raw: Uint8Array }[] = [];
  for (let offset = start; offset < end;) {
    if (offset + CHUNK_HEADER_BYTES > end) throw new Error("Truncated WebP chunk header");
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + CHUNK_HEADER_BYTES;
    const next = dataStart + size + (size & 1);
    if (next > end) throw new Error("Truncated WebP chunk payload");
    result.push({
      kind: fourCC(bytes, offset),
      data: bytes.subarray(dataStart, dataStart + size),
      raw: bytes.subarray(offset, next),
    });
    offset = next;
  }
  return result;
}

export function isWebpData(bytes: Uint8Array): boolean {
  return (
    bytes.length >= RIFF_HEADER_BYTES && fourCC(bytes, 0) === "RIFF" && fourCC(bytes, 8) === "WEBP"
  );
}

/** Demux animation metadata before asking any browser decoder to allocate pixels. */
export function parseWebpAnimation(bytes: Uint8Array): WebpAnimationData | null {
  if (!isWebpData(bytes)) throw new Error("Invalid WebP signature");
  const size =
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8;
  if (size < RIFF_HEADER_BYTES || size > bytes.length)
    throw new Error("Truncated WebP RIFF container");
  let width = 0;
  let height = 0;
  let animated = false;
  let hasHeader = false;
  let hasControl = false;
  let loopCount = 0;
  let profileChunk: Uint8Array | undefined;
  let background: readonly [number, number, number, number] = [0, 0, 0, 0];
  const frames: WebpAnimationFrame[] = [];
  for (const chunk of chunks(bytes, RIFF_HEADER_BYTES, size)) {
    if (chunk.kind === "VP8X") {
      if (hasHeader || chunk.data.length !== EXTENDED_HEADER_BYTES || frames.length)
        throw new Error("Invalid WebP extended header");
      hasHeader = true;
      animated = !!(chunk.data[0] & WEBP_ANIMATION_FLAG);
      width = uint24(chunk.data, 4) + 1;
      height = uint24(chunk.data, 7) + 1;
      if (animated) {
        assertDimension(width, "WebP width");
        assertDimension(height, "WebP height");
        assertPixelCount(width, height, "WebP canvas");
      }
    } else if (chunk.kind === "ICCP") {
      if (frames.length || profileChunk) throw new Error("Invalid WebP color profile order");
      profileChunk = chunk.raw;
    } else if (chunk.kind === "ANIM") {
      if (!animated) continue;
      if (hasControl || frames.length || chunk.data.length !== 6)
        throw new Error("Invalid WebP animation control chunk");
      hasControl = true;
      background = [chunk.data[2], chunk.data[1], chunk.data[0], chunk.data[3]];
      loopCount = chunk.data[4] | (chunk.data[5] << 8);
    } else if (chunk.kind === "ANMF") {
      if (!animated || !hasControl || chunk.data.length < FRAME_HEADER_BYTES)
        throw new Error("Invalid WebP animation frame header");
      const x = uint24(chunk.data, 0) * 2;
      const y = uint24(chunk.data, 3) * 2;
      const frameWidth = uint24(chunk.data, 6) + 1;
      const frameHeight = uint24(chunk.data, 9) + 1;
      if (x + frameWidth > width || y + frameHeight > height)
        throw new Error("WebP animation frame rectangle exceeds the canvas bounds");
      if (frames.length) assertRasterAnimationCapacity(width, height, frames.length + 1);
      const frameChunks = chunks(chunk.data, FRAME_HEADER_BYTES, chunk.data.length);
      const bitstreams = frameChunks.filter((part) => part.kind === "VP8 " || part.kind === "VP8L");
      if (bitstreams.length !== 1)
        throw new Error("WebP animation frame must contain one image bitstream");
      const alphaChunks = frameChunks.filter((part) => part.kind === "ALPH");
      if (alphaChunks.length > 1 || (alphaChunks.length && bitstreams[0].kind === "VP8L"))
        throw new Error("Invalid WebP animation alpha subchunks");
      if (bitstreams[0].kind === "VP8L" && bitstreams[0].data.length < 5)
        throw new Error("Truncated WebP lossless image header");
      const alpha =
        alphaChunks.length > 0 ||
        (bitstreams[0].kind === "VP8L" && !!(bitstreams[0].data[4] & WEBP_ALPHA_FLAG));
      const durationMs = Math.max(MIN_IMPORTED_FRAME_DURATION_MS, uint24(chunk.data, 12));
      frames.push({
        x,
        y,
        width: frameWidth,
        height: frameHeight,
        durationMs,
        disposeBackground: !!(chunk.data[15] & 1),
        replace: !!(chunk.data[15] & 2),
        encodedChunks: chunk.data.subarray(FRAME_HEADER_BYTES),
        alpha,
      });
    }
  }
  if (!animated) return null;
  if (!hasControl || !frames.length) throw new Error("Animated WebP contains no animation frames");
  // An ANIM container can have one frame and still carry an explicit play policy.
  assertRasterAnimationCapacity(width, height, frames.length);
  for (const frame of frames) assertImportedFrameDuration(frame.durationMs);
  return { width, height, background, profileChunk, frames, loopCount };
}

/** Reconstruct each ANMF frame as a standalone WebP for browsers without ImageDecoder. */
export function webpAnimationFrameData(
  frame: WebpAnimationFrame,
  profileChunk?: Uint8Array,
): Uint8Array {
  const headerSize = RIFF_HEADER_BYTES + CHUNK_HEADER_BYTES + EXTENDED_HEADER_BYTES;
  const result = new Uint8Array(
    headerSize + (profileChunk?.length ?? 0) + frame.encodedChunks.length,
  );
  writeFourCC(result, 0, "RIFF");
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  writeFourCC(result, 8, "WEBP");
  writeFourCC(result, RIFF_HEADER_BYTES, "VP8X");
  new DataView(result.buffer).setUint32(RIFF_HEADER_BYTES + 4, EXTENDED_HEADER_BYTES, true);
  const extensionOffset = RIFF_HEADER_BYTES + CHUNK_HEADER_BYTES;
  result[extensionOffset] =
    (frame.alpha ? WEBP_ALPHA_FLAG : 0) | (profileChunk ? WEBP_COLOR_PROFILE_FLAG : 0);
  writeUint24(result, extensionOffset + 4, frame.width - 1);
  writeUint24(result, extensionOffset + 7, frame.height - 1);
  if (profileChunk) result.set(profileChunk, headerSize);
  result.set(frame.encodedChunks, headerSize + (profileChunk?.length ?? 0));
  return result;
}

/** Compose straight RGBA frames according to ANMF replace/blend and disposal flags. */
export async function decodeWebpAnimation(
  animation: WebpAnimationData,
  decodeFrame: (frame: WebpAnimationFrame, profileChunk?: Uint8Array) => Promise<PixelBuffer>,
): Promise<RasterAnimation> {
  assertRasterAnimationCapacity(animation.width, animation.height, animation.frames.length);
  const canvas = new Uint8ClampedArray(animation.width * animation.height * RGBA_CHANNELS);
  const fill = (x: number, y: number, width: number, height: number) => {
    for (let row = y; row < y + height; row++)
      for (let column = x; column < x + width; column++)
        canvas.set(animation.background, (row * animation.width + column) * RGBA_CHANNELS);
  };
  fill(0, 0, animation.width, animation.height);
  const frames: RasterAnimationFrame[] = [];
  for (const frame of animation.frames) {
    const decoded = await decodeFrame(frame, animation.profileChunk);
    if (
      decoded.width !== frame.width ||
      decoded.height !== frame.height ||
      decoded.data.length !== frame.width * frame.height * RGBA_CHANNELS
    )
      throw new Error("Decoded WebP frame dimensions do not match the animation container");
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const source = (y * frame.width + x) * RGBA_CHANNELS;
        const target = ((frame.y + y) * animation.width + frame.x + x) * RGBA_CHANNELS;
        const sourceAlpha = decoded.data[source + 3] / MAX_CHANNEL;
        if (frame.replace || sourceAlpha === 1) {
          canvas.set(decoded.data.subarray(source, source + RGBA_CHANNELS), target);
        } else if (sourceAlpha > 0) {
          const retainedAlpha = (canvas[target + 3] / MAX_CHANNEL) * (1 - sourceAlpha);
          const alpha = sourceAlpha + retainedAlpha;
          for (let channel = 0; channel < RGBA_CHANNELS - 1; channel++)
            canvas[target + channel] =
              (decoded.data[source + channel] * sourceAlpha +
                canvas[target + channel] * retainedAlpha) /
              alpha;
          canvas[target + 3] = alpha * MAX_CHANNEL;
        }
      }
    }
    frames.push({
      pixels: { width: animation.width, height: animation.height, data: canvas.slice() },
      durationMs: frame.durationMs,
    });
    if (frame.disposeBackground) fill(frame.x, frame.y, frame.width, frame.height);
  }
  return {
    width: animation.width,
    height: animation.height,
    frames,
    loopCount: animation.loopCount,
  };
}
