import { deflateSync, Inflate } from "fflate";

const ZSTD_MAGIC = 0xfd2fb528;
const ZSTD_LEVEL = 19;
const ZSTD_FINAL_LEVELS = [20, 22] as const;
const MAX_FINAL_COMPRESSION_BYTES = 1024 * 1024;
const DEFLATE_LEVEL = 9;
const INFLATE_INPUT_CHUNK_BYTES = 128;
const CONTENT_SIZE_LENGTHS = [0, 2, 4, 8];
const DICTIONARY_LENGTHS = [0, 1, 2, 4];
const ZSTD_SINGLE_SEGMENT = 32;
const ZSTD_RESERVED_BITS = 24;
const ZSTD_CONTENT_SIZE_SHIFT = 6;
const TWO_BYTE_CONTENT_SIZE_OFFSET = 256;
const BYTE_BITS = 8;

enum ShareCompression {
  Stored,
  Deflate,
  Zstd,
}

let zstdModule: Promise<typeof import("@bokuweb/zstd-wasm")> | undefined;
function zstd() {
  zstdModule ??= import("@bokuweb/zstd-wasm").then(async (module) => {
    await module.init();
    return module;
  });
  return zstdModule;
}

export async function smallestShareCompression(input: Uint8Array): Promise<Uint8Array> {
  let method = ShareCompression.Stored;
  let bytes = input;
  const deflated = deflateSync(input, { level: DEFLATE_LEVEL });
  if (deflated.length < bytes.length) {
    method = ShareCompression.Deflate;
    bytes = deflated;
  }
  // Encoding remains usable when the optional WASM runtime cannot initialize.
  // A Zstd link always requires its decoder, so decoding never silently falls back.
  try {
    const compressed = (await zstd()).compress(input, ZSTD_LEVEL);
    if (compressed.length < bytes.length) {
      method = ShareCompression.Zstd;
      bytes = compressed;
    }
  } catch {
    // DEFLATE is implemented in JavaScript and does not require WebAssembly.
  }
  const result = new Uint8Array(bytes.length + 1);
  result[0] = method;
  result.set(bytes, 1);
  return result;
}

/** Spend the higher compression cost once, on the winning representation.
 * Small inputs keep the WASM working set bounded; larger projects retain level 19. */
export async function refineShareCompression(
  input: Uint8Array,
  best: Uint8Array,
): Promise<Uint8Array> {
  if (input.length > MAX_FINAL_COMPRESSION_BYTES) return best;
  try {
    const module = await zstd();
    for (const level of ZSTD_FINAL_LEVELS) {
      const bytes = module.compress(input, level);
      if (bytes.length + 1 >= best.length) continue;
      best = new Uint8Array(bytes.length + 1);
      best[0] = ShareCompression.Zstd;
      best.set(bytes, 1);
    }
  } catch {
    // The ordinary JavaScript result remains usable without WASM.
  }
  return best;
}

/** Reject unknown/unbounded frame sizes before the library allocates a WASM heap.
 * Its native ZSTD_decompress uses this verified size as the output capacity. */
function validateZstdSize(bytes: Uint8Array, maxBytes: number): void {
  if (bytes.length < 6) throw new Error("Invalid share data.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== ZSTD_MAGIC) throw new Error("Invalid share data.");
  const descriptor = bytes[4];
  if (descriptor & ZSTD_RESERVED_BITS) throw new Error("Invalid share data.");
  const single = !!(descriptor & ZSTD_SINGLE_SEGMENT);
  const flag = descriptor >>> ZSTD_CONTENT_SIZE_SHIFT;
  const length = flag === 0 && single ? 1 : CONTENT_SIZE_LENGTHS[flag];
  const offset = 5 + (single ? 0 : 1) + DICTIONARY_LENGTHS[descriptor & 3];
  if (!length || offset + length > bytes.length) throw new Error("Invalid share data.");
  let size = 0;
  for (let index = 0; index < length; index++)
    size += bytes[offset + index] * 2 ** (index * BYTE_BITS);
  if (length === 2) size += TWO_BYTE_CONTENT_SIZE_OFFSET;
  if (!Number.isSafeInteger(size) || size > maxBytes)
    throw new Error("This shared project is too large. Export a file instead.");
  // Non-single-segment frames may otherwise request a huge decoder window.
  if (!single) {
    const window = bytes[5];
    const base = 2 ** (10 + (window >>> 3));
    if (base + (base / 8) * (window & 7) > maxBytes) throw new Error("Invalid share data.");
  }
}

export async function decompressShare(input: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const bytes = input.subarray(1);
  if (input[0] === ShareCompression.Stored) {
    if (bytes.length > maxBytes) throw new Error("Invalid share data.");
    return bytes;
  }
  if (input[0] === ShareCompression.Zstd) {
    validateZstdSize(bytes, maxBytes);
    return (await zstd()).decompress(bytes, { defaultHeapSize: maxBytes });
  }
  if (input[0] !== ShareCompression.Deflate) throw new Error("Invalid share data.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const inflate = new Inflate((chunk) => {
    size += chunk.length;
    if (size > maxBytes)
      throw new Error("This shared project is too large. Export a file instead.");
    chunks.push(chunk);
  });
  for (let offset = 0; offset < bytes.length; offset += INFLATE_INPUT_CHUNK_BYTES)
    inflate.push(
      bytes.subarray(offset, offset + INFLATE_INPUT_CHUNK_BYTES),
      offset + INFLATE_INPUT_CHUNK_BYTES >= bytes.length,
    );
  if (!bytes.length) throw new Error("Invalid share data.");
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
