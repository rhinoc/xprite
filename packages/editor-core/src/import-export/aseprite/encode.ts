import {
  FIXED_POINT_16_16_SCALE,
  INT16_MAX,
  INT16_MIN,
  UINT16_MAX,
  UINT8_MAX,
  BITS_PER_BYTE,
} from "$/base/numeric-constants";
import { inflateZlibExact } from "$/base/zlib";
import { assertEncodedPixels } from "$/document/pixel-storage";
import { Writer } from "$/import-export/aseprite/binary-writer";
import { asepriteCelDecodedBytes } from "$/import-export/aseprite/cel-memory";
import { AsepriteCodecError } from "$/import-export/aseprite/decode";
import {
  AsepriteCel,
  AsepriteCelType,
  AsepriteEncodeOptions,
  AsepriteFrame,
  AsepriteLayer,
  AsepriteLayerType,
  AsepriteRawChunk,
  AsepriteResourceLimits,
  AsepriteSprite,
  AsepriteTag,
  AsepriteTagDirection,
  AsepriteTileset,
  AsepriteUserData,
  DEFAULT_ASEPRITE_LIMITS,
} from "$/import-export/aseprite/model";
import { deflateTileData } from "$/import-export/aseprite/tilemap-compression";

const MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CHUNK_CEL_EXTRA = 0x2006;
const CHUNK_COLOR_PROFILE = 0x2007;
const CHUNK_EXTERNAL_FILE = 0x2008;
const CHUNK_TAGS = 0x2018;
const CHUNK_PALETTE = 0x2019;
const CHUNK_USER_DATA = 0x2020;
const CHUNK_TILESET = 0x2023;

const LAYER_IMAGE = 0;
const CEL_RAW = 0;
const CEL_LINK = 1;
const CEL_COMPRESSED = 2;

function limitsFor(overrides?: Partial<AsepriteResourceLimits>): AsepriteResourceLimits {
  return { ...DEFAULT_ASEPRITE_LIMITS, ...overrides };
}

function checkedInt(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new AsepriteCodecError(`${label} must be an integer in ${min}..${max}`);
  return value;
}

function checkedDimensions(sprite: AsepriteSprite, limits: AsepriteResourceLimits): void {
  checkedInt(sprite.width, 1, limits.maxWidth, "Sprite width");
  checkedInt(sprite.height, 1, limits.maxHeight, "Sprite height");
  if (![8, 16, 32].includes(sprite.depth))
    throw new AsepriteCodecError("Unsupported sprite pixel depth");
  if (sprite.frames.length < 1 || sprite.frames.length > limits.maxFrames)
    throw new AsepriteCodecError("Invalid frame count");
  if (sprite.layers.length > limits.maxLayers) throw new AsepriteCodecError("Too many layers");
  for (const layer of sprite.layers) {
    if (
      layer.type !== AsepriteLayerType.Image &&
      layer.type !== AsepriteLayerType.Group &&
      layer.type !== AsepriteLayerType.Tilemap
    )
      throw new AsepriteCodecError(`Layer ${layer.index} uses unsupported ${layer.type} rendering`);
    if (!Number.isInteger(layer.blendMode) || layer.blendMode < 0 || layer.blendMode > 18)
      throw new AsepriteCodecError(
        `Layer ${layer.index} uses unsupported blend mode ${layer.blendMode}`,
      );
  }
  let cels = 0;
  let decodedBytes = 0;
  let expandedBytes = 0;
  const tilesets = new Map<number, AsepriteTileset>();
  for (const ts of sprite.tilesets ?? []) {
    checkedInt(ts.id, 0, 0xffffffff, "Tileset ID");
    if (tilesets.has(ts.id)) throw new AsepriteCodecError("Duplicate tileset ID");
    tilesets.set(ts.id, ts);
    if (ts.flags & 1) {
      if (!ts.external?.fileName)
        throw new AsepriteCodecError("External Tileset needs a file reference");
      checkedInt(ts.external.fileId, 0, 0xffffffff, "External file ID");
      checkedInt(ts.external.tilesetId, 0, 0xffffffff, "External Tileset ID");
    }
    if (!(ts.flags & 3)) throw new AsepriteCodecError("Tileset has no external or embedded data");
    if (!(ts.flags & 4)) throw new AsepriteCodecError("Tileset must use canonical empty tile zero");
    checkedInt(ts.tileWidth, 1, limits.maxWidth, "Tile width");
    checkedInt(ts.tileHeight, 1, limits.maxHeight, "Tile height");
    checkedInt(ts.tileCount, 0, limits.maxCelPixels, "Tile count");
    checkedInt(ts.baseIndex, INT16_MIN, INT16_MAX, "Tileset base index");
    const pixels = ts.tileCount * ts.tileWidth * ts.tileHeight,
      expected = pixels * (sprite.depth / BITS_PER_BYTE);
    if (pixels > limits.maxCelPixels || expected > limits.maxDecodedBytes)
      throw new AsepriteCodecError("Tileset exceeds resource limits");
    const data = sprite.depth === 32 ? ts.pixels : ts.asepritePixels;
    if (!data || data.byteLength !== expected)
      throw new AsepriteCodecError("Invalid Aseprite tileset samples");
    decodedBytes += pixels * (4 + (sprite.depth === 32 ? 0 : sprite.depth / BITS_PER_BYTE));
  }
  if (decodedBytes > limits.maxDecodedBytes)
    throw new AsepriteCodecError("Tilesets exceed decoded memory limit");
  for (const layer of sprite.layers)
    if (layer.type === AsepriteLayerType.Tilemap && !tilesets.has(layer.tilesetIndex!))
      throw new AsepriteCodecError("Tilemap layer references missing tileset");
  for (let frameIndex = 0; frameIndex < sprite.frames.length; frameIndex += 1) {
    const frame = sprite.frames[frameIndex];
    for (const cel of frame.cels) {
      cels += 1;
      if (cels > limits.maxCels) throw new AsepriteCodecError("Too many cels");

      if (
        !Number.isInteger(cel.layerIndex) ||
        cel.layerIndex < 0 ||
        cel.layerIndex >= sprite.layers.length
      )
        throw new AsepriteCodecError("Cel references an invalid layer");
      checkedInt(cel.x, INT16_MIN, INT16_MAX, "Cel x");
      checkedInt(cel.y, INT16_MIN, INT16_MAX, "Cel y");
      checkedInt(cel.opacity, 0, UINT8_MAX, "Cel opacity");
      checkedInt(cel.zIndex, INT16_MIN, INT16_MAX, "Cel z-index");
      if (
        cel.type === AsepriteCelType.Linked &&
        (cel.linkedFrame === undefined || cel.linkedFrame < 0 || cel.linkedFrame >= frameIndex)
      )
        throw new AsepriteCodecError("Linked cel must point to an earlier frame");
      if (cel.type !== AsepriteCelType.Linked) {
        checkedInt(cel.width, 1, limits.maxWidth, "Cel width");
        checkedInt(cel.height, 1, limits.maxHeight, "Cel height");
        const isTilemap = cel.type === AsepriteCelType.Tilemap;
        if ((sprite.layers[cel.layerIndex].type === AsepriteLayerType.Tilemap) !== isTilemap)
          throw new AsepriteCodecError("Cel type does not match layer type");
        const expected = cel.width * cel.height * (isTilemap ? 4 : sprite.depth / BITS_PER_BYTE);
        if (cel.width * cel.height > limits.maxCelPixels || expected > limits.maxDecodedBytes)
          throw new AsepriteCodecError("Cel pixel data exceeds limits");
        decodedBytes += isTilemap
          ? expected
          : asepriteCelDecodedBytes(cel.width, cel.height, sprite.depth);
        if (!isTilemap) expandedBytes += cel.width * cel.height * 4;
        if (expandedBytes > limits.maxExpandedBytes)
          throw new AsepriteCodecError("Sprite image data exceeds the editor memory limit");
        if (decodedBytes > limits.maxDecodedBytes)
          throw new AsepriteCodecError("Total cel pixel data exceeds limits");
        if (isTilemap) {
          const map = cel.tilemap,
            ts = tilesets.get(sprite.layers[cel.layerIndex].tilesetIndex!)!;
          if (
            !map ||
            map.width !== cel.width ||
            map.height !== cel.height ||
            map.tiles.length !== cel.width * cel.height
          )
            throw new AsepriteCodecError("Invalid tilemap grid");
          for (const tile of map.tiles)
            if ((tile & 0x1fffffff) >= ts.tileCount && (tile & 0x1fffffff) !== 0)
              throw new AsepriteCodecError("Tile index outside referenced tileset");
          continue;
        }
        if (cel.encodedPixels && sprite.depth === 32) {
          assertEncodedPixels(cel.encodedPixels, expected);
          continue;
        }
        if (
          !(sprite.depth === 32 ? cel.pixels : cel.asepritePixels) ||
          (sprite.depth === 32 ? cel.pixels : cel.asepritePixels)!.byteLength !== expected
        )
          throw new AsepriteCodecError(
            `Cel ${frame.index}/${cel.layerIndex} has invalid Aseprite sample data`,
          );
      }
    }
  }
}

function chunk(type: number, payload: Uint8Array): Uint8Array {
  const writer = new Writer();
  writer.u32(payload.byteLength + 6);
  writer.u16(type);
  writer.bytes(payload);
  return writer.toBytes();
}

function userDataChunk(data: AsepriteUserData, limits: AsepriteResourceLimits): Uint8Array {
  const writer = new Writer();
  let flags = 0;
  if (data.text !== undefined) flags |= 1;
  if (data.color !== undefined) flags |= 2;
  if (data.properties !== undefined) flags |= 4;
  writer.u32(flags);
  if (data.text !== undefined) writer.string(data.text, limits.maxStringBytes);
  if (data.color !== undefined) writer.bytes(Uint8Array.from(data.color));
  if (data.properties !== undefined) writer.bytes(data.properties);
  return chunk(CHUNK_USER_DATA, writer.toBytes());
}

function samePalette(a: AsepriteSprite["palette"], b: AsepriteSprite["palette"]): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.entries.length === b.entries.length &&
      a.entries.every((c, i) => {
        const d = b.entries[i];
        return (
          c.red === d.red &&
          c.green === d.green &&
          c.blue === d.blue &&
          c.alpha === d.alpha &&
          c.name === d.name
        );
      }))
  );
}

function paletteChunk(palette: AsepriteSprite["palette"]): Uint8Array | undefined {
  if (!palette || palette.entries.length === 0) return undefined;
  const writer = new Writer();
  const entries = palette.entries;
  writer.u32(entries.length);
  writer.u32(0);
  writer.u32(entries.length - 1);
  writer.pad(8);
  for (const entry of entries) {
    writer.u16(entry.name === undefined ? 0 : 1);
    writer.u8(entry.red);
    writer.u8(entry.green);
    writer.u8(entry.blue);
    writer.u8(entry.alpha);
    if (entry.name !== undefined) writer.string(entry.name, DEFAULT_ASEPRITE_LIMITS.maxStringBytes);
  }
  return chunk(CHUNK_PALETTE, writer.toBytes());
}

function colorProfileChunk(sprite: AsepriteSprite): Uint8Array | undefined {
  const profile = sprite.colorProfile;
  if (!profile) return undefined;
  const writer = new Writer();
  const type = profile.type === "none" ? 0 : profile.type === "srgb" ? 1 : 2;
  writer.u16(type);
  writer.u16(profile.gamma === undefined ? 0 : 1);
  writer.i32(profile.gamma === undefined ? 0 : Math.round(profile.gamma * FIXED_POINT_16_16_SCALE));
  writer.pad(8);
  if (profile.type === "icc") {
    writer.u32(profile.data.byteLength);
    writer.bytes(profile.data);
  }
  return chunk(CHUNK_COLOR_PROFILE, writer.toBytes());
}

function tagsChunk(tags: AsepriteTag[], limits: AsepriteResourceLimits): Uint8Array | undefined {
  if (!tags.length) return undefined;
  const writer = new Writer();
  writer.u16(tags.length);
  writer.pad(8);
  const directionMap: Record<AsepriteTag["direction"], number> = {
    [AsepriteTagDirection.Forward]: 0,
    [AsepriteTagDirection.Reverse]: 1,
    [AsepriteTagDirection.PingPong]: 2,
    [AsepriteTagDirection.PingPongReverse]: 3,
  };
  for (const tag of tags) {
    writer.u16(tag.from);
    writer.u16(tag.to);
    writer.u8(directionMap[tag.direction]);
    writer.u16(Math.max(0, Math.min(UINT16_MAX, tag.repeat)));
    writer.pad(6);
    writer.u8(tag.color[0]);
    writer.u8(tag.color[1]);
    writer.u8(tag.color[2]);
    writer.u8(0);
    writer.string(tag.name, limits.maxStringBytes);
  }
  return chunk(CHUNK_TAGS, writer.toBytes());
}

function layerChunk(
  layer: AsepriteLayer,
  headerFlags: number,
  limits: AsepriteResourceLimits,
): Uint8Array {
  if (
    layer.type !== AsepriteLayerType.Image &&
    layer.type !== AsepriteLayerType.Group &&
    layer.type !== AsepriteLayerType.Tilemap
  )
    throw new AsepriteCodecError(`Layer ${layer.index} (${layer.name}) is not an image layer`);
  const writer = new Writer();
  writer.u16(layer.flags & UINT16_MAX);
  writer.u16(
    layer.type === AsepriteLayerType.Group
      ? 1
      : layer.type === AsepriteLayerType.Tilemap
        ? 2
        : LAYER_IMAGE,
  );
  writer.u16(layer.childLevel || 0);
  writer.u16(layer.defaultWidth || 0);
  writer.u16(layer.defaultHeight || 0);
  const saveBlendInfo = layer.type !== AsepriteLayerType.Group || !!(headerFlags & 2);
  writer.u16(saveBlendInfo ? layer.blendMode || 0 : 0);
  writer.u8(saveBlendInfo ? (layer.opacity === undefined ? UINT8_MAX : layer.opacity) : 0);
  writer.pad(3);
  writer.string(layer.name, limits.maxStringBytes);
  if (layer.type === AsepriteLayerType.Tilemap) writer.u32(layer.tilesetIndex!);
  if (headerFlags & 4) {
    if (layer.uuid && layer.uuid.byteLength === 16) writer.bytes(layer.uuid);
    else writer.pad(16);
  }
  return chunk(CHUNK_LAYER, writer.toBytes());
}

function tilesetChunk(
  ts: AsepriteTileset,
  depth: number,
  limits: AsepriteResourceLimits,
): Uint8Array {
  const writer = new Writer();
  writer.u32(ts.id);
  writer.u32(ts.flags | 4);
  writer.u32(ts.tileCount);
  writer.u16(ts.tileWidth);
  writer.u16(ts.tileHeight);
  writer.i16(ts.baseIndex);
  writer.pad(14);
  writer.string(ts.name, limits.maxStringBytes);
  if (ts.flags & 1) {
    writer.u32(ts.external!.fileId);
    writer.u32(ts.external!.tilesetId);
  }
  if (ts.flags & 2 && ts.tileCount) {
    const bytes = deflateTileData((depth === 32 ? ts.pixels : ts.asepritePixels)!);
    writer.u32(bytes.length);
    writer.bytes(bytes);
  }
  return chunk(CHUNK_TILESET, writer.toBytes());
}

function externalFilesChunk(
  sprite: AsepriteSprite,
  limits: AsepriteResourceLimits,
): Uint8Array | undefined {
  const files = new Map<number, { id: number; type: number; fileName: string }>();
  for (const file of sprite.externalFiles ?? []) {
    checkedInt(file.id, 0, 0xffffffff, "External file ID");
    if (!Number.isInteger(file.type) || file.type < 0 || file.type > 3)
      throw new AsepriteCodecError("Invalid external file type");
    const prior = files.get(file.id);
    if (prior && (prior.type !== file.type || prior.fileName !== file.fileName))
      throw new AsepriteCodecError("Conflicting external file ID");
    files.set(file.id, file);
  }
  for (const ts of sprite.tilesets ?? [])
    if (ts.flags & 1) {
      const ext = ts.external!;
      const prior = files.get(ext.fileId);
      if (prior && (prior.type !== 1 || prior.fileName !== ext.fileName))
        throw new AsepriteCodecError("Conflicting Tileset external file reference");
      files.set(ext.fileId, { id: ext.fileId, type: 1, fileName: ext.fileName });
    }
  if (!files.size) return undefined;
  const writer = new Writer();
  writer.u32(files.size);
  writer.pad(8);
  for (const file of files.values()) {
    writer.u32(file.id);
    writer.u8(file.type);
    writer.pad(7);
    writer.string(file.fileName, limits.maxStringBytes);
  }
  return chunk(CHUNK_EXTERNAL_FILE, writer.toBytes());
}

function celChunk(cel: AsepriteCel, compress: Uint8Array | undefined, depth = 32): Uint8Array {
  const writer = new Writer();
  writer.u16(cel.layerIndex);
  writer.i16(cel.x);
  writer.i16(cel.y);
  writer.u8(cel.opacity);
  const type =
    cel.type === AsepriteCelType.Linked
      ? CEL_LINK
      : cel.type === AsepriteCelType.Tilemap
        ? 3
        : compress
          ? CEL_COMPRESSED
          : CEL_RAW;
  writer.u16(type);
  writer.i16(cel.zIndex);
  writer.pad(5);
  if (type === CEL_LINK) {
    if (cel.linkedFrame === undefined || cel.linkedFrame < 0 || cel.linkedFrame >= UINT16_MAX)
      throw new AsepriteCodecError("Linked cel has an invalid source frame");
    writer.u16(cel.linkedFrame);
  } else {
    writer.u16(cel.width);
    writer.u16(cel.height);
    if (type === 3) {
      writer.u16(32);
      writer.u32(0x1fffffff);
      writer.u32(0x80000000);
      writer.u32(0x40000000);
      writer.u32(0x20000000);
      writer.pad(10);
      const bytes = new Uint8Array(cel.tilemap!.tiles.length * 4),
        view = new DataView(bytes.buffer);
      cel.tilemap!.tiles.forEach((value, index) => view.setUint32(index * 4, value, true));
      writer.bytes(deflateTileData(bytes));
    } else
      writer.bytes(
        compress ||
          (depth === 32
            ? cel.encodedPixels
              ? inflateZlibExact(cel.encodedPixels.bytes, cel.encodedPixels.byteLength)
              : cel.pixels!
            : cel.asepritePixels!),
      );
  }
  return chunk(CHUNK_CEL, writer.toBytes());
}

function celExtraChunk(cel: AsepriteCel): Uint8Array | undefined {
  if (!cel.preciseBounds) return undefined;
  const writer = new Writer();
  writer.u32(1);
  writer.i32(Math.round(cel.preciseBounds.x * FIXED_POINT_16_16_SCALE));
  writer.i32(Math.round(cel.preciseBounds.y * FIXED_POINT_16_16_SCALE));
  writer.i32(Math.round(cel.preciseBounds.width * FIXED_POINT_16_16_SCALE));
  writer.i32(Math.round(cel.preciseBounds.height * FIXED_POINT_16_16_SCALE));
  writer.pad(16);
  return chunk(CHUNK_CEL_EXTRA, writer.toBytes());
}

function rawChunk(value: AsepriteRawChunk): Uint8Array {
  if (value.bytes.byteLength > 0xffffffff - 6)
    throw new AsepriteCodecError("Opaque chunk is too large");
  return chunk(value.type, value.bytes);
}

function shouldWriteOpaqueChunk(type: number): boolean {
  // Known chunks written from structured fields would otherwise be duplicated.
  return (
    type !== CHUNK_TILESET &&
    type !== CHUNK_EXTERNAL_FILE &&
    type !== CHUNK_LAYER &&
    type !== CHUNK_CEL &&
    type !== CHUNK_CEL_EXTRA &&
    type !== CHUNK_PALETTE &&
    type !== CHUNK_TAGS &&
    type !== CHUNK_COLOR_PROFILE
  );
}

function buildFrameChunks(
  sprite: AsepriteSprite,
  frame: AsepriteFrame,
  frameIndex: number,
  headerFlags: number,
  options: AsepriteEncodeOptions,
  limits: AsepriteResourceLimits,
  compressed: Map<AsepriteCel, Uint8Array>,
): Uint8Array[] {
  const values: Uint8Array[] = [];
  const effectivePalette = frame.palette ?? sprite.palette;
  if (
    frameIndex === 0 ||
    effectivePalette?.frameIndex === frameIndex ||
    !samePalette(effectivePalette, sprite.frames[frameIndex - 1].palette ?? sprite.palette)
  ) {
    const palette = paletteChunk(effectivePalette);
    if (palette) values.push(palette);
  }
  if (frameIndex === 0) {
    const external = externalFilesChunk(sprite, limits);
    if (external) values.push(external);
    const profile = colorProfileChunk(sprite);
    if (profile) values.push(profile);
    if (sprite.userData) values.push(userDataChunk(sprite.userData, limits));
    const tags = tagsChunk(sprite.tags, limits);
    if (tags) {
      values.push(tags);
      for (const tag of sprite.tags) values.push(userDataChunk(tag.userData ?? {}, limits));
    }
    for (const ts of sprite.tilesets ?? []) {
      values.push(tilesetChunk(ts, sprite.depth, limits));
      if (ts.userData || ts.tileUserData) {
        values.push(userDataChunk(ts.userData ?? {}, limits));
        for (let i = 0; i < ts.tileCount; i++)
          values.push(userDataChunk(ts.tileUserData?.[i] ?? {}, limits));
      }
    }
    for (const layer of sprite.layers) {
      values.push(layerChunk(layer, headerFlags, limits));
      if (layer.userData) values.push(userDataChunk(layer.userData, limits));
    }
  }
  for (const cel of frame.cels) {
    values.push(celChunk(cel, compressed.get(cel), sprite.depth));
    const extra = celExtraChunk(cel);
    if (extra) values.push(extra);
    if (cel.userData) values.push(userDataChunk(cel.userData, limits));
  }
  if (options.preserveUnknownChunks !== false) {
    for (const opaque of sprite.chunks)
      if (
        shouldWriteOpaqueChunk(opaque.type) &&
        (opaque.frameIndex === undefined ? frameIndex === 0 : opaque.frameIndex === frameIndex)
      )
        values.push(rawChunk(opaque));
    for (const opaque of frame.chunks || [])
      if (shouldWriteOpaqueChunk(opaque.type)) values.push(rawChunk(opaque));
  }
  return values;
}

function writeFile(
  sprite: AsepriteSprite,
  frameChunks: Uint8Array[][],
  limits: AsepriteResourceLimits,
): Uint8Array {
  const writer = new Writer();
  const headerFlags =
    sprite.flags | 1 | (sprite.layers.some((layer) => layer.uuid?.byteLength === 16) ? 4 : 0);
  writer.u32(0); // Patched after all frames are written.
  writer.u16(MAGIC);
  writer.u16(sprite.frames.length);
  writer.u16(sprite.width);
  writer.u16(sprite.height);
  writer.u16(sprite.depth);
  writer.u32(headerFlags);
  writer.u16(sprite.header.speed || sprite.frames[0].duration || 100);
  writer.u32(sprite.header.next || 0);
  writer.u32(sprite.header.frit || 0);
  writer.u8(sprite.header.transparentIndex || 0);
  const ignore = sprite.header.ignore || [0, 0, 0];
  writer.u8(ignore[0]);
  writer.u8(ignore[1]);
  writer.u8(ignore[2]);
  writer.u16(sprite.palette?.entries.length || sprite.header.ncolors || 0);
  writer.u8(sprite.header.pixelWidth || 1);
  writer.u8(sprite.header.pixelHeight || 1);
  writer.i16(sprite.header.gridX || 0);
  writer.i16(sprite.header.gridY || 0);
  writer.u16(sprite.header.gridWidth || 0);
  writer.u16(sprite.header.gridHeight || 0);
  writer.pad(84);
  for (let index = 0; index < frameChunks.length; index += 1) {
    const chunks = frameChunks[index];
    const frameStart = writer.length;
    writer.u32(0);
    writer.u16(FRAME_MAGIC);
    writer.u16(chunks.length < UINT16_MAX ? chunks.length : UINT16_MAX);
    writer.u16(sprite.frames[index].duration || 1);
    writer.pad(2);
    writer.u32(chunks.length);
    for (const value of chunks) writer.bytes(value);
    writer.patchU32(frameStart, writer.length - frameStart);
  }
  if (writer.length > limits.maxFileBytes)
    throw new AsepriteCodecError("Encoded file exceeds maxFileBytes");
  const output = writer.toBytes();
  new DataView(output.buffer, output.byteOffset, output.byteLength).setUint32(
    0,
    output.byteLength,
    true,
  );
  return output;
}

async function encodeInternal(
  sprite: AsepriteSprite,
  options: AsepriteEncodeOptions = {},
): Promise<Uint8Array> {
  const limits = limitsFor(options.limits);
  checkedDimensions(sprite, limits);
  const compress = options.compress === true;
  if (compress && !options.deflate)
    throw new AsepriteCodecError("compress:true requires an injected deflate function");
  const compressed = new Map<AsepriteCel, Uint8Array>();
  if (options.preserveCelCompression)
    for (const frame of sprite.frames)
      for (const cel of frame.cels)
        if (cel.encodedPixels && cel.type !== AsepriteCelType.Linked)
          compressed.set(cel, cel.encodedPixels.bytes);
  if (compress) {
    for (const frame of sprite.frames) {
      for (const cel of frame.cels) {
        if (cel.type === AsepriteCelType.Linked || cel.type === AsepriteCelType.Tilemap) continue;
        if (cel.encodedPixels) {
          compressed.set(cel, cel.encodedPixels.bytes);
          continue;
        }
        const source = (sprite.depth === 32 ? cel.pixels : cel.asepritePixels)!;
        const encoded = await options.deflate!(source);
        const bytes =
          encoded instanceof Uint8Array
            ? encoded
            : new Uint8Array(encoded as unknown as ArrayBuffer);
        // zlib headers can make small/incompressible cels larger. Both forms
        // preserve independent cel identity and are native ASE representations.
        if (bytes.byteLength < source.byteLength) compressed.set(cel, bytes.slice());
      }
    }
  }
  const headerFlags =
    sprite.flags | 1 | (sprite.layers.some((layer) => layer.uuid?.byteLength === 16) ? 4 : 0);
  const frameChunks = sprite.frames.map((frame, index) =>
    buildFrameChunks(sprite, frame, index, headerFlags, options, limits, compressed),
  );
  return writeFile(sprite, frameChunks, limits);
}

/** Encode a 32-bit RGBA sprite as a legal .ase/.aseprite file. */
export async function encodeAseprite(
  sprite: AsepriteSprite,
  options: AsepriteEncodeOptions = {},
): Promise<Uint8Array> {
  return encodeInternal(sprite, options);
}

/** Synchronous encoder for the default uncompressed RGBA output. */
export function encodeAsepriteSync(
  sprite: AsepriteSprite,
  options: AsepriteEncodeOptions = {},
): Uint8Array {
  if (options.compress)
    throw new AsepriteCodecError("encodeAsepriteSync cannot use asynchronous compression");
  const limits = limitsFor(options.limits);
  checkedDimensions(sprite, limits);
  const headerFlags =
    sprite.flags | 1 | (sprite.layers.some((layer) => layer.uuid?.byteLength === 16) ? 4 : 0);
  const compressed = new Map<AsepriteCel, Uint8Array>();
  if (options.preserveCelCompression)
    for (const frame of sprite.frames)
      for (const cel of frame.cels)
        if (cel.encodedPixels && cel.type !== AsepriteCelType.Linked)
          compressed.set(cel, cel.encodedPixels.bytes);
  const frameChunks = sprite.frames.map((frame, index) =>
    buildFrameChunks(sprite, frame, index, headerFlags, options, limits, compressed),
  );
  return writeFile(sprite, frameChunks, limits);
}
