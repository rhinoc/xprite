import { BITS_PER_BYTE } from "$/base/numeric-constants";

/** Indexed/gray decoding retains source samples alongside the RGBA projection. */
export function asepriteCelDecodedBytes(width: number, height: number, depth: number): number {
  return width * height * (4 + (depth === 32 ? 0 : depth / BITS_PER_BYTE));
}
