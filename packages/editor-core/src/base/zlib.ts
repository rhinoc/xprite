import { unzlibSync } from "fflate";

const ADLER_MODULUS = 65521;
const ADLER_BLOCK_BYTES = 5552;
const ZLIB_MIN_BYTES = 6;

/** Exact-size output and checksum validation, including forged oversized streams. */
export function inflateZlibExact(bytes: Uint8Array, expected: number): Uint8Array {
  if (!Number.isSafeInteger(expected) || expected < 0 || bytes.length < ZLIB_MIN_BYTES)
    throw new Error("Invalid compressed pixel data");
  const output = unzlibSync(bytes, { out: new Uint8Array(expected + 1) });
  if (output.length !== expected)
    throw new Error(`Inflated pixel data is ${output.length} bytes; expected ${expected}`);
  let a = 1,
    b = 0;
  for (let start = 0; start < output.length; start += ADLER_BLOCK_BYTES) {
    const end = Math.min(output.length, start + ADLER_BLOCK_BYTES);
    for (let i = start; i < end; i++) {
      a += output[i];
      b += a;
    }
    a %= ADLER_MODULUS;
    b %= ADLER_MODULUS;
  }
  const checksum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    bytes.length - 4,
    false,
  );
  if (((b << 16) | a) >>> 0 !== checksum) throw new Error("Invalid zlib checksum");
  return output;
}
