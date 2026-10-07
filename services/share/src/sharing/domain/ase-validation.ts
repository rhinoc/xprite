import { ShareError, ShareErrorCode } from "$/sharing/domain/errors";
import {
  ASE_HEADER_BYTES,
  ASE_MAGIC,
  CHUNK_HEADER_BYTES,
  FRAME_HEADER_BYTES,
  FRAME_MAGIC,
  MAX_CANVAS_PIXELS,
  MAX_DECODED_BYTES,
  MAX_FILE_BYTES,
} from "$/sharing/domain/policy";

const HEADER = { size: 0, magic: 4, frames: 6, width: 8, height: 10, depth: 12 } as const;
const FRAME = { size: 0, magic: 4, oldChunks: 6, newChunks: 12 } as const;
const CHUNK = { size: 0, type: 4 } as const;
const CEL = { headerBytes: 16, type: 7, width: 16, height: 18, dimensionsBytes: 4 } as const;
const LINKED_CEL_BYTES = 18;
const EXTENDED_CHUNK_COUNT = 0xffff;

enum ChunkType {
  Cel = 0x2005,
}
enum CelType {
  Raw = 0,
  Linked = 1,
  Compressed = 2,
  Tilemap = 3,
}
enum ColorDepth {
  Indexed = 8,
  Grayscale = 16,
  Rgba = 32,
}
const BYTES_PER_PIXEL: Record<ColorDepth, number> = {
  [ColorDepth.Indexed]: 1,
  [ColorDepth.Grayscale]: 2,
  [ColorDepth.Rgba]: 4,
};

function requireValid(condition: boolean): asserts condition {
  if (!condition)
    throw new ShareError(ShareErrorCode.InvalidFile, "Invalid or unsupported ASE file structure.");
}

/** Inspect bounded file structure, not pixel contents. No server-side inflate.
 * Viewers must still use their full parser and decoded-memory budget. */
export function validateAse(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_FILE_BYTES)
    throw new ShareError(ShareErrorCode.FileTooLarge, "The file exceeds 250 KB.");
  requireValid(bytes.byteLength >= ASE_HEADER_BYTES + FRAME_HEADER_BYTES);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  requireValid(
    view.getUint32(HEADER.size, true) === bytes.byteLength &&
      view.getUint16(HEADER.magic, true) === ASE_MAGIC,
  );
  const frames = view.getUint16(HEADER.frames, true);
  const width = view.getUint16(HEADER.width, true);
  const height = view.getUint16(HEADER.height, true);
  const depth = view.getUint16(HEADER.depth, true) as ColorDepth;
  requireValid(frames > 0 && width > 0 && height > 0 && width * height <= MAX_CANVAS_PIXELS);
  requireValid(
    depth === ColorDepth.Indexed || depth === ColorDepth.Grayscale || depth === ColorDepth.Rgba,
  );
  let decodedBytes = 0;
  let frameStart = ASE_HEADER_BYTES;
  for (let frame = 0; frame < frames; frame++) {
    requireValid(frameStart + FRAME_HEADER_BYTES <= bytes.byteLength);
    const frameSize = view.getUint32(frameStart + FRAME.size, true);
    const frameEnd = frameStart + frameSize;
    requireValid(
      frameSize >= FRAME_HEADER_BYTES &&
        frameEnd <= bytes.byteLength &&
        view.getUint16(frameStart + FRAME.magic, true) === FRAME_MAGIC,
    );
    const oldCount = view.getUint16(frameStart + FRAME.oldChunks, true);
    const newCount = view.getUint32(frameStart + FRAME.newChunks, true);
    const chunks = newCount || oldCount;
    requireValid(oldCount !== EXTENDED_CHUNK_COUNT || newCount > 0);
    let chunkStart = frameStart + FRAME_HEADER_BYTES;
    for (let chunk = 0; chunk < chunks; chunk++) {
      requireValid(chunkStart + CHUNK_HEADER_BYTES <= frameEnd);
      const chunkSize = view.getUint32(chunkStart + CHUNK.size, true);
      const chunkEnd = chunkStart + chunkSize;
      requireValid(chunkSize >= CHUNK_HEADER_BYTES && chunkEnd <= frameEnd);
      if (view.getUint16(chunkStart + CHUNK.type, true) === ChunkType.Cel) {
        const payload = chunkStart + CHUNK_HEADER_BYTES;
        const length = chunkSize - CHUNK_HEADER_BYTES;
        requireValid(length >= CEL.headerBytes);
        const type = view.getUint16(payload + CEL.type, true) as CelType;
        requireValid(
          type === CelType.Raw ||
            type === CelType.Linked ||
            type === CelType.Compressed ||
            type === CelType.Tilemap,
        );
        if (type === CelType.Linked) {
          requireValid(
            length >= LINKED_CEL_BYTES && view.getUint16(payload + CEL.headerBytes, true) < frames,
          );
        } else {
          requireValid(length >= CEL.headerBytes + CEL.dimensionsBytes);
          const celPixels =
            view.getUint16(payload + CEL.width, true) * view.getUint16(payload + CEL.height, true);
          const size =
            celPixels *
            (type === CelType.Tilemap ? BYTES_PER_PIXEL[ColorDepth.Rgba] : BYTES_PER_PIXEL[depth]);
          decodedBytes += size;
          requireValid(decodedBytes <= MAX_DECODED_BYTES);
          if (type === CelType.Raw)
            requireValid(length === CEL.headerBytes + CEL.dimensionsBytes + size);
        }
      }
      chunkStart = chunkEnd;
    }
    requireValid(chunkStart === frameEnd);
    frameStart = frameEnd;
  }
  requireValid(frameStart === bytes.byteLength);
}
