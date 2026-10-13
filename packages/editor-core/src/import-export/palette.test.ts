import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import type { Rgba } from "$/base/primitives";
import { decodeAsepriteSync } from "$/import-export/aseprite/decode";
import {
  PaletteFileFormat,
  readPaletteData,
  paletteSwatchImage,
  serializePaletteFile,
} from "$/import-export/palette";
import { decodePalettePng, decodePaletteTga } from "$/import-export/palette-raster";

const colors: readonly Rgba[] = [
  [0, 0, 0, 0],
  [17, 35, 71, 128],
  [255, 0, 0, 255],
];
describe("palette file workflows", () => {
  it("preserves alpha in GPL, PAL, and HEX's RGB-only policy", () => {
    for (const format of [PaletteFileFormat.Gpl, PaletteFileFormat.Pal])
      expect(readPaletteData(serializePaletteFile(colors, format), format)).toEqual(colors);
    expect(new TextDecoder().decode(serializePaletteFile(colors, PaletteFileFormat.Hex))).toBe(
      "000000\n112347\nff0000\n",
    );
    expect(
      readPaletteData(new TextEncoder().encode("# ABCDEF\nignore\ncolor: 112233 name\n"), "hex"),
    ).toEqual([
      [171, 205, 239, 255],
      [17, 34, 51, 255],
    ]);
  });
  it("encodes ACT and Animator Pro COL with their native headers and padding", () => {
    const act = serializePaletteFile(colors, PaletteFileFormat.Act);
    expect(act.length).toBe(772);
    expect(new DataView(act.buffer).getUint16(768)).toBe(3);
    expect(readPaletteData(act, "act")).toEqual(
      colors.map((color) => [color[0], color[1], color[2], 255]),
    );
    const col = serializePaletteFile(colors, PaletteFileFormat.Col);
    expect(col.length).toBe(776);
    expect(new DataView(col.buffer).getUint16(4, true)).toBe(0xb123);
    expect(readPaletteData(col, "col")?.slice(0, 3)).toEqual(
      colors.map((color) => [color[0], color[1], color[2], 255]),
    );
  });
  it("writes a swatch grid, original palette alpha, and the document's ASE profile", () => {
    const palette = Array.from(
      { length: 32 },
      (_, index) => [index, index + 1, index + 2, index % 2 ? 128 : 255] as Rgba,
    );
    const bytes = serializePaletteFile(palette, PaletteFileFormat.Aseprite, { type: "srgb" });
    // decodeAsepriteSync returns the decoded sprite itself.
    const sprite = decodeAsepriteSync(bytes);
    expect(sprite.width).toBe(16);
    expect(sprite.height).toBe(2);
    expect(sprite.colorProfile).toEqual({ type: "srgb" });
    expect(Array.from(sprite.frames[0].cels[0].asepritePixels ?? [])).toEqual(
      Array.from({ length: 32 }, (_, index) => index),
    );
    expect(readPaletteData(bytes, "ase")).toEqual(palette);
  });
  it("round-trips indexed PNG alpha without applying a display color conversion", () => {
    const bytes = serializePaletteFile(colors, PaletteFileFormat.Png, { type: "srgb" });
    expect(readPaletteData(bytes, "png")).toEqual(colors);
    const decoded = decodePalettePng(
      bytes,
      (compressed) => new Uint8Array(inflateSync(compressed)),
    )!;
    expect(decoded.alpha).toBe(true);
    expect(Array.from(decoded.pixels.data)).toEqual(colors.flat());
    const broken = bytes.slice();
    broken[broken.length - 1] ^= 1;
    expect(() =>
      decodePalettePng(broken, (compressed) => new Uint8Array(inflateSync(compressed))),
    ).toThrow();
  });
  it("produces palette images readable by the supported binary palette readers", () => {
    const expected = colors.map((color) => [color[0], color[1], color[2], 255]);
    for (const format of [
      PaletteFileFormat.Gif,
      PaletteFileFormat.Bmp,
      PaletteFileFormat.Ico,
      PaletteFileFormat.Pcx,
      PaletteFileFormat.Tga,
      PaletteFileFormat.Flc,
    ]) {
      expect(readPaletteData(serializePaletteFile(colors, format), format)?.slice(0, 3)).toEqual(
        expected,
      );
    }
    expect(
      decodePaletteTga(serializePaletteFile(colors, PaletteFileFormat.Tga))?.pixels.width,
    ).toBe(3);
    expect(paletteSwatchImage(colors).pixels.height).toBe(1);
  });
  it("saves a GIF palette that reads back in the same order, without a reserved index", () => {
    // Regression: palette GIFs used to gain a transparent index 0, shifting every color by one.
    for (const palette of [
      [
        [10, 20, 30, 255],
        [40, 50, 60, 255],
        [70, 80, 90, 255],
      ],
      Array.from({ length: 20 }, (_, i) => [i * 10, i, 255 - i, 255] as Rgba),
      colors,
    ] as Rgba[][]) {
      const read = readPaletteData(serializePaletteFile(palette, PaletteFileFormat.Gif), "gif")!;
      // GIF stores RGB only, padded to a power-of-two table.
      expect(read.slice(0, palette.length)).toEqual(
        palette.map((color) => [color[0], color[1], color[2], 255]),
      );
    }
  });
});
