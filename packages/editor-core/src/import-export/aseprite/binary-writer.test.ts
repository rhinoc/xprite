import { describe, expect, it } from "vitest";

import { Writer } from "$/import-export/aseprite/binary-writer";

describe("ASE binary byte spans", () => {
  it("patches a header across a block boundary without changing the raster span", () => {
    const writer = new Writer();
    for (let index = 0; index < 4094; index++) writer.u8(0);
    writer.u32(0);
    const raster = new Uint8Array(1024 * 1024).fill(173);
    writer.bytes(raster.subarray(7, raster.length - 9));
    writer.patchU32(4094, 0x89abcdef);
    const bytes = writer.toBytes();
    expect(new DataView(bytes.buffer).getUint32(4094, true)).toBe(0x89abcdef);
    expect(bytes.length).toBe(4098 + raster.length - 16);
    expect(bytes.subarray(4098)).toEqual(raster.subarray(7, raster.length - 9));
    expect(raster.every((value) => value === 173)).toBe(true);
  });
});
