import {
  MAX_WEBP_FRAME_DURATION,
  MAX_WEBP_LOOP_COUNT,
  assertWebpDimensions,
  webpChunk,
  webpRiff,
  webpUint24,
} from "$/import-export/image/webp-container";
import { assertAnimationLoopCount } from "$/timeline/animation-loop";
import { joinBytes } from "@xprite/bedrock/common/join-bytes";
export { WebpCompression, MAX_WEBP_LOOP_COUNT } from "$/import-export/image/webp-container";

export interface EncodedWebpFrame {
  readonly bytes: Uint8Array;
  readonly duration: number;
}

function frameChunks(bytes: Uint8Array, width: number, height: number) {
  if (
    bytes.length < 12 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP"
  )
    throw new Error("Invalid encoded WebP frame");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = view.getUint32(4, true) + 8;
  if (end !== bytes.length) throw new Error("Invalid encoded WebP RIFF size");
  const chunks: Uint8Array[] = [];
  let image = false,
    alpha = false,
    alphaChunk = false;
  for (let offset = 12; offset < end;) {
    if (offset + 8 > end) throw new Error("Truncated encoded WebP chunk");
    const size = view.getUint32(offset + 4, true),
      start = offset + 8,
      next = start + size + (size & 1);
    if (next > end) throw new Error("Truncated encoded WebP payload");
    const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (kind === "ANIM" || kind === "ANMF")
      throw new Error("Animation frames must be still WebP images");
    if (kind === "ALPH") {
      if (alphaChunk || image) throw new Error("Invalid WebP alpha chunk order");
      alphaChunk = true;
      alpha = true;
      chunks.push(bytes.subarray(offset, next));
    }
    if (kind === "VP8 " || kind === "VP8L") {
      if (image) throw new Error("Encoded WebP frame contains multiple bitstreams");
      image = true;
      let w: number, h: number;
      if (kind === "VP8L") {
        if (alphaChunk) throw new Error("VP8L must not have a separate alpha chunk");
        if (size < 5 || bytes[start] !== 0x2f) throw new Error("Invalid VP8L frame header");
        const dimensions = view.getUint32(start + 1, true);
        if (dimensions >>> 29) throw new Error("Unsupported VP8L version");
        w = (dimensions & 0x3fff) + 1;
        h = ((dimensions >>> 14) & 0x3fff) + 1;
        alpha ||= !!(dimensions & 0x1000_0000);
      } else {
        if (
          size < 10 ||
          bytes[start + 3] !== 0x9d ||
          bytes[start + 4] !== 1 ||
          bytes[start + 5] !== 0x2a
        )
          throw new Error("Invalid VP8 frame header");
        w = view.getUint16(start + 6, true) & 0x3fff;
        h = view.getUint16(start + 8, true) & 0x3fff;
      }
      if (w !== width || h !== height)
        throw new Error("Encoded WebP frame dimensions do not match");
      chunks.push(bytes.subarray(offset, next));
    }
    offset = next;
  }
  if (!image) throw new Error("Encoded WebP frame has no image bitstream");
  return { chunks: joinBytes(chunks), alpha };
}

/** Full-canvas SOURCE frames prevent alpha accumulation and preserve every selected frame/duration. */
export function assembleWebpAnimation(
  frames: readonly EncodedWebpFrame[],
  width: number,
  height: number,
  loopCount = 0,
): Uint8Array {
  assertWebpDimensions(width, height);
  assertAnimationLoopCount(loopCount);
  if (loopCount > MAX_WEBP_LOOP_COUNT)
    throw new RangeError("WebP supports at most 65535 complete plays; use 0 for infinity");
  if (!frames.length) throw new Error("WebP export requires at least one frame");
  const images = frames.map((frame) => {
    if (
      !Number.isSafeInteger(frame.duration) ||
      frame.duration < 1 ||
      frame.duration > MAX_WEBP_FRAME_DURATION
    )
      throw new RangeError("WebP frame duration must be between 1 and 16777215 ms");
    return frameChunks(frame.bytes, width, height);
  });
  const extended = new Uint8Array(10);
  extended[0] = 2 | (images.some((image) => image.alpha) ? 16 : 0);
  webpUint24(extended, 4, width - 1);
  webpUint24(extended, 7, height - 1);
  const control = new Uint8Array(6);
  new DataView(control.buffer).setUint16(4, loopCount, true);
  const chunks = [webpChunk("VP8X", extended), webpChunk("ANIM", control)];
  frames.forEach((frame, index) => {
    const header = new Uint8Array(16);
    webpUint24(header, 6, width - 1);
    webpUint24(header, 9, height - 1);
    webpUint24(header, 12, frame.duration);
    header[15] = 2; // Replace the complete canvas; no disposal needed.
    chunks.push(webpChunk("ANMF", joinBytes([header, images[index].chunks])));
  });
  return webpRiff(chunks);
}
