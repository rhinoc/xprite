import { Writer } from "$/import-export/aseprite/binary-writer";
import { crc32 } from "@xprite/bedrock/common/crc32";
import { decodeUtf8 } from "@xprite/bedrock/common/utf8";

const FILE_HEADER_BYTES = 128;
const FRAME_HEADER_BYTES = 16;
const CHUNK_HEADER_BYTES = 6;
const CEL_HEADER_BYTES = 26;
const CEL_CHUNK = 0x2005;
const ASE_MAGIC_OFFSET = 4;
const ASE_FRAME_COUNT_OFFSET = 6;
const ASE_DEPTH_OFFSET = 12;
const FRAME_MAGIC_OFFSET = 4;
const CHUNK_TYPE_OFFSET = 4;
const CEL_TYPE_OFFSET = 13;
const CEL_WIDTH_OFFSET = 22;
const CEL_HEIGHT_OFFSET = 24;
const CEL_LAYER_OFFSET = 6;
const PIXEL_WIDTH_BACK_OFFSET = 4;
const PIXEL_HEIGHT_BACK_OFFSET = 2;
const PIXEL_LAYER_BACK_OFFSET = 20;
const ASE_MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;
const CHANNEL_BITS = 8;
const RGBA_CHANNELS = 4;
const MAX_PALETTE = 256;
const MAX_WIDE_PALETTE = 4096;
const TILE_SIZES = [8, 16, 32] as const;
const WIDE_INDEX_BYTES = 2;
const MAX_NAME_BYTES = 256;
const VARINT_BITS = 7;
const VARINT_MASK = 127;
const VARINT_CONTINUATION = 128;
const MAX_VARINT_BYTES = 4;

enum Packing {
  Original,
  Planar,
  PlanarDelta,
  Indexed,
  IndexedDelta,
  IndexedBytes,
  IndexedLayerDelta,
  TiledPlanar,
  TiledIndexed,
  WideIndexed,
}

interface PixelRange {
  offset: number;
  length: number;
  width: number;
  height: number;
  layer: number;
}

interface LayerSamples {
  samples: Uint8Array;
  width: number;
  height: number;
}

function variable(writer: Writer, value: number): void {
  do {
    const rest = Math.floor(value / VARINT_CONTINUATION);
    writer.u8((value & VARINT_MASK) | (rest ? VARINT_CONTINUATION : 0));
    value = rest;
  } while (value);
}

class Reader {
  offset = 0;
  constructor(readonly data: Uint8Array) {}
  bytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.data.length - this.offset)
      throw new Error("Invalid share data.");
    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
  byte(): number {
    return this.bytes(1)[0];
  }
  integer(length: number): number {
    const bytes = this.bytes(length);
    let value = 0;
    for (let index = 0; index < length; index++)
      value += bytes[index] * 2 ** (index * CHANNEL_BITS);
    return value;
  }
  variable(): number {
    let value = 0;
    for (let index = 0; index < MAX_VARINT_BYTES; index++) {
      const byte = this.byte();
      value += (byte & VARINT_MASK) * 2 ** (index * VARINT_BITS);
      if (!(byte & VARINT_CONTINUATION)) return value;
    }
    throw new Error("Invalid share data.");
  }
}

/** Find only raw image cels. All other ASE bytes, including opaque metadata,
 * ICC profiles, linked cels and compressed tilesets, remain untouched. */
function pixelRanges(data: Uint8Array): { channels: number; ranges: PixelRange[] } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < FILE_HEADER_BYTES || view.getUint16(ASE_MAGIC_OFFSET, true) !== ASE_MAGIC)
    throw new Error("Invalid share data.");
  const channels = view.getUint16(ASE_DEPTH_OFFSET, true) / CHANNEL_BITS;
  if (![1, 2, RGBA_CHANNELS].includes(channels)) throw new Error("Invalid share data.");
  const ranges: PixelRange[] = [];
  let frame = FILE_HEADER_BYTES;
  for (let index = 0; index < view.getUint16(ASE_FRAME_COUNT_OFFSET, true); index++) {
    if (
      frame + FRAME_HEADER_BYTES > data.length ||
      view.getUint16(frame + FRAME_MAGIC_OFFSET, true) !== FRAME_MAGIC
    )
      throw new Error("Invalid share data.");
    const end = frame + view.getUint32(frame, true);
    if (end > data.length || end < frame + FRAME_HEADER_BYTES)
      throw new Error("Invalid share data.");
    let chunk = frame + FRAME_HEADER_BYTES;
    while (chunk < end) {
      if (chunk + CHUNK_HEADER_BYTES > end) throw new Error("Invalid share data.");
      const length = view.getUint32(chunk, true);
      if (length < CHUNK_HEADER_BYTES || chunk + length > end)
        throw new Error("Invalid share data.");
      if (
        view.getUint16(chunk + CHUNK_TYPE_OFFSET, true) === CEL_CHUNK &&
        length >= CEL_HEADER_BYTES &&
        view.getUint16(chunk + CEL_TYPE_OFFSET, true) === 0
      ) {
        const width = view.getUint16(chunk + CEL_WIDTH_OFFSET, true);
        const height = view.getUint16(chunk + CEL_HEIGHT_OFFSET, true);
        const pixels = width * height * channels;
        if (pixels !== length - CEL_HEADER_BYTES) throw new Error("Invalid share data.");
        if (pixels)
          ranges.push({
            offset: chunk + CEL_HEADER_BYTES,
            length: pixels,
            width,
            height,
            layer: view.getUint16(chunk + CEL_LAYER_OFFSET, true),
          });
      }
      chunk += length;
    }
    frame = end;
  }
  if (frame !== data.length) throw new Error("Invalid share data.");
  return { channels, ranges };
}

function palettesFor(
  data: Uint8Array,
  ranges: readonly PixelRange[],
  limit = MAX_PALETTE,
): readonly Map<number, number>[] {
  const palette = new Map<number, number>();
  const frequency = new Uint32Array(limit);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (const range of ranges)
    for (let at = range.offset; at < range.offset + range.length; at += RGBA_CHANNELS) {
      const color = view.getUint32(at, true);
      let index = palette.get(color);
      if (index === undefined) {
        if (palette.size === limit) return [];
        index = palette.size;
        palette.set(color, index);
      }
      frequency[index]++;
    }
  const ordered = [...palette.keys()].sort(
    (a, b) => frequency[palette.get(b)!] - frequency[palette.get(a)!],
  );
  return [palette, new Map(ordered.map((color, index) => [color, index]))];
}

function previousLayerSample(
  previous: LayerSamples | undefined,
  sample: number,
  width: number,
): number {
  if (!previous) return 0;
  const x = sample % width;
  const y = Math.floor(sample / width);
  return x < previous.width && y < previous.height ? previous.samples[y * previous.width + x] : 0;
}

/** Tiled traversal with partial edge tiles, without a pixel-order allocation. */
function tiledPixel(sequence: number, width: number, height: number, tile: number): number {
  const y = Math.floor(sequence / (width * tile)) * tile;
  const rows = Math.min(tile, height - y);
  const within = sequence - y * width;
  const x = Math.floor(within / (rows * tile)) * tile;
  const columns = Math.min(tile, width - x);
  const local = within - x * rows;
  return (y + Math.floor(local / columns)) * width + x + (local % columns);
}

/** Generate competing reversible representations; no quantization, flattening
 * or RGBA color-mode conversion is applied to the editable document. */
export function* sharedAsepriteCandidates(data: Uint8Array, name: string): Generator<Uint8Array> {
  const { channels, ranges } = pixelRanges(data);
  const checksum = crc32(data);
  const palettes = channels === RGBA_CHANNELS && ranges.length ? palettesFor(data, ranges) : [];
  const candidates: { mode: Packing; palette?: Map<number, number>; tile?: number }[] = [
    { mode: Packing.Original },
    { mode: Packing.Planar },
    { mode: Packing.PlanarDelta },
  ];
  for (const tile of TILE_SIZES) candidates.push({ mode: Packing.TiledPlanar, tile });
  if (palettes.length) {
    candidates.push(
      { mode: Packing.Indexed, palette: palettes[0] },
      { mode: Packing.IndexedDelta, palette: palettes[0] },
    );
    for (const palette of palettes)
      candidates.push(
        { mode: Packing.IndexedBytes, palette },
        { mode: Packing.IndexedLayerDelta, palette },
      );
  }
  if (palettes.length) {
    for (const tile of TILE_SIZES)
      for (const palette of palettes)
        candidates.push({ mode: Packing.TiledIndexed, tile, palette });
  } else if (channels === RGBA_CHANNELS && ranges.length) {
    for (const palette of palettesFor(data, ranges, MAX_WIDE_PALETTE))
      candidates.push({ mode: Packing.WideIndexed, palette });
  }
  for (const { mode, palette, tile } of candidates) {
    if (mode !== Packing.Original && !ranges.length) continue;
    const writer = new Writer();
    writer.u8(mode);
    writer.string(name, MAX_NAME_BYTES);
    writer.u32(checksum);
    writer.u32(data.length);
    if (mode === Packing.Original) {
      writer.bytes(data);
      yield writer.toBytes();
      continue;
    }
    writer.u8(channels);
    variable(writer, ranges.length);
    if (tile) writer.u8(tile);
    const indexed = !!palette;
    const delta = mode === Packing.PlanarDelta || mode === Packing.IndexedDelta;
    const layerDelta = mode === Packing.IndexedLayerDelta;
    const wide = mode === Packing.WideIndexed;
    const byteIndices =
      mode === Packing.IndexedBytes || layerDelta || mode === Packing.TiledIndexed;
    const bits = indexed && !byteIndices ? Math.ceil(Math.log2(palette!.size)) : CHANNEL_BITS;
    if (indexed) {
      variable(writer, palette!.size);
      for (const color of palette!.keys()) writer.u32(color);
    }
    let cursor = 0;
    let previous: Uint8Array | Uint16Array | undefined;
    const layers = new Map<number, LayerSamples>();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (const range of ranges) {
      variable(writer, range.offset - cursor);
      writer.bytes(data.subarray(cursor, range.offset));
      variable(writer, range.length);
      const pixels = range.length / channels;
      const samples = indexed
        ? wide
          ? new Uint16Array(pixels)
          : new Uint8Array(pixels)
        : data.subarray(range.offset, range.offset + range.length);
      if (indexed)
        for (let pixel = 0; pixel < pixels; pixel++)
          samples[pixel] = palette!.get(view.getUint32(range.offset + pixel * channels, true))!;
      const encoded = new Uint8Array(
        wide
          ? pixels * WIDE_INDEX_BYTES
          : indexed
            ? Math.ceil((pixels * bits) / CHANNEL_BITS)
            : range.length,
      );
      for (let sample = 0; sample < samples.length; sample++) {
        const sourceSample = tile
          ? indexed
            ? tiledPixel(sample, range.width, range.height, tile)
            : tiledPixel(Math.floor(sample / channels), range.width, range.height, tile) *
                channels +
              (sample % channels)
          : sample;
        const value =
          samples[sourceSample] ^
          (layerDelta
            ? previousLayerSample(layers.get(range.layer), sample, range.width)
            : delta && previous?.length === samples.length
              ? previous[sample]
              : 0);
        if (wide) {
          encoded[sample] = value;
          encoded[pixels + sample] = value >>> CHANNEL_BITS;
        } else if (indexed && bits) {
          const bit = sample * bits;
          encoded[Math.floor(bit / CHANNEL_BITS)] |= value << (bit % CHANNEL_BITS);
          if ((bit % CHANNEL_BITS) + bits > CHANNEL_BITS)
            encoded[Math.floor(bit / CHANNEL_BITS) + 1] |=
              value >>> (CHANNEL_BITS - (bit % CHANNEL_BITS));
        } else if (!indexed)
          encoded[(sample % channels) * pixels + Math.floor(sample / channels)] = value;
      }
      writer.bytes(encoded);
      previous = samples;
      if (layerDelta)
        layers.set(range.layer, {
          samples: samples as Uint8Array,
          width: range.width,
          height: range.height,
        });
      cursor = range.offset + range.length;
    }
    writer.bytes(data.subarray(cursor));
    yield writer.toBytes();
  }
}

/** Bounded, exact reconstruction followed by CRC and ASE structure checks. */
export function restoreSharedAseprite(
  data: Uint8Array,
  maxBytes: number,
): { bytes: Uint8Array; name: string } {
  const reader = new Reader(data);
  const mode = reader.byte();
  if (!Object.values(Packing).includes(mode)) throw new Error("Invalid share data.");
  const nameLength = reader.integer(2);
  if (nameLength > MAX_NAME_BYTES) throw new Error("Invalid share data.");
  const name = decodeUtf8(reader.bytes(nameLength));
  const checksum = reader.integer(4);
  const length = reader.integer(4);
  if (length < FILE_HEADER_BYTES || length > maxBytes)
    throw new Error("This shared project is too large. Export a file instead.");
  let bytes: Uint8Array;
  if (mode === Packing.Original) bytes = reader.bytes(length).slice();
  else {
    const channels = reader.byte();
    if (![1, 2, RGBA_CHANNELS].includes(channels)) throw new Error("Invalid share data.");
    const count = reader.variable();
    if (count > Math.floor(length / CEL_HEADER_BYTES)) throw new Error("Invalid share data.");
    const indexed =
      mode === Packing.Indexed ||
      mode === Packing.IndexedDelta ||
      mode === Packing.IndexedBytes ||
      mode === Packing.IndexedLayerDelta ||
      mode === Packing.TiledIndexed ||
      mode === Packing.WideIndexed;
    const tiled = mode === Packing.TiledPlanar || mode === Packing.TiledIndexed;
    const tile = tiled ? reader.byte() : 0;
    if (tiled && !TILE_SIZES.includes(tile as (typeof TILE_SIZES)[number]))
      throw new Error("Invalid share data.");
    const delta = mode === Packing.PlanarDelta || mode === Packing.IndexedDelta;
    const layerDelta = mode === Packing.IndexedLayerDelta;
    const wide = mode === Packing.WideIndexed;
    const byteIndices =
      mode === Packing.IndexedBytes || layerDelta || mode === Packing.TiledIndexed;
    const paletteSize = indexed ? reader.variable() : 0;
    if (
      indexed &&
      (channels !== RGBA_CHANNELS ||
        paletteSize < 1 ||
        paletteSize > (wide ? MAX_WIDE_PALETTE : MAX_PALETTE))
    )
      throw new Error("Invalid share data.");
    const palette = reader.bytes(paletteSize * RGBA_CHANNELS);
    const bits = indexed && !byteIndices ? Math.ceil(Math.log2(paletteSize)) : CHANNEL_BITS;
    bytes = new Uint8Array(length);
    const view = new DataView(bytes.buffer);
    let cursor = 0;
    let previous: Uint8Array | Uint16Array | undefined;
    const layers = new Map<number, LayerSamples>();
    for (let range = 0; range < count; range++) {
      const literal = reader.variable();
      if (literal > length - cursor) throw new Error("Invalid share data.");
      bytes.set(reader.bytes(literal), cursor);
      cursor += literal;
      const pixelBytes = reader.variable();
      if (!pixelBytes || pixelBytes > length - cursor || pixelBytes % channels)
        throw new Error("Invalid share data.");
      const pixels = pixelBytes / channels;
      let width = pixels;
      let height = 1;
      let layer = 0;
      if (layerDelta || tiled) {
        if (cursor < CEL_HEADER_BYTES) throw new Error("Invalid share data.");
        width = view.getUint16(cursor - PIXEL_WIDTH_BACK_OFFSET, true);
        height = view.getUint16(cursor - PIXEL_HEIGHT_BACK_OFFSET, true);
        layer = view.getUint16(cursor - PIXEL_LAYER_BACK_OFFSET, true);
        if (!width || !height || width * height !== pixels) throw new Error("Invalid share data.");
      }
      const encoded = reader.bytes(
        wide
          ? pixels * WIDE_INDEX_BYTES
          : indexed
            ? Math.ceil((pixels * bits) / CHANNEL_BITS)
            : pixelBytes,
      );
      const samples = wide
        ? new Uint16Array(pixels)
        : new Uint8Array(indexed ? pixels : pixelBytes);
      for (let sample = 0; sample < samples.length; sample++) {
        const bit = sample * bits;
        const at = Math.floor(bit / CHANNEL_BITS);
        const value = wide
          ? encoded[sample] | (encoded[pixels + sample] << CHANNEL_BITS)
          : indexed
            ? bits
              ? ((encoded[at] | ((encoded[at + 1] ?? 0) << CHANNEL_BITS)) >>>
                  (bit % CHANNEL_BITS)) &
                (2 ** bits - 1)
              : 0
            : encoded[(sample % channels) * pixels + Math.floor(sample / channels)];
        samples[sample] =
          value ^
          (layerDelta
            ? previousLayerSample(layers.get(layer), sample, width)
            : delta && previous?.length === samples.length
              ? previous[sample]
              : 0);
        const destination = tiled
          ? indexed
            ? tiledPixel(sample, width, height, tile)
            : tiledPixel(Math.floor(sample / channels), width, height, tile) * channels +
              (sample % channels)
          : sample;
        if (indexed) {
          if (samples[sample] >= paletteSize) throw new Error("Invalid share data.");
          bytes.set(
            palette.subarray(samples[sample] * channels, (samples[sample] + 1) * channels),
            cursor + destination * channels,
          );
        } else bytes[cursor + destination] = samples[sample];
      }
      previous = samples;
      if (layerDelta) layers.set(layer, { samples: samples as Uint8Array, width, height });
      cursor += pixelBytes;
    }
    bytes.set(reader.bytes(length - cursor), cursor);
  }
  if (reader.offset !== data.length || crc32(bytes) !== checksum)
    throw new Error("The share link is incomplete or damaged.");
  pixelRanges(bytes);
  return { bytes, name };
}
