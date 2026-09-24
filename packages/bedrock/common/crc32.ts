import { BITS_PER_BYTE, UINT8_MAX, UINT8_VALUE_COUNT, UINT32_MAX } from "./numeric-constants";

const crcTable = Uint32Array.from({ length: UINT8_VALUE_COUNT }, (_, value) => {
  let entry = value;
  for (let bit = 0; bit < BITS_PER_BYTE; bit++)
    entry = entry & 1 ? 0xedb88320 ^ (entry >>> 1) : entry >>> 1;
  return entry >>> 0;
});

/** Computes the standard CRC-32 checksum for arbitrary bytes. */
export function crc32(data: Uint8Array): number {
  let value = UINT32_MAX;
  for (const byte of data) value = crcTable[(value ^ byte) & UINT8_MAX] ^ (value >>> BITS_PER_BYTE);
  return (value ^ UINT32_MAX) >>> 0;
}
