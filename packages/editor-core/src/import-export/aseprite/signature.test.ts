import { describe, expect, it } from "vitest";

import {
  ASEPRITE_SIGNATURE_BYTES,
  AsepriteCodecError,
  decodeAsepriteSync,
  isAsepriteData,
} from "$/import-export/aseprite/decode";

// File size followed by the little-endian 0xa5e0 signature from the format specification.
const ASEPRITE_PREFIX = new Uint8Array([128, 0, 0, 0, 0xe0, 0xa5]);

describe("Aseprite content identification", () => {
  it("recognizes a file prefix inside a larger byte buffer", () => {
    const container = new Uint8Array(ASEPRITE_PREFIX.length + 11);
    container.set(ASEPRITE_PREFIX, 7);
    const prefix = container.subarray(7, 7 + ASEPRITE_SIGNATURE_BYTES);
    expect(isAsepriteData(prefix)).toBe(true);
    expect(isAsepriteData(container)).toBe(false);
  });

  it("leaves file integrity checks to the decoder after identifying a truncated prefix", () => {
    const prefix = ASEPRITE_PREFIX;
    expect(isAsepriteData(prefix)).toBe(true);
    expect(() => decodeAsepriteSync(prefix)).toThrow(AsepriteCodecError);
    for (let length = 0; length < ASEPRITE_SIGNATURE_BYTES; length++)
      expect(isAsepriteData(prefix.subarray(0, length))).toBe(false);
    expect(isAsepriteData(new TextEncoder().encode("GIF89a"))).toBe(false);
    expect(isAsepriteData(new Uint8Array([128, 0, 0, 0, 0xa5, 0xe0]))).toBe(false);
  });
});
