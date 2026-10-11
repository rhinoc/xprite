import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { MAX_PALETTE_COLORS, assertPaletteAllocation } from "$/color/palette-resize";
import { encodeAsepriteSync } from "$/import-export/aseprite/encode";
import {
  AsepriteCelType,
  AsepriteLayerType,
  type AsepriteColorProfile,
  type AsepriteSprite,
} from "$/import-export/aseprite/model";
import { encodeGif, storeDeflate } from "$/import-export/image/encoders";
import { crc32 } from "@xprite/bedrock/common/crc32";
import { joinBytes } from "@xprite/bedrock/common/join-bytes";
import { decodeUtf8 } from "@xprite/bedrock/common/utf8";

export enum PaletteFileFormat {
  Aseprite = "ase",
  Act = "act",
  Col = "col",
  Gpl = "gpl",
  Hex = "hex",
  Pal = "pal",
  Png = "png",
  Gif = "gif",
  Bmp = "bmp",
  Pcx = "pcx",
  Tga = "tga",
  Ico = "ico",
  Svg = "svg",
  Css = "css",
  Fli = "fli",
  Flc = "flc",
}
const LEGACY_COLORS = 256;
const RGB_CHANNELS = 3;
const RGBA_CHANNELS = 4;
const COL_MAGIC = 0xb123;
const BLACK: Rgba = [0, 0, 0, UINT8_MAX];
const PALETTE_COLUMNS = 16;
const ascii = (value: string) => Uint8Array.from(value, (character) => character.charCodeAt(0));
const u32 = (value: number) => Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value);
const byte = (value: string): number => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > UINT8_MAX)
    throw new Error("Invalid palette channel.");
  return number;
};
function validate(colors: readonly Rgba[]): void {
  if (
    !colors.length ||
    colors.length > MAX_PALETTE_COLORS ||
    colors.some((color) =>
      color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > UINT8_MAX),
    )
  )
    throw new Error("Invalid palette.");
}
function rgbTriples(
  bytes: Uint8Array,
  count: number,
  offset = 0,
  stride = RGB_CHANNELS,
  bgr = false,
): Rgba[] {
  if (count < 1 || count > MAX_PALETTE_COLORS || offset + count * stride > bytes.length)
    throw new Error("Incomplete palette data.");
  return Array.from({ length: count }, (_, index) => {
    const at = offset + index * stride;
    return [bytes[at + (bgr ? 2 : 0)], bytes[at + 1], bytes[at + (bgr ? 0 : 2)], UINT8_MAX];
  });
}
export function readPaletteData(bytes: Uint8Array, extension: string): Rgba[] | null {
  const format = extension.toLowerCase().replace(/^\./, "");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    (format === PaletteFileFormat.Aseprite || format === "aseprite") &&
    bytes.length >= 144 &&
    view.getUint16(4, true) === 0xa5e0
  ) {
    const end = 128 + view.getUint32(128, true);
    if (end > bytes.length || view.getUint16(132, true) !== 0xf1fa)
      throw new Error("Invalid Aseprite palette frame.");
    let colors: Rgba[] | null = null;
    let at = 144;
    let modern = false;
    while (at + 6 <= end) {
      const size = view.getUint32(at, true),
        type = view.getUint16(at + 4, true);
      if (size < 6 || at + size > end) throw new Error("Invalid Aseprite palette chunk.");
      let cursor = at + 6;
      if (type === 0x2019) {
        const count = view.getUint32(cursor, true),
          from = view.getUint32(cursor + 4, true),
          to = view.getUint32(cursor + 8, true);
        cursor += 20;
        assertPaletteAllocation(count);
        if (to < from || to >= count) throw new Error("Invalid Aseprite palette range.");
        colors = Array.from({ length: count }, (_, index) => colors?.[index] ?? BLACK);
        for (let index = from; index <= to; index++) {
          if (cursor + 6 > at + size) throw new Error("Incomplete Aseprite palette.");
          const flags = view.getUint16(cursor, true);
          colors[index] = [
            bytes[cursor + 2],
            bytes[cursor + 3],
            bytes[cursor + 4],
            bytes[cursor + 5],
          ];
          cursor += 6;
          if (flags & 1) {
            if (cursor + 2 > at + size) throw new Error("Incomplete Aseprite palette name.");
            const length = view.getUint16(cursor, true);
            cursor += 2 + length;
          }
          if (cursor > at + size) throw new Error("Incomplete Aseprite palette name.");
        }
        modern = true;
      } else if (!modern && (type === 4 || type === 17)) {
        const packets = view.getUint16(cursor, true);
        cursor += 2;
        colors ??= Array.from({ length: view.getUint16(32, true) || LEGACY_COLORS }, () => BLACK);
        let index = 0;
        for (let packet = 0; packet < packets; packet++) {
          index += bytes[cursor++];
          const count = bytes[cursor++] || LEGACY_COLORS;
          for (let color = 0; color < count; color++) {
            if (cursor + 3 > at + size) throw new Error("Incomplete Aseprite palette.");
            const rgb = Array.from(bytes.subarray(cursor, cursor + 3), (value) =>
              type === 4 ? (value << 2) | (value >>> 4) : value,
            );
            while (colors.length <= index) colors.push(BLACK);
            colors[index++] = [rgb[0], rgb[1], rgb[2], UINT8_MAX];
            cursor += 3;
          }
        }
      }
      at += size;
    }
    return colors;
  }
  if (format === PaletteFileFormat.Act) {
    if (bytes.length < LEGACY_COLORS * RGB_CHANNELS) throw new Error("Incomplete ACT palette.");
    const count =
      bytes.length >= 770 ? Math.min(LEGACY_COLORS, view.getUint16(768)) : LEGACY_COLORS;
    return rgbTriples(bytes, count);
  }
  if (format === PaletteFileFormat.Col) {
    if (bytes.length === 768)
      return rgbTriples(bytes, LEGACY_COLORS).map(
        (color) =>
          [
            ...color.slice(0, 3).map((channel) => {
              const six = Math.min(63, channel);
              return (six << 2) | (six >> 4);
            }),
            UINT8_MAX,
          ] as unknown as Rgba,
      );
    if (
      bytes.length < 8 ||
      view.getUint16(4, true) !== COL_MAGIC ||
      view.getUint16(6, true) !== 0 ||
      (bytes.length - 8) % RGB_CHANNELS
    )
      throw new Error("Invalid COL palette.");
    return rgbTriples(bytes, Math.min(LEGACY_COLORS, (bytes.length - 8) / RGB_CHANNELS), 8);
  }
  if (
    [PaletteFileFormat.Gpl, PaletteFileFormat.Pal, PaletteFileFormat.Hex].some(
      (type) => type === format,
    )
  ) {
    const lines = decodeUtf8(bytes)
      .replace(/^\uFEFF/, "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim());
    let colors: Rgba[];
    if (format === PaletteFileFormat.Hex)
      colors = lines.flatMap((line) => {
        const match = /[\da-f]{6}/i.exec(line);
        if (!match) return [];
        const value = Number.parseInt(match[0], 16);
        return [[value >>> 16, (value >>> 8) & UINT8_MAX, value & UINT8_MAX, UINT8_MAX] as Rgba];
      });
    else {
      const gpl = format === PaletteFileFormat.Gpl;
      if (gpl ? lines[0] !== "GIMP Palette" : lines[0] !== "JASC-PAL" || lines[1] !== "0100")
        throw new Error("Invalid palette header.");
      const rgba = !gpl || lines.some((line) => /^Channels:\s*RGBA$/i.test(line));
      colors = lines
        .slice(gpl ? 1 : 3)
        .filter((line) => line && !line.startsWith("#") && !/^[A-Za-z][A-Za-z ]*:/.test(line))
        .map((line) => {
          const values = line.split(/\s+/);
          if (values.length < 3) throw new Error("Invalid palette entry.");
          return [
            byte(values[0]),
            byte(values[1]),
            byte(values[2]),
            rgba && values[3] !== undefined ? byte(values[3]) : UINT8_MAX,
          ];
        });
    }
    validate(colors);
    return colors;
  }
  if (format === PaletteFileFormat.Png && bytes.length > 8) {
    let colors: Rgba[] | null = null;
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = view.getUint32(at);
      const end = at + 12 + length;
      if (end > bytes.length) throw new Error("Incomplete PNG chunk.");
      const type = decodeUtf8(bytes.subarray(at + 4, at + 8));
      if (type === "PLTE") colors = rgbTriples(bytes, length / RGB_CHANNELS, at + 8);
      if (type === "tRNS" && colors)
        colors = colors.map((color, index) => [
          color[0],
          color[1],
          color[2],
          index < length ? bytes[at + 8 + index] : UINT8_MAX,
        ]);
      at = end;
    }
    return colors;
  }
  if (format === PaletteFileFormat.Gif && bytes.length >= 13) {
    const size = bytes[10] & 128 ? 1 << ((bytes[10] & 7) + 1) : 0;
    let colors = size ? rgbTriples(bytes, size, 13) : null;
    let transparent = -1;
    let at = 13 + size * RGB_CHANNELS;
    while (at < bytes.length) {
      if (bytes[at] === 44) {
        if (at + 10 > bytes.length) throw new Error("Incomplete GIF image.");
        if (bytes[at + 9] & 128)
          colors = rgbTriples(bytes, 1 << ((bytes[at + 9] & 7) + 1), at + 10);
        return (
          colors?.map((color, index) => [
            color[0],
            color[1],
            color[2],
            index === transparent ? 0 : UINT8_MAX,
          ]) ?? null
        );
      }
      if (bytes[at] !== 33) break;
      if (bytes[at + 1] === 249 && bytes[at + 2] === 4 && bytes[at + 3] & 1)
        transparent = bytes[at + 6];
      at += 2;
      while (at < bytes.length && bytes[at]) at += bytes[at] + 1;
      at++;
    }
    return colors;
  }
  if (format === PaletteFileFormat.Bmp && bytes.length >= 54) {
    const bits = view.getUint16(28, true);
    if (bits > 8) return null;
    const count = view.getUint32(46, true) || 1 << bits;
    return rgbTriples(bytes, count, 14 + view.getUint32(14, true), 4, true);
  }
  if (format === PaletteFileFormat.Pcx && bytes.length >= 128) {
    if (bytes[3] === 8 && bytes[65] === 1 && bytes[bytes.length - 769] === 12)
      return rgbTriples(bytes, LEGACY_COLORS, bytes.length - 768);
    if (bytes[3] < 8) return rgbTriples(bytes, 16, 16);
    return null;
  }
  if (format === PaletteFileFormat.Tga && bytes.length >= 18 && bytes[1] === 1) {
    const count = view.getUint16(5, true);
    const depth = bytes[7];
    const start = 18 + bytes[0];
    let colors: Rgba[];
    if (depth === 15 || depth === 16) {
      if (start + count * 2 > bytes.length) throw new Error("Incomplete TGA palette.");
      colors = Array.from({ length: count }, (_, index) => {
        const value = view.getUint16(start + index * 2, true),
          expand = (v: number) => (v << 3) | (v >>> 2);
        return [
          expand((value >>> 10) & 31),
          expand((value >>> 5) & 31),
          expand(value & 31),
          UINT8_MAX,
        ];
      });
    } else {
      if (depth !== 24 && depth !== 32) return null;
      colors = rgbTriples(bytes, count, start, depth / 8, true);
      if (depth === 32)
        colors = colors.map((color, index) => [
          color[0],
          color[1],
          color[2],
          bytes[start + index * 4 + 3],
        ]);
    }
    return [...Array.from({ length: view.getUint16(3, true) }, () => BLACK), ...colors];
  }
  if (format === PaletteFileFormat.Ico && bytes.length >= 62) {
    const offset = view.getUint32(18, true);
    if (offset + 40 > bytes.length) throw new Error("Incomplete ICO image.");
    if (bytes[offset] === 137 && bytes[offset + 1] === 80)
      return readPaletteData(bytes.subarray(offset), PaletteFileFormat.Png);
    const bits = view.getUint16(offset + 14, true);
    if (bits > 8) return null;
    return rgbTriples(
      bytes,
      view.getUint32(offset + 32, true) || 1 << bits,
      offset + view.getUint32(offset, true),
      4,
      true,
    );
  }
  if (
    (format === PaletteFileFormat.Fli || format === PaletteFileFormat.Flc) &&
    bytes.length >= 144
  ) {
    const colors: Rgba[] = Array.from({ length: LEGACY_COLORS }, () => BLACK);
    let frame = format === PaletteFileFormat.Flc ? view.getUint32(80, true) || 128 : 128;
    while (frame + 16 <= bytes.length && view.getUint16(frame + 4, true) !== 0xf1fa) {
      const size = view.getUint32(frame, true);
      if (size < 16) throw new Error("Invalid FLI frame.");
      frame += size;
    }
    if (frame + 16 > bytes.length) throw new Error("Missing FLI frame.");
    let at = frame + 16;
    for (
      let chunk = 0;
      chunk < view.getUint16(frame + 6, true) && at + 6 <= bytes.length;
      chunk++
    ) {
      const size = view.getUint32(at, true);
      const type = view.getUint16(at + 4, true);
      if (size < 6 || at + size > bytes.length) throw new Error("Invalid FLI chunk.");
      if (type === 4 || type === 11) {
        let cursor = at + 8;
        let index = 0;
        for (let packet = 0; packet < view.getUint16(at + 6, true); packet++) {
          index += bytes[cursor++];
          const count = bytes[cursor++] || LEGACY_COLORS;
          for (let color = 0; color < count; color++) {
            if (cursor + 3 > at + size || index >= LEGACY_COLORS)
              throw new Error("Incomplete FLI palette.");
            const rgb = Array.from(bytes.subarray(cursor, cursor + 3), (value) =>
              type === 11 ? (value << 2) | (value >>> 4) : value,
            );
            colors[index++] = [rgb[0], rgb[1], rgb[2], UINT8_MAX];
            cursor += 3;
          }
        }
      }
      at += size;
    }
    return colors;
  }
  return null;
}
export function paletteSwatchImage(
  colors: readonly Rgba[],
  columns = PALETTE_COLUMNS,
): { pixels: PixelBuffer; indices: Uint8Array } {
  validate(colors);
  const width = Math.max(1, Math.min(colors.length, columns));
  const height = Math.ceil(colors.length / width);
  const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  const indices = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index++) {
    const color = colors[index] ?? (colors.length <= LEGACY_COLORS ? colors[0]! : [0, 0, 0, 0]);
    data.set(
      [color[0], color[1], color[2], colors.length <= LEGACY_COLORS ? UINT8_MAX : color[3]],
      index * RGBA_CHANNELS,
    );
    indices[index] = index < colors.length ? index : 0;
  }
  return { pixels: { width, height, data }, indices };
}
function pngChunk(type: string, bytes: Uint8Array): Uint8Array {
  const payload = joinBytes([ascii(type), bytes]);
  return joinBytes([u32(bytes.length), payload, u32(crc32(payload))]);
}
function palettePng(colors: readonly Rgba[], profile?: AsepriteColorProfile): Uint8Array {
  const { pixels, indices } = paletteSwatchImage(colors);
  const indexed = colors.length <= LEGACY_COLORS;
  const stride = pixels.width * (indexed ? 1 : RGB_CHANNELS);
  const rgb = indexed ? indices : new Uint8Array(pixels.width * pixels.height * RGB_CHANNELS);
  if (!indexed)
    for (let index = 0; index < pixels.width * pixels.height; index++)
      rgb.set(
        pixels.data.subarray(index * RGBA_CHANNELS, index * RGBA_CHANNELS + RGB_CHANNELS),
        index * RGB_CHANNELS,
      );
  const scanlines = new Uint8Array((stride + 1) * pixels.height);
  for (let y = 0; y < pixels.height; y++)
    scanlines.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const parts = [
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    pngChunk(
      "IHDR",
      joinBytes([
        u32(pixels.width),
        u32(pixels.height),
        Uint8Array.of(8, indexed ? 3 : 2, 0, 0, 0),
      ]),
    ),
  ];
  if (profile?.type === "icc")
    parts.push(
      pngChunk(
        "iCCP",
        joinBytes([ascii("Palette\0"), Uint8Array.of(0), storeDeflate(profile.data)]),
      ),
    );
  else if (profile?.type === "srgb") parts.push(pngChunk("sRGB", Uint8Array.of(0)));
  if (profile?.gamma) parts.push(pngChunk("gAMA", u32(Math.round(100000 / profile.gamma))));
  if (indexed)
    parts.push(pngChunk("PLTE", Uint8Array.from(colors.flatMap((color) => color.slice(0, 3)))));
  if (indexed && colors.some((color) => color[3] !== UINT8_MAX))
    parts.push(pngChunk("tRNS", Uint8Array.from(colors.map((color) => color[3]))));
  parts.push(pngChunk("IDAT", storeDeflate(scanlines)), pngChunk("IEND", new Uint8Array()));
  return joinBytes(parts);
}
export function paletteSprite(
  colors: readonly Rgba[],
  profile?: AsepriteColorProfile,
): AsepriteSprite {
  const { pixels, indices } = paletteSwatchImage(colors);
  const indexed = colors.length <= LEGACY_COLORS;
  return {
    width: pixels.width,
    height: pixels.height,
    depth: indexed ? 8 : 32,
    flags: 1,
    format: "ase",
    tags: [],
    chunks: [],
    colorProfile: profile,
    header: {
      fileSize: 0,
      magic: 0xa5e0,
      speed: 100,
      next: 0,
      frit: 0,
      transparentIndex: 0,
      ncolors: colors.length,
      pixelWidth: 1,
      pixelHeight: 1,
      gridX: 0,
      gridY: 0,
      gridWidth: 16,
      gridHeight: 16,
      ignore: [0, 0, 0],
    },
    palette: { entries: colors.map(([red, green, blue, alpha]) => ({ red, green, blue, alpha })) },
    layers: [
      {
        index: 0,
        type: AsepriteLayerType.Image,
        flags: 11,
        visible: true,
        editable: true,
        locked: false,
        background: true,
        collapsed: false,
        reference: false,
        continuous: false,
        name: "Background",
        childLevel: 0,
        blendMode: 0,
        opacity: UINT8_MAX,
        defaultWidth: 0,
        defaultHeight: 0,
      },
    ],
    frames: [
      {
        index: 0,
        duration: 100,
        cels: [
          {
            layerIndex: 0,
            x: 0,
            y: 0,
            opacity: UINT8_MAX,
            zIndex: 0,
            type: AsepriteCelType.Raw,
            width: pixels.width,
            height: pixels.height,
            pixels: new Uint8Array(pixels.data),
            asepritePixels: indexed ? indices : undefined,
            rawType: 0,
          },
        ],
      },
    ],
  };
}
function rgbBytes(colors: readonly Rgba[], count = LEGACY_COLORS): Uint8Array {
  const bytes = new Uint8Array(count * RGB_CHANNELS);
  for (let index = 0; index < Math.min(count, colors.length); index++)
    bytes.set(colors[index]!.slice(0, 3), index * RGB_CHANNELS);
  return bytes;
}
function bitmap(colors: readonly Rgba[], icon: boolean): Uint8Array {
  const { pixels, indices } = paletteSwatchImage(colors);
  if (icon && (pixels.width > 256 || pixels.height > 256))
    throw new Error("ICO dimensions exceed 256 pixels.");
  const indexed = colors.length <= LEGACY_COLORS;
  const colorCount = indexed ? colors.length : 0;
  const bits = indexed ? 8 : icon ? 32 : 24;
  const stride = ((pixels.width * bits) / 8 + 3) & ~3;
  const maskStride = ((pixels.width + 31) >>> 5) * 4;
  const dibSize =
    40 + colorCount * 4 + stride * pixels.height + (icon ? maskStride * pixels.height : 0);
  const offset = icon ? 22 : 14;
  const pixelOffset = offset + 40 + colorCount * 4;
  const bytes = new Uint8Array(offset + dibSize);
  const view = new DataView(bytes.buffer);
  if (icon) {
    view.setUint16(2, 1, true);
    view.setUint16(4, 1, true);
    bytes[6] = pixels.width;
    bytes[7] = pixels.height;
    bytes[8] = colorCount < 256 ? colorCount : 0;
    view.setUint16(10, 1, true);
    view.setUint16(12, bits, true);
    view.setUint32(14, dibSize, true);
    view.setUint32(18, offset, true);
  } else {
    bytes.set(ascii("BM"));
    view.setUint32(2, bytes.length, true);
    view.setUint32(10, pixelOffset, true);
  }
  view.setUint32(offset, 40, true);
  view.setInt32(offset + 4, pixels.width, true);
  view.setInt32(offset + 8, pixels.height * (icon ? 2 : 1), true);
  view.setUint16(offset + 12, 1, true);
  view.setUint16(offset + 14, bits, true);
  view.setUint32(offset + 20, stride * pixels.height, true);
  view.setUint32(offset + 32, colorCount, true);
  if (indexed)
    colors.forEach((color, index) =>
      bytes.set([color[2], color[1], color[0], 0], offset + 40 + index * 4),
    );
  for (let y = 0; y < pixels.height; y++)
    for (let x = 0; x < pixels.width; x++) {
      const source = y * pixels.width + x;
      const destination = pixelOffset + (pixels.height - 1 - y) * stride + (x * bits) / 8;
      if (indexed) bytes[destination] = indices[source];
      else {
        bytes.set(
          [pixels.data[source * 4 + 2], pixels.data[source * 4 + 1], pixels.data[source * 4]],
          destination,
        );
        if (icon) bytes[destination + 3] = UINT8_MAX;
      }
    }
  return bytes;
}
export function serializePaletteFile(
  colors: readonly Rgba[],
  format: PaletteFileFormat,
  profile?: AsepriteColorProfile,
  name = "Palette",
): Uint8Array {
  validate(colors);
  if (format === PaletteFileFormat.Aseprite)
    return encodeAsepriteSync(paletteSprite(colors, profile));
  if (format === PaletteFileFormat.Png) return palettePng(colors, profile);
  if (format === PaletteFileFormat.Act) {
    const bytes = new Uint8Array(772);
    bytes.set(rgbBytes(colors));
    new DataView(bytes.buffer).setUint16(768, Math.min(colors.length, LEGACY_COLORS));
    return bytes;
  }
  if (format === PaletteFileFormat.Col) {
    const bytes = new Uint8Array(776);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, bytes.length, true);
    view.setUint16(4, COL_MAGIC, true);
    bytes.set(rgbBytes(colors), 8);
    return bytes;
  }
  if (format === PaletteFileFormat.Hex)
    return ascii(
      colors
        .map((color) =>
          color
            .slice(0, 3)
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join(""),
        )
        .join("\n") + "\n",
    );
  if (format === PaletteFileFormat.Pal || format === PaletteFileFormat.Gpl) {
    const alpha = colors.some((color) => color[3] !== UINT8_MAX);
    const header =
      format === PaletteFileFormat.Pal
        ? ["JASC-PAL", "0100", String(colors.length)]
        : [
            "GIMP Palette",
            `Name: ${name.replace(/[\r\n]/g, " ")}`,
            ...(alpha ? ["Channels: RGBA"] : []),
            "#",
          ];
    return ascii(
      [...header, ...colors.map((color) => (alpha ? color : color.slice(0, 3)).join(" "))].join(
        "\n",
      ) + "\n",
    );
  }
  const { pixels, indices } = paletteSwatchImage(colors);
  if (format === PaletteFileFormat.Gif)
    return encodeGif([
      {
        pixels,
        duration: 100,
        sourceFrame: 0,
        palette: colors.map((color) => [color[0], color[1], color[2], UINT8_MAX]),
      },
    ]);
  if (format === PaletteFileFormat.Bmp || format === PaletteFileFormat.Ico)
    return bitmap(colors, format === PaletteFileFormat.Ico);
  if (format === PaletteFileFormat.Svg)
    return ascii(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels.width}" height="${pixels.height}" shape-rendering="crispEdges">${colors.map((color, index) => `<rect x="${index % pixels.width}" y="${Math.floor(index / pixels.width)}" width="1" height="1" fill="rgb(${color[0]},${color[1]},${color[2]})"/>`).join("")}</svg>\n`,
    );
  if (format === PaletteFileFormat.Css)
    return ascii(
      `.palette { width: 1px; height: 1px; box-shadow: ${colors.map((color, index) => `${index % pixels.width}px ${Math.floor(index / pixels.width)}px rgb(${color[0]}, ${color[1]}, ${color[2]})`).join(", ")}; }\n`,
    );
  if (format === PaletteFileFormat.Tga) {
    const indexed = colors.length <= LEGACY_COLORS;
    const header = new Uint8Array(18);
    const view = new DataView(header.buffer);
    header[1] = indexed ? 1 : 0;
    header[2] = indexed ? 1 : 2;
    view.setUint16(5, indexed ? colors.length : 0, true);
    header[7] = indexed ? 24 : 0;
    view.setUint16(12, pixels.width, true);
    view.setUint16(14, pixels.height, true);
    header[16] = indexed ? 8 : 32;
    header[17] = indexed ? 32 : 40;
    return joinBytes([
      header,
      indexed
        ? Uint8Array.from(colors.flatMap((color) => [color[2], color[1], color[0]]))
        : new Uint8Array(),
      indexed
        ? indices
        : Uint8Array.from(
            Array.from({ length: pixels.width * pixels.height }, (_, index) => [
              pixels.data[index * 4 + 2],
              pixels.data[index * 4 + 1],
              pixels.data[index * 4],
              pixels.data[index * 4 + 3],
            ]).flat(),
          ),
    ]);
  }
  if (colors.length > LEGACY_COLORS)
    throw new Error("This file format supports at most 256 colors.");
  if (format === PaletteFileFormat.Pcx) {
    const header = new Uint8Array(128);
    const view = new DataView(header.buffer);
    const stride = (pixels.width + 1) & ~1;
    header.set([10, 5, 1, 8]);
    view.setUint16(8, pixels.width - 1, true);
    view.setUint16(10, pixels.height - 1, true);
    header[65] = 1;
    view.setUint16(66, stride, true);
    view.setUint16(68, 1, true);
    const data: number[] = [];
    for (let y = 0; y < pixels.height; y++)
      for (let x = 0; x < stride; x++) {
        const value = x < pixels.width ? indices[y * pixels.width + x] : 0;
        if (value >= 192) data.push(193);
        data.push(value);
      }
    return joinBytes([header, Uint8Array.from(data), Uint8Array.of(12), rgbBytes(colors)]);
  }
  if (format === PaletteFileFormat.Fli || format === PaletteFileFormat.Flc) {
    const palette = new Uint8Array(778);
    const pv = new DataView(palette.buffer);
    pv.setUint32(0, palette.length, true);
    pv.setUint16(4, format === PaletteFileFormat.Fli ? 11 : 4, true);
    pv.setUint16(6, 1, true);
    palette[9] = 0;
    palette.set(
      format === PaletteFileFormat.Fli
        ? rgbBytes(colors).map((value) => value >>> 2)
        : rgbBytes(colors),
      10,
    );
    const copy = new Uint8Array(6 + indices.length + (indices.length % 2));
    const cv = new DataView(copy.buffer);
    cv.setUint32(0, copy.length, true);
    cv.setUint16(4, 16, true);
    copy.set(indices, 6);
    const frame = new Uint8Array(16);
    const fv = new DataView(frame.buffer);
    fv.setUint32(0, 16 + palette.length + copy.length, true);
    fv.setUint16(4, 0xf1fa, true);
    fv.setUint16(6, 2, true);
    const header = new Uint8Array(128);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 128 + frame.length + palette.length + copy.length, true);
    hv.setUint16(4, format === PaletteFileFormat.Fli ? 0xaf11 : 0xaf12, true);
    hv.setUint16(6, 1, true);
    hv.setUint16(8, pixels.width, true);
    hv.setUint16(10, pixels.height, true);
    hv.setUint16(12, 8, true);
    hv.setUint16(14, 3, true);
    hv.setUint32(16, format === PaletteFileFormat.Fli ? 7 : 100, true);
    hv.setUint32(80, 128, true);
    return joinBytes([header, frame, palette, copy]);
  }
  throw new Error("Unknown palette format.");
}
