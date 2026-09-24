import { unzlibSync, zlibSync } from "fflate";

/** A fixed output buffer prevents a forged compressed stream allocating unbounded memory. */
export function inflateTileData(bytes: Uint8Array, expected: number): Uint8Array {
  if (!Number.isSafeInteger(expected) || expected < 0 || bytes.length < 6)
    throw new Error("Invalid compressed tile data");
  const output = unzlibSync(bytes, { out: new Uint8Array(expected + 1) });
  if (output.length !== expected)
    throw new Error(`Inflated tile data is ${output.length} bytes; expected ${expected}`);
  let a = 1,
    b = 0;
  for (let i = 0; i < output.length; i++) {
    a = (a + output[i]) % 65521;
    b = (b + a) % 65521;
  }
  const checksum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    bytes.length - 4,
    false,
  );
  if (((b << 16) | a) >>> 0 !== checksum) throw new Error("Invalid zlib checksum");
  return output;
}
export const deflateTileData = (bytes: Uint8Array): Uint8Array => zlibSync(bytes);
