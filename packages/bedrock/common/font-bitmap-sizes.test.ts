import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { readFontBitmapSizes } from "./font-bitmap-sizes";

function fontFile(tables: readonly [string, Uint8Array][]): Uint8Array {
  const directorySize = 12 + tables.length * 16;
  const bytes = new Uint8Array(
    directorySize + tables.reduce((length, [, table]) => length + table.length, 0),
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, tables.length);
  let offset = directorySize;
  tables.forEach(([tag, table], index) => {
    const record = 12 + index * 16;
    for (let character = 0; character < 4; character++)
      bytes[record + character] = tag.charCodeAt(character);
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, table.length);
    bytes.set(table, offset);
    offset += table.length;
  });
  return bytes;
}

function bitmapLocation(version: number, grids: readonly [number, number][]): Uint8Array {
  const bytes = new Uint8Array(8 + grids.length * 48);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, version);
  view.setUint32(4, grids.length);
  grids.forEach(([x, y], index) => {
    view.setUint8(8 + index * 48 + 44, x);
    view.setUint8(8 + index * 48 + 45, y);
  });
  return bytes;
}

function sbix(sizes: readonly number[]): Uint8Array {
  const headerSize = 8 + sizes.length * 4;
  const bytes = new Uint8Array(headerSize + sizes.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 1);
  view.setUint32(4, sizes.length);
  sizes.forEach((size, index) => {
    const offset = headerSize + index * 4;
    view.setUint32(8 + index * 4, offset);
    view.setUint16(offset, size);
    view.setUint16(offset + 2, 96);
  });
  return bytes;
}

describe("SFNT bitmap size metadata", () => {
  it("combines all three bitmap tables, ignoring rectangular and zero-size grids", () => {
    const bytes = fontFile([
      [
        "EBLC",
        bitmapLocation(2, [
          [8, 8],
          [9, 10],
          [0, 0],
        ]),
      ],
      [
        "CBLC",
        bitmapLocation(3, [
          [10, 10],
          [8, 8],
        ]),
      ],
      ["sbix", sbix([12, 10, 0])],
    ]);
    const backing = new Uint8Array(bytes.length + 7);
    backing.set(bytes, 7);
    assert.deepEqual(readFontBitmapSizes(backing.subarray(7)), [8, 10, 12]);
  });

  it("does not interpret outline design units or minimum readable size as native sizes", () => {
    const head = new Uint8Array(54);
    const view = new DataView(head.buffer);
    view.setUint16(18, 2048);
    view.setUint16(46, 8);
    assert.deepEqual(readFontBitmapSizes(fontFile([["head", head]])), []);
  });

  it("ignores unsupported bitmap versions", () => {
    assert.deepEqual(readFontBitmapSizes(fontFile([["EBLC", bitmapLocation(4, [[8, 8]])]])), []);
    const table = sbix([12]);
    new DataView(table.buffer).setUint16(0, 2);
    assert.deepEqual(readFontBitmapSizes(fontFile([["sbix", table]])), []);
  });

  it("rejects incomplete directories, table ranges and overflowing record counts", () => {
    const bytes = fontFile([["EBLC", bitmapLocation(2, [[8, 8]])]]);
    assert.deepEqual(readFontBitmapSizes(bytes.subarray(0, 10)), []);
    assert.deepEqual(readFontBitmapSizes(bytes.subarray(0, 27)), []);
    new DataView(bytes.buffer).setUint32(20, 0xffffffff);
    assert.deepEqual(readFontBitmapSizes(bytes), []);
    const table = bitmapLocation(2, [[8, 8]]);
    new DataView(table.buffer).setUint32(4, 0xffffffff);
    assert.deepEqual(readFontBitmapSizes(fontFile([["EBLC", table]])), []);
  });

  it("rejects malformed sbix offsets without leaking partial sizes", () => {
    const table = sbix([8, 12]);
    new DataView(table.buffer).setUint32(12, 0xffffffff);
    assert.deepEqual(readFontBitmapSizes(fontFile([["sbix", table]])), []);
  });
});
