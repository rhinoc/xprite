import { zlibSync } from "fflate";

import {
  FIXED_POINT_16_16_SCALE,
  UINT16_MAX,
  UINT8_MAX,
  BITS_PER_BYTE,
} from "$/base/numeric-constants";
import { PixelStorageFormat } from "$/base/primitives";
import { hasTransparentRgb } from "$/base/rgba-analysis";
import { inflateZlibExact } from "$/base/zlib";
import { expandAsepriteSamples } from "$/color/samples";
import { asepriteCelDecodedBytes } from "$/import-export/aseprite/cel-memory";
import {
  AsepriteCel,
  AsepriteCelType,
  AsepriteColorProfile,
  AsepriteDecodeOptions,
  AsepriteFrame,
  AsepriteInflate,
  AsepriteIssue,
  AsepriteIssueCode,
  AsepriteLayer,
  AsepriteLayerType,
  AsepritePalette,
  AsepritePreflightHeader,
  AsepritePreflightResult,
  AsepriteRawChunk,
  AsepriteResourceLimits,
  AsepriteSprite,
  AsepriteTag,
  AsepriteTileset,
  AsepriteTagDirection,
  AsepriteUserData,
  DEFAULT_ASEPRITE_LIMITS,
} from "$/import-export/aseprite/model";
import { decodeUtf8 } from "@xprite/bedrock/common/utf8";

export const ASEPRITE_MAGIC = 0xa5e0;
export const ASEPRITE_FRAME_MAGIC = 0xf1fa;
export const ASEPRITE_SIGNATURE_BYTES = 6;
const ASEPRITE_MAGIC_OFFSET = 4;

/** Identifies the codec from a byte prefix; full decoding still validates the file. */
export function isAsepriteData(bytes: Uint8Array): boolean {
  if (bytes.byteLength < ASEPRITE_SIGNATURE_BYTES) return false;
  return (
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
      ASEPRITE_MAGIC_OFFSET,
      true,
    ) === ASEPRITE_MAGIC
  );
}

const CHUNK_FLI_COLOR2 = 4;
const CHUNK_FLI_COLOR = 11;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CHUNK_CEL_EXTRA = 0x2006;
const CHUNK_COLOR_PROFILE = 0x2007;
const CHUNK_EXTERNAL_FILE = 0x2008;
const CHUNK_MASK = 0x2016;
const CHUNK_PATH = 0x2017;
const CHUNK_TAGS = 0x2018;
const CHUNK_PALETTE = 0x2019;
const CHUNK_USER_DATA = 0x2020;
const CHUNK_SLICES = 0x2021;
const CHUNK_SLICE = 0x2022;
const CHUNK_TILESET = 0x2023;

const LAYER_IMAGE = 0;
const LAYER_GROUP = 1;
const LAYER_TILEMAP = 2;

const CEL_RAW = 0;
const CEL_LINK = 1;
const CEL_COMPRESSED = 2;
const CEL_COMPRESSED_TILEMAP = 3;

const LAYER_VISIBLE = 1;
const LAYER_EDITABLE = 2;
const LAYER_LOCK_MOVE = 4;
const LAYER_BACKGROUND = 8;
const LAYER_CONTINUOUS = 16;
const LAYER_COLLAPSED = 32;
const LAYER_REFERENCE = 64;

const COLOR_PROFILE_NONE = 0;
const COLOR_PROFILE_SRGB = 1;
const COLOR_PROFILE_ICC = 2;
const COLOR_PROFILE_GAMMA = 1;

const USER_TEXT = 1;
const USER_COLOR = 2;
const USER_PROPERTIES = 4;

const TAG_DIRECTIONS: readonly AsepriteTagDirection[] = [
  AsepriteTagDirection.Forward,
  AsepriteTagDirection.Reverse,
  AsepriteTagDirection.PingPong,
  AsepriteTagDirection.PingPongReverse,
];

export class AsepriteCodecError extends Error {
  readonly issues: readonly AsepriteIssue[];
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    message: string,
    issues: readonly AsepriteIssue[] = [],
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "AsepriteCodecError";
    this.issues = issues;
    this.details = details;
  }
}

/**
 * Reader that never performs an unchecked DataView access. All offsets are
 * absolute file offsets so malformed input can be reported precisely.
 */
class Reader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  readonly start: number;
  readonly end: number;
  offset: number;

  constructor(bytes: Uint8Array, start = 0, end = bytes.byteLength) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.start = start;
    this.end = end;
    this.offset = start;
  }

  get remaining(): number {
    return this.end - this.offset;
  }

  ensure(size: number): void {
    if (!Number.isSafeInteger(size) || size < 0 || this.offset + size > this.end) {
      throw new AsepriteCodecError(`Truncated Aseprite data at byte ${this.offset}`);
    }
  }

  u8(): number {
    this.ensure(1);
    return this.bytes[this.offset++];
  }

  u16(): number {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  i16(): number {
    this.ensure(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  i32(): number {
    this.ensure(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  bytesCopy(size: number): Uint8Array {
    this.ensure(size);
    const value = this.bytes.slice(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }

  skip(size: number): void {
    this.ensure(size);
    this.offset += size;
  }

  string(maxBytes: number): string {
    const length = this.u16();
    if (length > maxBytes) {
      throw new AsepriteCodecError(`Aseprite string exceeds ${maxBytes} bytes`);
    }
    const data = this.bytesCopy(length);
    return decodeUtf8(data);
  }

  subreader(start: number, end: number): Reader {
    if (start < this.start || end < start || end > this.end) {
      throw new AsepriteCodecError(`Invalid Aseprite subrange ${start}..${end}`);
    }
    return new Reader(this.bytes, start, end);
  }
}

interface HeaderInfo extends AsepritePreflightHeader {
  flags: number;
  speed: number;
  next: number;
  frit: number;
  transparentIndex: number;
  ignore: [number, number, number];
  ncolors: number;
  pixelWidth: number;
  pixelHeight: number;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  fileEnd: number;
}

interface ChunkInfo {
  type: number;
  start: number;
  payloadStart: number;
  end: number;
  payload: Uint8Array;
}

interface ScanResult {
  header: HeaderInfo;
  frames: { start: number; end: number; duration: number; chunks: ChunkInfo[] }[];
  layers: { index: number; type: number; blendMode: number; layerIndex: number; flags: number }[];
  celCount: number;
  decodedBytes: number;
}

interface DecodeState {
  header: HeaderInfo;
  layers: AsepriteLayer[];
  frames: AsepriteFrame[];
  palette?: AsepritePalette;
  tags: AsepriteTag[];
  colorProfile?: AsepriteColorProfile;
  userData?: AsepriteUserData;
  chunks: AsepriteRawChunk[];
}

function defaultPalette(size = 256): AsepritePalette {
  return {
    entries: Array.from({ length: size }, () => ({ red: 0, green: 0, blue: 0, alpha: UINT8_MAX })),
  };
}

function limitsFor(overrides?: Partial<AsepriteResourceLimits>): AsepriteResourceLimits {
  return { ...DEFAULT_ASEPRITE_LIMITS, ...overrides };
}

function issue(
  code: AsepriteIssue["code"],
  message: string,
  fatal = true,
  details: Partial<AsepriteIssue> = {},
): AsepriteIssue {
  return { code, message, fatal, ...details };
}

function bytesOf(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function decodeInput(
  input: ArrayBuffer | Uint8Array,
  options: AsepriteDecodeOptions,
  limits: AsepriteResourceLimits,
): Uint8Array {
  const bytes = bytesOf(input);
  if (bytes.byteLength > limits.maxFileBytes)
    throw new AsepriteCodecError("Aseprite file exceeds its resource limit", [
      issue(AsepriteIssueCode.ResourceLimit, `Aseprite file exceeds ${limits.maxFileBytes} bytes`),
    ]);
  return options.takeOwnership ? bytes : bytes.slice();
}

function readHeader(
  bytes: Uint8Array,
  limits: AsepriteResourceLimits,
): { header?: HeaderInfo; issues: AsepriteIssue[] } {
  const issues: AsepriteIssue[] = [];
  if (bytes.byteLength < 128) {
    issues.push(
      issue(AsepriteIssueCode.Truncated, "Aseprite header is shorter than 128 bytes", true, {
        offset: 0,
      }),
    );
    return { issues };
  }
  if (bytes.byteLength > limits.maxFileBytes) {
    issues.push(
      issue(
        AsepriteIssueCode.ResourceLimit,
        `Aseprite file exceeds ${limits.maxFileBytes} bytes`,
        true,
        {
          offset: 0,
        },
      ),
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fileSize = view.getUint32(0, true);
  const magic = view.getUint16(ASEPRITE_MAGIC_OFFSET, true);
  const frames = view.getUint16(6, true);
  const width = view.getUint16(8, true);
  const height = view.getUint16(10, true);
  const depth = view.getUint16(12, true);
  const flags = view.getUint32(14, true);
  const speed = view.getUint16(18, true);
  const next = view.getUint32(20, true);
  const frit = view.getUint32(24, true);
  const transparentIndex = view.getUint8(28);
  const ncolorsRaw = view.getUint16(32, true);
  const pixelWidthRaw = view.getUint8(34);
  const pixelHeightRaw = view.getUint8(35);
  const gridX = view.getInt16(36, true);
  const gridY = view.getInt16(38, true);
  const gridWidth = view.getUint16(40, true);
  const gridHeight = view.getUint16(42, true);
  const normalizedFileSize = fileSize === 0 ? bytes.byteLength : fileSize;
  const fileEnd = Math.min(normalizedFileSize, bytes.byteLength);

  if (magic !== ASEPRITE_MAGIC) {
    issues.push(
      issue(
        AsepriteIssueCode.InvalidHeader,
        `Unexpected Aseprite magic 0x${magic.toString(16)}`,
        true,
        {
          offset: ASEPRITE_MAGIC_OFFSET,
        },
      ),
    );
  }
  if (fileSize !== 0 && fileSize < 128) {
    issues.push(
      issue(
        AsepriteIssueCode.InvalidHeader,
        `Aseprite file-size field ${fileSize} is shorter than its header`,
        true,
        { offset: 0 },
      ),
    );
  }
  if (fileSize > bytes.byteLength) {
    issues.push(
      issue(
        AsepriteIssueCode.Truncated,
        `Aseprite file-size field ${fileSize} exceeds ${bytes.byteLength} input bytes`,
        true,
        { offset: 0 },
      ),
    );
  }
  if (fileSize !== 0 && fileSize < bytes.byteLength) {
    issues.push(
      issue(
        AsepriteIssueCode.InvalidData,
        `Aseprite file-size field ${fileSize} leaves ${bytes.byteLength - fileSize} trailing bytes`,
        true,
        { offset: fileSize },
      ),
    );
  }
  if (frames < 1 || frames > limits.maxFrames) {
    issues.push(
      issue(AsepriteIssueCode.ResourceLimit, `Invalid frame count ${frames}`, true, { offset: 6 }),
    );
  }
  if (width < 1 || height < 1 || width > limits.maxWidth || height > limits.maxHeight) {
    issues.push(
      issue(AsepriteIssueCode.ResourceLimit, `Invalid sprite dimensions ${width}x${height}`, true, {
        offset: 8,
      }),
    );
  }
  if (![8, 16, 32].includes(depth)) {
    issues.push(
      issue(
        AsepriteIssueCode.UnsupportedDepth,
        `Unsupported Aseprite pixel depth (found depth ${depth})`,
        true,
        {
          offset: 12,
        },
      ),
    );
  }
  const header: HeaderInfo = {
    magic,
    fileSize,
    frames,
    width,
    height,
    depth,
    flags,
    speed,
    next,
    frit,
    transparentIndex,
    ignore: [view.getUint8(29), view.getUint8(30), view.getUint8(31)],
    ncolors: ncolorsRaw || 256,
    pixelWidth: pixelWidthRaw || 1,
    pixelHeight: pixelHeightRaw || 1,
    gridX,
    gridY,
    gridWidth,
    gridHeight,
    fileEnd,
  };
  return { header, issues };
}

function readChunks(
  bytes: Uint8Array,
  start: number,
  frameEnd: number,
  count: number,
  limits: AsepriteResourceLimits,
): { chunks: ChunkInfo[]; issues: AsepriteIssue[] } {
  const chunks: ChunkInfo[] = [];
  const issues: AsepriteIssue[] = [];
  const reader = new Reader(bytes, start, frameEnd);
  for (let i = 0; i < count; i += 1) {
    const chunkStart = reader.offset;
    if (reader.remaining < 6) {
      issues.push(
        issue(
          AsepriteIssueCode.Truncated,
          `Frame has ${reader.remaining} bytes left before chunk ${i}`,
          true,
          {
            offset: chunkStart,
          },
        ),
      );
      break;
    }
    const size = reader.u32();
    const type = reader.u16();
    if (size < 6 || size > limits.maxChunkBytes) {
      issues.push(
        issue(
          AsepriteIssueCode.InvalidChunk,
          `Invalid chunk size ${size} for type 0x${type.toString(16)}`,
          true,
          {
            offset: chunkStart,
            chunkType: type,
          },
        ),
      );
      break;
    }
    const end = chunkStart + size;
    if (end > frameEnd || end < reader.offset) {
      issues.push(
        issue(AsepriteIssueCode.Truncated, `Chunk 0x${type.toString(16)} exceeds its frame`, true, {
          offset: chunkStart,
          chunkType: type,
        }),
      );
      break;
    }
    const payloadStart = reader.offset;
    // Scanning borrows ranges; only data retained by the decoded model is copied.
    const payload = bytes.subarray(payloadStart, end);
    reader.skip(size - 6);
    chunks.push({ type, start: chunkStart, payloadStart, end, payload });
  }
  if (reader.offset !== frameEnd) {
    // Aseprite files in the wild occasionally have a stale chunk count. Extra
    // bytes are unsafe to interpret as chunks, so report a structural issue.
    issues.push(
      issue(
        AsepriteIssueCode.InvalidFrame,
        `Frame chunk data ends at ${reader.offset}, expected ${frameEnd}`,
        true,
        { offset: reader.offset },
      ),
    );
  }
  return { chunks, issues };
}

function parseFrameHeader(
  bytes: Uint8Array,
  start: number,
  fileEnd: number,
  limits: AsepriteResourceLimits,
  frameIndex: number,
): { frame?: { end: number; duration: number; count: number }; issues: AsepriteIssue[] } {
  const issues: AsepriteIssue[] = [];
  if (start + 16 > fileEnd) {
    issues.push(
      issue(AsepriteIssueCode.Truncated, `Frame ${frameIndex} has no complete header`, true, {
        offset: start,
        frameIndex,
      }),
    );
    return { issues };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = view.getUint32(start, true);
  const magic = view.getUint16(start + 4, true);
  const shortCount = view.getUint16(start + 6, true);
  const duration = view.getUint16(start + 8, true);
  const longCount = view.getUint32(start + 12, true);
  const count = shortCount === UINT16_MAX && longCount > shortCount ? longCount : shortCount;
  if (magic !== ASEPRITE_FRAME_MAGIC) {
    issues.push(
      issue(
        AsepriteIssueCode.InvalidFrame,
        `Unexpected frame ${frameIndex} magic 0x${magic.toString(16)}`,
        true,
        {
          offset: start + 4,
          frameIndex,
        },
      ),
    );
  }
  if (size < 16 || size > limits.maxChunkBytes || start + size > fileEnd) {
    issues.push(
      issue(AsepriteIssueCode.InvalidFrame, `Invalid frame ${frameIndex} size ${size}`, true, {
        offset: start,
        frameIndex,
      }),
    );
    return { issues };
  }
  if (count > limits.maxCels + limits.maxLayers + 100000) {
    issues.push(
      issue(
        AsepriteIssueCode.ResourceLimit,
        `Frame ${frameIndex} has too many chunks (${count})`,
        true,
        {
          offset: start + 6,
          frameIndex,
        },
      ),
    );
  }
  return { frame: { end: start + size, duration, count }, issues };
}

function parseLayerHeader(
  chunk: ChunkInfo,
  header: HeaderInfo,
  limits: AsepriteResourceLimits,
): { type: number; blendMode: number; flags: number; issues: AsepriteIssue[] } {
  const issues: AsepriteIssue[] = [];
  const r = new Reader(chunk.payload, 0, chunk.payload.byteLength);
  try {
    const flags = r.u16();
    const type = r.u16();
    r.u16(); // child level
    r.u16(); // default width
    r.u16(); // default height
    const blendMode = r.u16();
    r.u8(); // opacity
    r.skip(3);
    r.string(limits.maxStringBytes);
    if (type === LAYER_TILEMAP) r.u32();
    if (header.flags & 4) r.skip(16);
    if (r.remaining !== 0) {
      // Extra layer bytes are version extensions. Keep them harmless, but do
      // not mistake malformed short data for a valid layer.
    }
    return { type, blendMode, flags, issues };
  } catch (error) {
    issues.push(
      issue(
        AsepriteIssueCode.InvalidChunk,
        error instanceof Error ? error.message : "Invalid layer chunk",
        true,
        {
          offset: chunk.start,
          chunkType: chunk.type,
        },
      ),
    );
    return { type: -1, blendMode: 0, flags: 0, issues };
  }
}

function parseCelHeader(
  chunk: ChunkInfo,
  frameIndex: number,
  layers: number,
  limits: AsepriteResourceLimits,
  depth = 32,
): {
  layerIndex: number;
  type: number;
  width: number;
  height: number;
  linkedFrame?: number;
  issues: AsepriteIssue[];
} {
  const issues: AsepriteIssue[] = [];
  const r = new Reader(chunk.payload, 0, chunk.payload.byteLength);
  try {
    const layerIndex = r.u16();
    r.i16();
    r.i16();
    r.u8();
    const type = r.u16();
    r.i16();
    r.skip(5);
    if (layerIndex >= layers) {
      issues.push(
        issue(AsepriteIssueCode.InvalidData, `Cel references missing layer ${layerIndex}`, true, {
          offset: chunk.start,
          frameIndex,
          layerIndex,
          chunkType: chunk.type,
        }),
      );
    }
    if (type === CEL_RAW || type === CEL_COMPRESSED || type === CEL_COMPRESSED_TILEMAP) {
      const width = r.u16();
      const height = r.u16();
      if (type === CEL_COMPRESSED_TILEMAP) readTileMasks(r);
      const pixelCount = width * height;
      const decodedBytes =
        pixelCount * (type === CEL_COMPRESSED_TILEMAP ? 4 : depth / BITS_PER_BYTE);
      if (
        width < 1 ||
        height < 1 ||
        width > limits.maxWidth ||
        height > limits.maxHeight ||
        pixelCount > limits.maxCelPixels ||
        decodedBytes > limits.maxDecodedBytes
      ) {
        issues.push(
          issue(
            AsepriteIssueCode.ResourceLimit,
            `Cel has invalid dimensions ${width}x${height}`,
            true,
            {
              offset: chunk.start,
              frameIndex,
              layerIndex,
              chunkType: chunk.type,
            },
          ),
        );
      }
      if (type === CEL_RAW && r.remaining < decodedBytes) {
        issues.push(
          issue(
            AsepriteIssueCode.Truncated,
            `Raw cel needs ${decodedBytes} pixel bytes but only ${r.remaining} remain`,
            true,
            { offset: r.offset, frameIndex, layerIndex, chunkType: chunk.type },
          ),
        );
      }
      if (type === CEL_COMPRESSED && r.remaining < 1) {
        issues.push(
          issue(AsepriteIssueCode.Truncated, "Compressed cel has no compressed payload", true, {
            offset: r.offset,
            frameIndex,
            layerIndex,
            chunkType: chunk.type,
          }),
        );
      }
      return { layerIndex, type, width, height, issues };
    }
    if (type === CEL_LINK) {
      if (r.remaining < 2) throw new AsepriteCodecError("Linked cel has no source frame");
      const linkedFrame = r.u16();
      if (linkedFrame >= frameIndex) {
        issues.push(
          issue(
            AsepriteIssueCode.InvalidData,
            `Linked cel points forward to frame ${linkedFrame}`,
            true,
            {
              offset: chunk.start,
              frameIndex,
              layerIndex,
              chunkType: chunk.type,
            },
          ),
        );
      }
      return { layerIndex, type, width: 0, height: 0, linkedFrame, issues };
    }
    issues.push(
      issue(AsepriteIssueCode.UnsupportedCel, `Unsupported cel type ${type}`, true, {
        offset: chunk.start,
        frameIndex,
        layerIndex,
        chunkType: chunk.type,
      }),
    );
    return { layerIndex, type, width: 0, height: 0, issues };
  } catch (error) {
    issues.push(
      issue(
        AsepriteIssueCode.InvalidChunk,
        error instanceof Error ? error.message : "Invalid cel chunk",
        true,
        {
          offset: chunk.start,
          frameIndex,
          chunkType: chunk.type,
        },
      ),
    );
    return { layerIndex: 0, type: -1, width: 0, height: 0, issues };
  }
}

function scan(
  bytesInput: ArrayBuffer | Uint8Array,
  options: AsepriteDecodeOptions = {},
): { scan?: ScanResult; issues: AsepriteIssue[] } {
  const bytes = bytesOf(bytesInput);
  const limits = limitsFor(options.limits);
  const headerResult = readHeader(bytes, limits);
  const issues = headerResult.issues.slice();
  if (!headerResult.header) return { issues };
  const header = headerResult.header;
  const frames: ScanResult["frames"] = [];
  const layers: ScanResult["layers"] = [];
  let palette = defaultPalette(header.ncolors);
  let ignoreLegacyPalette = false;
  let offset = 128;
  let celCount = 0;
  let decodedBytes = 0;
  let expandedBytes = 0;
  for (let frameIndex = 0; frameIndex < header.frames; frameIndex += 1) {
    const frameHeader = parseFrameHeader(bytes, offset, header.fileEnd, limits, frameIndex);
    issues.push(...frameHeader.issues);
    if (!frameHeader.frame) break;
    const f = frameHeader.frame;
    const chunkResult = readChunks(bytes, offset + 16, f.end, f.count, limits);
    issues.push(...chunkResult.issues.map((entry) => ({ ...entry, frameIndex })));
    frames.push({
      start: offset,
      end: f.end,
      duration: f.duration || header.speed || 100,
      chunks: chunkResult.chunks,
    });
    for (const chunk of chunkResult.chunks) {
      if (chunk.type === CHUNK_LAYER) {
        const layer = parseLayerHeader(chunk, header, limits);
        issues.push(...layer.issues.map((entry) => ({ ...entry, frameIndex })));
        const layerIndex = layers.length;
        layers.push({
          index: layerIndex,
          type: layer.type,
          blendMode: layer.blendMode,
          layerIndex,
          flags: layer.flags,
        });
        if (layers.length > limits.maxLayers) {
          issues.push(
            issue(
              AsepriteIssueCode.ResourceLimit,
              `Sprite has more than ${limits.maxLayers} layers`,
              true,
              {
                offset: chunk.start,
                frameIndex,
                chunkType: chunk.type,
              },
            ),
          );
        }
        if (
          layer.type !== LAYER_TILEMAP &&
          layer.type !== LAYER_IMAGE &&
          layer.type !== LAYER_GROUP
        ) {
          issues.push(
            issue(
              AsepriteIssueCode.UnsupportedLayer,
              `Unsupported layer type ${layer.type}`,
              true,
              {
                offset: chunk.start,
                frameIndex,
                layerIndex,
                chunkType: chunk.type,
              },
            ),
          );
        }
        if (layer.blendMode > 18) {
          issues.push(
            issue(
              AsepriteIssueCode.UnsupportedBlendMode,
              `Layer ${layerIndex} uses unsupported blend mode ${layer.blendMode}`,
              true,
              { offset: chunk.start, frameIndex, layerIndex, chunkType: chunk.type },
            ),
          );
        }
      } else if (chunk.type === CHUNK_CEL) {
        celCount += 1;
        if (celCount > limits.maxCels) {
          issues.push(
            issue(
              AsepriteIssueCode.ResourceLimit,
              `Sprite has more than ${limits.maxCels} cels`,
              true,
              {
                offset: chunk.start,
                frameIndex,
                chunkType: chunk.type,
              },
            ),
          );
        }
        const cel = parseCelHeader(chunk, frameIndex, layers.length, limits, header.depth);
        issues.push(...cel.issues);
        if (
          cel.type === CEL_RAW ||
          cel.type === CEL_COMPRESSED ||
          cel.type === CEL_COMPRESSED_TILEMAP
        ) {
          decodedBytes +=
            cel.type === CEL_COMPRESSED_TILEMAP
              ? cel.width * cel.height * 4
              : asepriteCelDecodedBytes(cel.width, cel.height, header.depth);
          if (cel.type !== CEL_COMPRESSED_TILEMAP) expandedBytes += cel.width * cel.height * 4;
          if (expandedBytes > limits.maxExpandedBytes)
            issues.push(
              issue(
                AsepriteIssueCode.ResourceLimit,
                "Sprite image data exceeds the editor memory limit",
                true,
                { offset: chunk.start, frameIndex, chunkType: chunk.type },
              ),
            );
          if (decodedBytes > limits.maxDecodedBytes) {
            issues.push(
              issue(
                AsepriteIssueCode.ResourceLimit,
                `Decoded cel data exceeds ${limits.maxDecodedBytes} bytes`,
                true,
                { offset: chunk.start, frameIndex, chunkType: chunk.type },
              ),
            );
          }
        }
      } else if (chunk.type === CHUNK_TILESET) {
        try {
          const info = tilesetHeader(chunk, limits, header.depth);
          decodedBytes +=
            info.tileWidth *
            info.tileHeight *
            info.tileCount *
            (4 + (header.depth === 32 ? 0 : header.depth / BITS_PER_BYTE));
          if (decodedBytes > limits.maxDecodedBytes)
            throw new AsepriteCodecError("Tilesets exceed decoded memory limit");
        } catch (error) {
          issues.push(
            issue(
              AsepriteIssueCode.InvalidChunk,
              error instanceof Error ? error.message : "Invalid tileset",
              true,
              { offset: chunk.start, frameIndex, chunkType: chunk.type },
            ),
          );
        }
      } else if (chunk.type === CHUNK_EXTERNAL_FILE) {
        issues.push(...inspectExternalFiles(chunk, frameIndex, limits));
      } else if (
        chunk.type === CHUNK_FLI_COLOR ||
        chunk.type === CHUNK_FLI_COLOR2 ||
        chunk.type === CHUNK_PALETTE ||
        chunk.type === CHUNK_TAGS ||
        chunk.type === CHUNK_COLOR_PROFILE ||
        chunk.type === CHUNK_USER_DATA ||
        chunk.type === CHUNK_CEL_EXTRA
      ) {
        try {
          if (chunk.type === CHUNK_FLI_COLOR || chunk.type === CHUNK_FLI_COLOR2) {
            if (!ignoreLegacyPalette)
              palette = parseLegacyPalette(
                chunk,
                frameIndex,
                palette,
                chunk.type === CHUNK_FLI_COLOR,
              );
          } else if (chunk.type === CHUNK_PALETTE) {
            palette = parsePalette(chunk, frameIndex, limits, palette);
            ignoreLegacyPalette = true;
          } else if (chunk.type === CHUNK_TAGS) parseTags(chunk, limits);
          else if (chunk.type === CHUNK_COLOR_PROFILE) parseColorProfile(chunk);
          else if (chunk.type === CHUNK_USER_DATA) parseUserData(chunk, limits);
          else parseCelExtra(chunk);
        } catch (error) {
          issues.push(
            issue(
              AsepriteIssueCode.InvalidChunk,
              error instanceof Error ? error.message : "Invalid metadata chunk",
              true,
              {
                offset: chunk.start,
                frameIndex,
                chunkType: chunk.type,
                ...(error instanceof AsepriteCodecError && error.details
                  ? { details: error.details }
                  : {}),
              },
            ),
          );
        }
      } else if (
        chunk.type !== CHUNK_FLI_COLOR &&
        chunk.type !== CHUNK_FLI_COLOR2 &&
        chunk.type !== CHUNK_CEL_EXTRA &&
        chunk.type !== CHUNK_COLOR_PROFILE &&
        chunk.type !== CHUNK_EXTERNAL_FILE &&
        chunk.type !== CHUNK_MASK &&
        chunk.type !== CHUNK_PATH &&
        chunk.type !== CHUNK_TAGS &&
        chunk.type !== CHUNK_PALETTE &&
        chunk.type !== CHUNK_USER_DATA &&
        chunk.type !== CHUNK_SLICES &&
        chunk.type !== CHUNK_SLICE
      ) {
        // Preserve extension metadata, but refuse to import it by default: an
        // unknown chunk may carry a future rendering feature. An adapter can
        // explicitly choose allowUnsupported after presenting this diagnostic.
        issues.push(
          issue(
            AsepriteIssueCode.InvalidData,
            `Unknown chunk 0x${chunk.type.toString(16)} may affect rendering`,
            true,
            { offset: chunk.start, frameIndex, chunkType: chunk.type },
          ),
        );
      }
    }
    offset = f.end;
  }
  if (frames.length !== header.frames) {
    issues.push(
      issue(
        AsepriteIssueCode.Truncated,
        `Expected ${header.frames} frames but decoded ${frames.length}`,
        true,
      ),
    );
  }
  if (offset !== header.fileEnd) {
    issues.push(
      issue(AsepriteIssueCode.InvalidData, `Trailing bytes after final frame at ${offset}`, false, {
        offset,
      }),
    );
  }
  return { scan: { header, frames, layers, celCount, decodedBytes }, issues };
}

export interface AsepriteChunkRange {
  readonly start: number;
  readonly end: number;
}

const ASEPRITE_HEADER_BYTES = 128;
const ASEPRITE_FRAME_HEADER_BYTES = 16;

/** Ordered complete chunk ranges; surrounding file/frame headers remain caller-owned.
 * Reuses the decoder's structural readers without decoding pixels or metadata. */
export function readAsepriteChunkRanges(
  bytes: Uint8Array,
  options: Pick<AsepriteDecodeOptions, "limits"> = {},
): readonly AsepriteChunkRange[] {
  const limits = limitsFor(options.limits);
  const rejectInvalid = (issues: readonly AsepriteIssue[]) => {
    const fatal = issues.find((entry) => entry.fatal);
    if (fatal) throw new AsepriteCodecError(fatal.message);
  };
  const result = readHeader(bytes, limits);
  rejectInvalid(result.issues);
  const header = result.header;
  if (!header || header.fileSize !== bytes.length)
    throw new AsepriteCodecError("Invalid Aseprite object boundaries");
  const ranges: AsepriteChunkRange[] = [];
  let offset = ASEPRITE_HEADER_BYTES;
  for (let frameIndex = 0; frameIndex < header.frames; frameIndex++) {
    const frameResult = parseFrameHeader(bytes, offset, header.fileEnd, limits, frameIndex);
    rejectInvalid(frameResult.issues);
    if (!frameResult.frame) throw new AsepriteCodecError("Invalid Aseprite frame boundaries");
    const frame = frameResult.frame;
    const chunks = readChunks(
      bytes,
      offset + ASEPRITE_FRAME_HEADER_BYTES,
      frame.end,
      frame.count,
      limits,
    );
    rejectInvalid(chunks.issues);
    for (const chunk of chunks.chunks) ranges.push({ start: chunk.start, end: chunk.end });
    offset = frame.end;
  }
  if (offset !== bytes.length) throw new AsepriteCodecError("Invalid Aseprite object boundaries");
  return ranges;
}

/**
 * Inspect structure and unsupported features without inflating any cel.
 * Callers should show the issues before replacing the current document.
 */
export function preflightAseprite(
  bytes: ArrayBuffer | Uint8Array,
  options: Pick<AsepriteDecodeOptions, "limits"> = {},
): AsepritePreflightResult {
  const result = scan(bytes, options);
  return preflightResult(result);
}

function preflightResult(result: ReturnType<typeof scan>): AsepritePreflightResult {
  // Diagnostics exposed to callers must not permit changing the actual scan.
  const issues = result.issues.map((entry) => ({ ...entry }));
  if (!result.scan) return { ok: false, issues };
  const h = result.scan.header;
  const header: AsepritePreflightHeader = {
    magic: h.magic,
    fileSize: h.fileSize,
    frames: h.frames,
    width: h.width,
    height: h.height,
    depth: h.depth,
    flags: h.flags,
  };
  return { ok: !issues.some((entry) => entry.fatal), header, issues };
}

function chunkRecord(chunk: ChunkInfo, frameIndex?: number): AsepriteRawChunk {
  return {
    type: chunk.type,
    bytes: chunk.payload.slice(),
    ...(frameIndex === undefined ? {} : { frameIndex }),
  };
}

function parseLayer(
  chunk: ChunkInfo,
  header: HeaderInfo,
  index: number,
  parentIndex: number | undefined,
  limits: AsepriteResourceLimits,
): AsepriteLayer {
  const r = new Reader(chunk.payload);
  const flags = r.u16();
  const rawType = r.u16();
  const childLevel = r.u16();
  const defaultWidth = r.u16();
  const defaultHeight = r.u16();
  const blendMode = r.u16();
  const opacity = r.u8();
  r.skip(3);
  const name = r.string(limits.maxStringBytes);
  let tilesetIndex: number | undefined;
  if (rawType === LAYER_TILEMAP) tilesetIndex = r.u32();
  const uuid = header.flags & 4 ? r.bytesCopy(16) : undefined;
  const layerType: AsepriteLayer["type"] =
    rawType === LAYER_IMAGE
      ? AsepriteLayerType.Image
      : rawType === LAYER_GROUP
        ? AsepriteLayerType.Group
        : rawType === LAYER_TILEMAP
          ? AsepriteLayerType.Tilemap
          : AsepriteLayerType.Unknown;
  return {
    index,
    type: layerType,
    flags,
    visible: (flags & LAYER_VISIBLE) !== 0,
    editable: (flags & LAYER_EDITABLE) !== 0,
    moveLocked: (flags & LAYER_LOCK_MOVE) !== 0,
    locked: (flags & LAYER_EDITABLE) === 0,
    background: (flags & LAYER_BACKGROUND) !== 0,
    collapsed: (flags & LAYER_COLLAPSED) !== 0,
    reference: (flags & LAYER_REFERENCE) !== 0,
    continuous: (flags & LAYER_CONTINUOUS) !== 0,
    name,
    childLevel,
    ...(parentIndex === undefined ? {} : { parentIndex }),
    blendMode,
    opacity,
    defaultWidth,
    defaultHeight,
    ...(uuid ? { uuid } : {}),
    ...(tilesetIndex === undefined ? {} : { tilesetIndex }),
  };
}

function parseUserData(chunk: ChunkInfo, limits: AsepriteResourceLimits): AsepriteUserData {
  const r = new Reader(chunk.payload);
  const flags = r.u32();
  const value: AsepriteUserData = {};
  if (flags & USER_TEXT) value.text = r.string(limits.maxStringBytes);
  if (flags & USER_COLOR) value.color = [r.u8(), r.u8(), r.u8(), r.u8()];
  if (flags & USER_PROPERTIES) value.properties = r.bytesCopy(r.remaining);
  return value;
}

function parsePalette(
  chunk: ChunkInfo,
  frameIndex: number,
  limits: AsepriteResourceLimits,
  previous?: AsepritePalette,
): AsepritePalette {
  const r = new Reader(chunk.payload);
  const size = r.u32();
  const from = r.u32();
  const to = r.u32();
  r.skip(8);
  const entryCount = size || previous?.entries.length || 0;
  if (entryCount > limits.maxStringBytes || (entryCount > 0 && (from > to || to >= entryCount)))
    throw new AsepriteCodecError("Invalid palette range");
  const entries: AsepritePalette["entries"] = Array.from({ length: entryCount }, (_, index) => {
    const prior = previous?.entries[index];
    return prior ? { ...prior } : { red: 0, green: 0, blue: 0, alpha: 0 };
  });
  if (entryCount > 0) {
    for (let index = from; index <= to; index += 1) {
      const flags = r.u16();
      const entry: AsepritePalette["entries"][number] = {
        red: r.u8(),
        green: r.u8(),
        blue: r.u8(),
        alpha: r.u8(),
      };
      if (flags & 1) entry.name = r.string(limits.maxStringBytes);
      entries[index] = entry;
    }
  }
  return { entries, frameIndex };
}

function parseLegacyPalette(
  chunk: ChunkInfo,
  frameIndex: number,
  previous: AsepritePalette,
  sixBit: boolean,
): AsepritePalette {
  const r = new Reader(chunk.payload);
  const packets = r.u16();
  const entries = previous.entries.map((entry) => ({ ...entry }));
  let skip = 0;
  const readColor = () => {
    const value = r.u8();
    if (sixBit && value > 63) throw new AsepriteCodecError("6-bit legacy palette value exceeds 63");
    return sixBit ? (value << 2) | (value >> 4) : value;
  };
  for (let packet = 0; packet < packets; packet += 1) {
    skip += r.u8();
    const count = r.u8() || 256;
    if (skip + count > entries.length)
      throw new AsepriteCodecError("Legacy palette packet exceeds palette size", [], {
        packetIndex: packet,
        skip,
        colorCount: count,
        paletteSize: entries.length,
        sixBit,
      });
    for (let index = skip; index < skip + count; index += 1) {
      entries[index] = {
        red: readColor(),
        green: readColor(),
        blue: readColor(),
        alpha: UINT8_MAX,
      };
    }
  }
  return { entries, frameIndex };
}

function parseTags(chunk: ChunkInfo, limits: AsepriteResourceLimits): AsepriteTag[] {
  const r = new Reader(chunk.payload);
  const count = r.u16();
  r.skip(8);
  const tags: AsepriteTag[] = [];
  for (let index = 0; index < count; index += 1) {
    const from = r.u16();
    const to = r.u16();
    const directionRaw = r.u8();
    const direction = TAG_DIRECTIONS[directionRaw] || AsepriteTagDirection.Forward;
    const repeat = r.u16();
    r.skip(6);
    const red = r.u8();
    const green = r.u8();
    const blue = r.u8();
    r.u8();
    const name = r.string(limits.maxStringBytes);
    tags.push({ from, to, direction, repeat, color: [red, green, blue, UINT8_MAX], name });
  }
  return tags;
}

function parseColorProfile(chunk: ChunkInfo): AsepriteColorProfile {
  const r = new Reader(chunk.payload);
  const type = r.u16();
  const flags = r.u16();
  const gamma = r.i32() / FIXED_POINT_16_16_SCALE;
  r.skip(8);
  const gammaValue = flags & COLOR_PROFILE_GAMMA ? gamma : undefined;
  if (type === COLOR_PROFILE_NONE)
    return { type: "none", ...(gammaValue === undefined ? {} : { gamma: gammaValue }) };
  if (type === COLOR_PROFILE_SRGB)
    return { type: "srgb", ...(gammaValue === undefined ? {} : { gamma: gammaValue }) };
  if (type === COLOR_PROFILE_ICC) {
    const length = r.u32();
    if (length > r.remaining)
      throw new AsepriteCodecError("ICC profile exceeds color-profile chunk");
    return {
      type: "icc",
      data: r.bytesCopy(length),
      ...(gammaValue === undefined ? {} : { gamma: gammaValue }),
    };
  }
  throw new AsepriteCodecError(`Unsupported color profile type ${type}`);
}

const legacyEmptyTiles = new WeakMap<Uint32Array, Set<number>>();

function readTileMasks(r: Reader): { id: number; x: number; y: number; d: number; shift: number } {
  if (r.u16() !== 32) throw new AsepriteCodecError("Only 32-bit tile entries are supported");
  const id = r.u32(),
    x = r.u32(),
    y = r.u32(),
    d = r.u32();
  r.skip(10);
  if (!id || id & x || id & y || id & d || x & y || x & d || y & d)
    throw new AsepriteCodecError("Invalid overlapping tile masks");
  let shift = 0;
  while (!((id >>> shift) & 1)) shift++;
  const normalized = id >>> shift;
  if (
    normalized > 0x1fffffff ||
    ((normalized + 1) & normalized) !== 0 ||
    [x, y, d].some((v) => v !== 0 && (v & (v - 1)) !== 0)
  )
    throw new AsepriteCodecError("Invalid tile masks");
  return { id, x, y, d, shift };
}

function tilesetHeader(chunk: ChunkInfo, limits: AsepriteResourceLimits, depth: number) {
  const r = new Reader(chunk.payload),
    id = r.u32(),
    flags = r.u32(),
    tileCount = r.u32(),
    tileWidth = r.u16(),
    tileHeight = r.u16(),
    baseIndex = r.i16();
  r.skip(14);
  const name = r.string(limits.maxStringBytes);
  if (!(flags & 3)) throw new AsepriteCodecError("Tileset has no external or embedded data");
  const pixels = tileWidth * tileHeight * tileCount;
  if (
    tileWidth < 1 ||
    tileHeight < 1 ||
    tileWidth > limits.maxWidth ||
    tileHeight > limits.maxHeight ||
    tileCount > limits.maxCelPixels ||
    pixels > limits.maxCelPixels ||
    pixels * (4 + (depth === 32 ? 0 : depth / BITS_PER_BYTE)) > limits.maxDecodedBytes
  )
    throw new AsepriteCodecError("Tileset exceeds resource limits");
  const external = flags & 1 ? { fileId: r.u32(), tilesetId: r.u32(), fileName: "" } : undefined;
  const size = flags & 2 && tileCount ? r.u32() : 0;
  if (size > r.remaining || (flags & 2 && tileCount && size < 6))
    throw new AsepriteCodecError("Truncated embedded tileset");
  return {
    r,
    id,
    flags,
    tileCount,
    tileWidth,
    tileHeight,
    baseIndex,
    name,
    size,
    ...(external ? { external } : {}),
  };
}

function parseTileset(
  chunk: ChunkInfo,
  limits: AsepriteResourceLimits,
  depth: number,
  inflate?: AsepriteInflate,
  takeInflatedOwnership = false,
): AsepriteTileset | PromiseLike<AsepriteTileset> {
  const { r, size, ...ts } = tilesetHeader(chunk, limits, depth),
    expected = ts.tileWidth * ts.tileHeight * ts.tileCount * (depth / BITS_PER_BYTE);
  const finish = (data: Uint8Array): AsepriteTileset => {
    if (data.byteLength !== expected)
      throw new AsepriteCodecError("Incorrect inflated tileset size");
    return {
      ...ts,
      pixels:
        depth === 32
          ? !inflate || takeInflatedOwnership
            ? data
            : new Uint8Array(data)
          : new Uint8Array(),
      ...(depth === 32
        ? {}
        : { asepritePixels: !inflate || takeInflatedOwnership ? data : new Uint8Array(data) }),
    };
  };
  if (!(ts.flags & 2) || !ts.tileCount) {
    const data = new Uint8Array(expected);
    if (depth === 8 && !(ts.flags & 2)) data.fill(0);
    return finish(data);
  }
  const data = (inflate ?? inflateZlibExact)(r.bytesCopy(size), expected);
  return typeof (data as PromiseLike<Uint8Array>).then === "function"
    ? (data as PromiseLike<Uint8Array>).then(finish)
    : finish(data as Uint8Array);
}

/** Normalize legacy empty-tile encoding before exposing canonical references. */
function finishTilemaps(
  tilesets: AsepriteTileset[],
  layers: AsepriteLayer[],
  frames: AsepriteFrame[],
  header: HeaderInfo,
  limits: AsepriteResourceLimits,
): void {
  const ids = new Map<number, AsepriteTileset>(),
    legacy = new Map<number, number>();
  let bytes = 0;
  for (const ts of tilesets) {
    if (ids.has(ts.id)) throw new AsepriteCodecError("Duplicate tileset ID");
    ids.set(ts.id, ts);
    if (header.depth === 8 && !(ts.flags & 2)) ts.asepritePixels!.fill(header.transparentIndex);
    if (header.depth !== 32)
      ts.pixels = new Uint8Array(
        expandAsepriteSamples(
          {
            depth: header.depth as 8 | 16,
            width: ts.tileWidth,
            height: ts.tileHeight * ts.tileCount,
            data: ts.asepritePixels!,
          },
          frames[0]?.palette,
          header.transparentIndex,
        ),
      );
    if (!(ts.flags & 4)) {
      const tileBytes = ts.tileWidth * ts.tileHeight * 4;
      let empty = true;
      for (let i = 3; i < tileBytes && i < ts.pixels.length; i += 4)
        if (ts.pixels[i]) {
          empty = false;
          break;
        }
      const delta = ts.tileCount && empty ? 0 : 1;
      legacy.set(ts.id, delta);
      ts.baseIndex = delta ? 0 : 1;
      if (delta) {
        const data = new Uint8Array(ts.pixels.length + tileBytes);
        data.set(ts.pixels, tileBytes);
        ts.pixels = data;
        ts.tileCount++;
        if (ts.asepritePixels) {
          const tileSampleBytes = ts.tileWidth * ts.tileHeight * (header.depth / BITS_PER_BYTE),
            asepritePixels = new Uint8Array(ts.asepritePixels.length + tileSampleBytes);
          if (header.depth === 8) asepritePixels.fill(header.transparentIndex, 0, tileSampleBytes);
          asepritePixels.set(ts.asepritePixels, tileSampleBytes);
          ts.asepritePixels = asepritePixels;
        }
        if (ts.tileUserData) ts.tileUserData.unshift({});
      }
      ts.flags |= 4;
    }
    bytes += ts.pixels.byteLength + (ts.asepritePixels?.byteLength ?? 0);
  }
  for (const layer of layers)
    if (layer.type === AsepriteLayerType.Tilemap && !ids.has(layer.tilesetIndex!))
      throw new AsepriteCodecError("Tilemap layer references missing tileset");
  const visited = new Set<Uint32Array>();
  const images = new Set<Uint8Array>();
  for (const frame of frames)
    for (const cel of frame.cels) {
      if (!cel.tilemap) {
        for (const data of [cel.pixels, cel.asepritePixels])
          if (data && !images.has(data)) {
            images.add(data);
            bytes += data.byteLength;
          }
        continue;
      }
      const ts = ids.get(layers[cel.layerIndex].tilesetIndex!);
      if (!ts) throw new AsepriteCodecError("Tilemap cel references missing tileset");
      const tiles = cel.tilemap.tiles;
      if (visited.has(tiles)) continue;
      visited.add(tiles);
      bytes += tiles.byteLength;
      for (let i = 0; i < tiles.length; i++) {
        let value = tiles[i];
        const delta = legacy.get(ts.id);
        if (delta !== undefined)
          value = legacyEmptyTiles.get(tiles)?.has(i)
            ? 0
            : ((value & 0xe0000000) | ((value & 0x1fffffff) + delta)) >>> 0;
        if ((value & 0x1fffffff) >= ts.tileCount && (value & 0x1fffffff) !== 0)
          throw new AsepriteCodecError("Tile index outside referenced tileset");
        tiles[i] = value;
      }
    }
  if (bytes > limits.maxDecodedBytes)
    throw new AsepriteCodecError("Tilemap data exceeds decoded memory limit");
}

function resolveTilesetExternalFiles(
  tilesets: AsepriteTileset[],
  files: { id: number; type: number; fileName: string }[],
) {
  const byId = new Map(files.map((file) => [file.id, file]));
  for (const ts of tilesets)
    if (ts.external) {
      const file = byId.get(ts.external.fileId);
      if (!file || file.type !== 1)
        throw new AsepriteCodecError(`Tileset ${ts.id} references missing external file`);
      ts.external.fileName = file.fileName;
    }
}

function parseCel(
  chunk: ChunkInfo,
  frameIndex: number,
  layers: AsepriteLayer[],
  inflate: AsepriteInflate | undefined,
  limits: AsepriteResourceLimits,
  depth = 32,
  takeInflatedOwnership = false,
  deferPixels = false,
): AsepriteCel | PromiseLike<AsepriteCel> {
  const r = new Reader(chunk.payload);
  const layerIndex = r.u16();
  const x = r.i16();
  const y = r.i16();
  const opacity = r.u8();
  const rawType = r.u16();
  const zIndex = r.i16();
  r.skip(5);
  const layer = layers[layerIndex];
  if (!layer) throw new AsepriteCodecError(`Cel references missing layer ${layerIndex}`);
  if (rawType === CEL_LINK) {
    const linkedFrame = r.u16();
    return {
      layerIndex,
      x,
      y,
      opacity,
      zIndex,
      type: AsepriteCelType.Linked,
      width: 0,
      height: 0,
      rawType,
      linkedFrame,
    };
  }
  if (rawType !== CEL_RAW && rawType !== CEL_COMPRESSED && rawType !== CEL_COMPRESSED_TILEMAP) {
    throw new AsepriteCodecError(`Unsupported cel type ${rawType}`);
  }
  const width = r.u16();
  const height = r.u16();
  const masks = rawType === CEL_COMPRESSED_TILEMAP ? readTileMasks(r) : undefined;
  if ((layer.type === AsepriteLayerType.Tilemap) !== !!masks)
    throw new AsepriteCodecError("Cel type does not match layer type");
  const expected = width * height * (masks ? 4 : depth / BITS_PER_BYTE);
  if (
    width < 1 ||
    height < 1 ||
    width > limits.maxWidth ||
    height > limits.maxHeight ||
    width * height > limits.maxCelPixels ||
    expected > limits.maxDecodedBytes
  ) {
    throw new AsepriteCodecError(`Cel dimensions exceed resource limits: ${width}x${height}`);
  }
  let pixels: Uint8Array | PromiseLike<Uint8Array>;
  let compressedInput: Uint8Array | undefined;
  if (rawType === CEL_RAW) {
    if (r.remaining < expected) throw new AsepriteCodecError("Raw cel is truncated");
    pixels = r.bytesCopy(expected);
  } else {
    compressedInput = r.bytesCopy(r.remaining);
    pixels = (inflate ?? inflateZlibExact)(compressedInput, expected);
  }
  const finish = (decodedInput: Uint8Array): AsepriteCel => {
    let decoded = decodedInput;
    if (!(decoded instanceof Uint8Array))
      decoded = new Uint8Array(decoded as unknown as ArrayBuffer);
    if (decoded.byteLength !== expected)
      throw new AsepriteCodecError(
        `Inflated cel is ${decoded.byteLength} bytes; expected ${expected}`,
      );
    if (masks) {
      const tiles = new Uint32Array(width * height),
        view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
      const empty = new Set<number>();
      for (let i = 0; i < tiles.length; i++) {
        const value = view.getUint32(i * 4, true);
        if (value === 0xffffffff) empty.add(i);
        tiles[i] =
          (((value & masks.id) >>> masks.shift) |
            (value & masks.x ? 0x80000000 : 0) |
            (value & masks.y ? 0x40000000 : 0) |
            (value & masks.d ? 0x20000000 : 0)) >>>
          0;
      }
      if (empty.size) legacyEmptyTiles.set(tiles, empty);
      return {
        layerIndex,
        x,
        y,
        opacity,
        zIndex,
        type: AsepriteCelType.Tilemap,
        width,
        height,
        rawType,
        tilemap: { width, height, tiles },
      };
    }
    return {
      layerIndex,
      x,
      y,
      opacity,
      zIndex,
      type: rawType === CEL_RAW ? AsepriteCelType.Raw : AsepriteCelType.Compressed,
      width,
      height,
      ...(deferPixels && depth === 32
        ? {
            encodedPixels: {
              format: PixelStorageFormat.ZlibRgba,
              byteLength: expected,
              bytes: compressedInput ?? zlibSync(decoded, { level: 1 }),
              hasHiddenRgb: hasTransparentRgb(decoded),
            },
          }
        : depth === 32
          ? {
              pixels:
                rawType === CEL_RAW || !inflate || takeInflatedOwnership
                  ? decoded
                  : decoded.slice(),
            }
          : {
              asepritePixels:
                rawType === CEL_RAW || !inflate || takeInflatedOwnership
                  ? decoded
                  : decoded.slice(),
            }),
      rawType,
    };
  };
  if (pixels && typeof (pixels as PromiseLike<Uint8Array>).then === "function") {
    return (pixels as PromiseLike<Uint8Array>).then(finish);
  }
  return finish(pixels as Uint8Array);
}

function parseCelExtra(
  chunk: ChunkInfo,
): { x: number; y: number; width: number; height: number } | undefined {
  const r = new Reader(chunk.payload);
  const flags = r.u32();
  if (!(flags & 1) || r.remaining < 16) return undefined;
  return {
    x: r.i32() / FIXED_POINT_16_16_SCALE,
    y: r.i32() / FIXED_POINT_16_16_SCALE,
    width: r.i32() / FIXED_POINT_16_16_SCALE,
    height: r.i32() / FIXED_POINT_16_16_SCALE,
  };
}

function parseExternalFiles(
  chunk: ChunkInfo,
  limits: AsepriteResourceLimits,
): { id: number; type: number; fileName: string }[] {
  const r = new Reader(chunk.payload),
    count = r.u32(),
    result: { id: number; type: number; fileName: string }[] = [];
  r.skip(8);
  if (count > limits.maxCels)
    throw new AsepriteCodecError(`External-file count ${count} exceeds limits`);
  for (let i = 0; i < count; i++) {
    const id = r.u32(),
      type = r.u8();
    r.skip(7);
    const fileName = r.string(limits.maxStringBytes);
    if (type > 3) throw new AsepriteCodecError(`Unknown external-file type ${type}`);
    result.push({ id, type, fileName });
  }
  return result;
}
function inspectExternalFiles(
  chunk: ChunkInfo,
  frameIndex: number,
  limits: AsepriteResourceLimits,
): AsepriteIssue[] {
  const issues: AsepriteIssue[] = [];
  try {
    const files = parseExternalFiles(chunk, limits);
    if (files.some((file) => file.type === 3))
      issues.push(
        issue(
          AsepriteIssueCode.UnsupportedLayer,
          "Tile-management external files require unsupported tilemap rendering",
          true,
          { offset: chunk.start, frameIndex, chunkType: chunk.type },
        ),
      );
  } catch (error) {
    issues.push(
      issue(
        AsepriteIssueCode.InvalidChunk,
        error instanceof Error ? error.message : "Invalid external-file chunk",
        true,
        { offset: chunk.start, frameIndex, chunkType: chunk.type },
      ),
    );
  }
  return issues;
}

function setLinkedDimensions(frames: AsepriteFrame[]): void {
  for (const frame of frames) {
    for (const cel of frame.cels) {
      if (cel.type !== AsepriteCelType.Linked || cel.linkedFrame === undefined) continue;
      const source = frames[cel.linkedFrame]?.cels.find(
        (candidate) => candidate.layerIndex === cel.layerIndex,
      );
      if (!source || cel.linkedFrame >= frame.index)
        throw new AsepriteCodecError("Linked cel references missing or non-earlier source");
      if (source) {
        cel.width = source.width;
        cel.height = source.height;
        // Shared bytes model ASE linked-cel semantics while retaining the
        // link marker used by the encoder.
        if (source.tilemap) cel.tilemap = source.tilemap;
        if (source.pixels) cel.pixels = source.pixels;
        if (source.encodedPixels) cel.encodedPixels = source.encodedPixels;
        if (source.asepritePixels) cel.asepritePixels = source.asepritePixels;
      }
    }
  }
}

function expandAsepriteFrames(
  frames: AsepriteFrame[],
  layers: AsepriteLayer[],
  header: HeaderInfo,
  limits: AsepriteResourceLimits,
): void {
  if (header.depth === 32) return;
  const images = new Map<Uint8Array, Map<AsepritePalette | undefined, Uint8Array>>();
  let bytes = 0;
  let expandedBytes = 0;
  for (const frame of frames)
    for (const cel of frame.cels) {
      if (cel.tilemap) continue;
      if (!cel.asepritePixels) throw new AsepriteCodecError("Missing Aseprite cel sample bytes");
      let palettes = images.get(cel.asepritePixels);
      if (!palettes) {
        palettes = new Map();
        images.set(cel.asepritePixels, palettes);
        bytes += cel.asepritePixels.byteLength;
      }
      const palette = header.depth === 8 ? frame.palette : undefined;
      let pixels = palettes.get(palette);
      if (!pixels) {
        bytes += cel.width * cel.height * 4;
        expandedBytes += cel.width * cel.height * 4;
        if (bytes > limits.maxDecodedBytes || expandedBytes > limits.maxExpandedBytes)
          throw new AsepriteCodecError("Aseprite image projections exceed decoded memory limit");
        const expanded = expandAsepriteSamples(
          {
            depth: header.depth as 8 | 16,
            width: cel.width,
            height: cel.height,
            data: cel.asepritePixels,
          },
          palette,
          layers[cel.layerIndex].background ? -1 : header.transparentIndex,
        );
        pixels = new Uint8Array(expanded.buffer, expanded.byteOffset, expanded.byteLength);
        palettes.set(palette, pixels);
      }
      cel.pixels = pixels;
    }
}

async function decodeInternal(
  bytesInput: ArrayBuffer | Uint8Array,
  options: AsepriteDecodeOptions = {},
): Promise<AsepriteSprite> {
  const limits = limitsFor(options.limits);
  const bytes = decodeInput(bytesInput, options, limits);
  // The exact bytes and resolved limits used for inspection also drive decoding.
  const result = scan(bytes, { limits });
  options.onPreflight?.(preflightResult(result));
  const issues = result.issues;
  if (!result.scan) throw new AsepriteCodecError("Invalid Aseprite file", issues);
  if (
    options.preflight !== false &&
    issues.some((entry) => entry.fatal) &&
    !options.allowUnsupported
  ) {
    throw new AsepriteCodecError("Aseprite preflight rejected this file", issues);
  }
  const { header, frames: scannedFrames } = result.scan;
  const state: DecodeState = {
    header,
    layers: [],
    frames: [],
    tags: [],
    chunks: [],
    palette: defaultPalette(header.ncolors),
  };
  let layerCursor = 0;
  let parentStack: number[] = [];
  let ignoreLegacyPalette = false;
  let lastTarget:
    | {
        kind: "sprite" | "layer" | "cel" | "tag" | "tileset";
        value: AsepriteSprite | AsepriteLayer | AsepriteCel | AsepriteTag | AsepriteTileset;
      }
    | undefined;
  let nextTagUserData = 0;
  const tilesets: AsepriteTileset[] = [];
  const externalFiles: { id: number; type: number; fileName: string }[] = [];
  let tileUserIndex = -1;
  for (let frameIndex = 0; frameIndex < scannedFrames.length; frameIndex += 1) {
    const scanned = scannedFrames[frameIndex];
    const frame: AsepriteFrame = {
      index: frameIndex,
      duration: scanned.duration,
      cels: [],
      chunks: [],
    };
    state.frames.push(frame);
    let lastCel: AsepriteCel | undefined;
    for (const chunk of scanned.chunks) {
      try {
        if (chunk.type === CHUNK_LAYER) {
          const layerReader = new Reader(chunk.payload);
          layerReader.u16();
          layerReader.u16();
          const childLevel = layerReader.u16();
          while (
            parentStack.length &&
            state.layers[parentStack[parentStack.length - 1]].childLevel >= childLevel
          )
            parentStack.pop();
          const parentIndex = parentStack.length ? parentStack[parentStack.length - 1] : undefined;
          const layer = parseLayer(chunk, header, layerCursor, parentIndex, limits);
          state.layers.push(layer);
          layerCursor += 1;
          if (layer.type === AsepriteLayerType.Group) parentStack.push(layer.index);
          lastTarget = { kind: "layer", value: layer };
        } else if (chunk.type === CHUNK_TILESET) {
          const ts = await parseTileset(
            chunk,
            limits,
            header.depth,
            options.inflate,
            options.takeInflatedOwnership,
          );
          tilesets.push(ts);
          lastTarget = { kind: "tileset", value: ts };
          tileUserIndex = -1;
        } else if (chunk.type === CHUNK_CEL) {
          const cel = await parseCel(
            chunk,
            frameIndex,
            state.layers,
            options.inflate,
            limits,
            header.depth,
            options.takeInflatedOwnership,
            options.deferPixels,
          );
          frame.cels.push(cel);
          lastCel = cel;
          lastTarget = { kind: "cel", value: cel };
        } else if (chunk.type === CHUNK_CEL_EXTRA) {
          const bounds = parseCelExtra(chunk);
          if (bounds && lastCel) lastCel.preciseBounds = bounds;
        } else if (chunk.type === CHUNK_PALETTE) {
          state.palette = parsePalette(chunk, frameIndex, limits, state.palette);
          ignoreLegacyPalette = true;
        } else if (chunk.type === CHUNK_TAGS) {
          state.tags = parseTags(chunk, limits);
          nextTagUserData = 0;
          lastTarget = state.tags.length ? { kind: "tag", value: state.tags[0] } : undefined;
        } else if (chunk.type === CHUNK_COLOR_PROFILE) {
          state.colorProfile = parseColorProfile(chunk);
        } else if (
          chunk.type === CHUNK_USER_DATA &&
          state.chunks[state.chunks.length - 1]?.type === CHUNK_SLICE
        ) {
          state.chunks.push(chunkRecord(chunk, frameIndex));
        } else if (chunk.type === CHUNK_USER_DATA) {
          const data = parseUserData(chunk, limits);
          if (lastTarget?.kind === "tileset") {
            const ts = lastTarget.value as AsepriteTileset;
            if (tileUserIndex < 0) ts.userData = data;
            else if (tileUserIndex < ts.tileCount) (ts.tileUserData ??= [])[tileUserIndex] = data;
            else throw new AsepriteCodecError("Too many tile user data chunks");
            tileUserIndex++;
          } else if (lastTarget?.kind === "layer" || lastTarget?.kind === "cel") {
            (lastTarget.value as AsepriteLayer | AsepriteCel).userData = data;
          } else if (lastTarget?.kind === "tag") {
            const tag = state.tags[nextTagUserData];
            if (tag) tag.userData = data;
            nextTagUserData += 1;
            if (state.tags[nextTagUserData])
              lastTarget = { kind: "tag", value: state.tags[nextTagUserData] };
          } else {
            state.userData = data;
          }
        } else if (chunk.type === CHUNK_FLI_COLOR || chunk.type === CHUNK_FLI_COLOR2) {
          if (!ignoreLegacyPalette)
            state.palette = parseLegacyPalette(
              chunk,
              frameIndex,
              state.palette || defaultPalette(header.ncolors),
              chunk.type === CHUNK_FLI_COLOR,
            );
          state.chunks.push(chunkRecord(chunk, frameIndex));
        } else if (
          chunk.type === CHUNK_EXTERNAL_FILE ||
          chunk.type === CHUNK_MASK ||
          chunk.type === CHUNK_PATH ||
          chunk.type === CHUNK_SLICES ||
          chunk.type === CHUNK_SLICE ||
          chunk.type === CHUNK_TILESET
        ) {
          if (chunk.type === CHUNK_EXTERNAL_FILE)
            externalFiles.push(...parseExternalFiles(chunk, limits));
          // These chunks are harmless metadata for the RGBA model. Keep the
          // exact payload available to a future adapter.
          state.chunks.push(chunkRecord(chunk, frameIndex));
        } else {
          frame.chunks?.push(chunkRecord(chunk, frameIndex));
        }
      } catch (error) {
        if (!options.allowUnsupported) throw error;
        state.chunks.push(chunkRecord(chunk, frameIndex));
      }
    }
    frame.palette = state.palette;
  }
  for (let i = 0; i < state.frames.length; i++) state.frames[i].palette ??= state.palette;
  setLinkedDimensions(state.frames);
  expandAsepriteFrames(state.frames, state.layers, header, limits);
  resolveTilesetExternalFiles(tilesets, externalFiles);
  finishTilemaps(tilesets, state.layers, state.frames, header, limits);
  const format = (options.fileName || "").toLowerCase().endsWith(".ase") ? "ase" : "aseprite";
  const sprite: AsepriteSprite = {
    tilesets,
    externalFiles,
    width: header.width,
    height: header.height,
    depth: header.depth,
    frames: state.frames,
    layers: state.layers,
    flags: header.flags,
    header: {
      fileSize: header.fileSize,
      magic: header.magic,
      speed: header.speed,
      next: header.next,
      frit: header.frit,
      transparentIndex: header.transparentIndex,
      ncolors: header.ncolors,
      pixelWidth: header.pixelWidth,
      pixelHeight: header.pixelHeight,
      gridX: header.gridX,
      gridY: header.gridY,
      gridWidth: header.gridWidth,
      gridHeight: header.gridHeight,
      ignore: header.ignore,
    },
    ...(state.palette ? { palette: state.palette } : {}),
    tags: state.tags,
    ...(state.colorProfile ? { colorProfile: state.colorProfile } : {}),
    ...(state.userData ? { userData: state.userData } : {}),
    chunks: state.chunks,
    format,
  };
  return sprite;
}

/** Decode an Aseprite .ase/.aseprite file with an injected inflater. */
export async function decodeAseprite(
  bytes: ArrayBuffer | Uint8Array,
  options: AsepriteDecodeOptions = {},
): Promise<AsepriteSprite> {
  return decodeInternal(bytes, { ...options });
}

/**
 * Synchronous decoder for raw-cel-only files or synchronous inflate adapters.
 * The normal API is async because browser DecompressionStream is async.
 */
export function decodeAsepriteSync(
  bytes: ArrayBuffer | Uint8Array,
  decodeOptions: AsepriteDecodeOptions = {},
): AsepriteSprite {
  const options = { ...decodeOptions };
  const limits = limitsFor(options.limits);
  const input = decodeInput(bytes, options, limits);
  const result = scan(input, { limits });
  options.onPreflight?.(preflightResult(result));
  if (!result.scan) throw new AsepriteCodecError("Invalid Aseprite file", result.issues);
  if (
    options.preflight !== false &&
    result.issues.some((entry) => entry.fatal) &&
    !options.allowUnsupported
  ) {
    throw new AsepriteCodecError("Aseprite preflight rejected this file", result.issues);
  }
  const { header, frames: scannedFrames } = result.scan;
  const layers: AsepriteLayer[] = [];
  const frames: AsepriteFrame[] = [];
  const tags: AsepriteTag[] = [];
  const chunks: AsepriteRawChunk[] = [];
  let palette: AsepritePalette = defaultPalette(header.ncolors);
  let colorProfile: AsepriteColorProfile | undefined;
  let userData: AsepriteUserData | undefined;
  let layerCursor = 0;
  let parentStack: number[] = [];
  let ignoreLegacyPalette = false;
  let lastTarget:
    | {
        kind: "sprite" | "layer" | "cel" | "tag" | "tileset";
        value: AsepriteSprite | AsepriteLayer | AsepriteCel | AsepriteTag | AsepriteTileset;
      }
    | undefined;
  let nextTagUserData = 0;
  const tilesets: AsepriteTileset[] = [];
  const externalFiles: { id: number; type: number; fileName: string }[] = [];
  let tileUserIndex = -1;
  for (let frameIndex = 0; frameIndex < scannedFrames.length; frameIndex += 1) {
    const scanned = scannedFrames[frameIndex];
    const frame: AsepriteFrame = {
      index: frameIndex,
      duration: scanned.duration,
      cels: [],
      chunks: [],
    };
    frames.push(frame);
    let lastCel: AsepriteCel | undefined;
    for (const chunk of scanned.chunks) {
      if (chunk.type === CHUNK_LAYER) {
        const layerReader = new Reader(chunk.payload);
        layerReader.u16();
        layerReader.u16();
        const childLevel = layerReader.u16();
        while (
          parentStack.length &&
          layers[parentStack[parentStack.length - 1]].childLevel >= childLevel
        )
          parentStack.pop();
        const parentIndex = parentStack.length ? parentStack[parentStack.length - 1] : undefined;
        const layer = parseLayer(chunk, header, layerCursor, parentIndex, limits);
        layers.push(layer);
        layerCursor += 1;
        if (layer.type === AsepriteLayerType.Group) parentStack.push(layer.index);
        lastTarget = { kind: "layer", value: layer };
      } else if (chunk.type === CHUNK_TILESET) {
        const parsed = parseTileset(
          chunk,
          limits,
          header.depth,
          options.inflate,
          options.takeInflatedOwnership,
        );
        if (typeof (parsed as PromiseLike<AsepriteTileset>).then === "function")
          throw new AsepriteCodecError("decodeAsepriteSync requires synchronous inflate");
        const ts = parsed as AsepriteTileset;
        tilesets.push(ts);
        lastTarget = { kind: "tileset", value: ts };
        tileUserIndex = -1;
      } else if (chunk.type === CHUNK_CEL) {
        const parsed = parseCel(
          chunk,
          frameIndex,
          layers,
          options.inflate,
          limits,
          header.depth,
          options.takeInflatedOwnership,
          options.deferPixels,
        );
        if (parsed && typeof (parsed as PromiseLike<AsepriteCel>).then === "function") {
          throw new AsepriteCodecError(
            "decodeAsepriteSync requires a synchronous inflate function",
          );
        }
        const cel = parsed as AsepriteCel;
        frame.cels.push(cel);
        lastCel = cel;
        lastTarget = { kind: "cel", value: cel };
      } else if (chunk.type === CHUNK_CEL_EXTRA) {
        const bounds = parseCelExtra(chunk);
        if (bounds && lastCel) lastCel.preciseBounds = bounds;
      } else if (chunk.type === CHUNK_PALETTE) {
        palette = parsePalette(chunk, frameIndex, limits, palette);
        ignoreLegacyPalette = true;
      } else if (chunk.type === CHUNK_TAGS) {
        tags.splice(0, tags.length, ...parseTags(chunk, limits));
        nextTagUserData = 0;
        lastTarget = tags.length ? { kind: "tag", value: tags[0] } : undefined;
      } else if (chunk.type === CHUNK_COLOR_PROFILE) {
        colorProfile = parseColorProfile(chunk);
      } else if (
        chunk.type === CHUNK_USER_DATA &&
        chunks[chunks.length - 1]?.type === CHUNK_SLICE
      ) {
        chunks.push(chunkRecord(chunk, frameIndex));
      } else if (chunk.type === CHUNK_USER_DATA) {
        const data = parseUserData(chunk, limits);
        if (lastTarget?.kind === "tileset") {
          const ts = lastTarget.value as AsepriteTileset;
          if (tileUserIndex < 0) ts.userData = data;
          else if (tileUserIndex < ts.tileCount) (ts.tileUserData ??= [])[tileUserIndex] = data;
          else throw new AsepriteCodecError("Too many tile user data chunks");
          tileUserIndex++;
        } else if (lastTarget?.kind === "layer" || lastTarget?.kind === "cel") {
          (lastTarget.value as AsepriteLayer | AsepriteCel).userData = data;
        } else if (lastTarget?.kind === "tag") {
          if (tags[nextTagUserData]) tags[nextTagUserData].userData = data;
          nextTagUserData += 1;
          if (tags[nextTagUserData]) lastTarget = { kind: "tag", value: tags[nextTagUserData] };
        } else {
          userData = data;
        }
      } else if (chunk.type === CHUNK_FLI_COLOR || chunk.type === CHUNK_FLI_COLOR2) {
        if (!ignoreLegacyPalette)
          palette = parseLegacyPalette(chunk, frameIndex, palette, chunk.type === CHUNK_FLI_COLOR);
        chunks.push(chunkRecord(chunk, frameIndex));
      } else if (
        chunk.type === CHUNK_EXTERNAL_FILE ||
        chunk.type === CHUNK_MASK ||
        chunk.type === CHUNK_PATH ||
        chunk.type === CHUNK_SLICES ||
        chunk.type === CHUNK_SLICE ||
        chunk.type === CHUNK_TILESET
      ) {
        if (chunk.type === CHUNK_EXTERNAL_FILE)
          externalFiles.push(...parseExternalFiles(chunk, limits));
        chunks.push(chunkRecord(chunk, frameIndex));
      } else {
        frame.chunks?.push(chunkRecord(chunk, frameIndex));
      }
    }
    frame.palette = palette;
  }
  for (let i = 0; i < frames.length; i++) frames[i].palette ??= palette;
  setLinkedDimensions(frames);
  expandAsepriteFrames(frames, layers, header, limits);
  resolveTilesetExternalFiles(tilesets, externalFiles);
  finishTilemaps(tilesets, layers, frames, header, limits);
  const format = (options.fileName || "").toLowerCase().endsWith(".ase") ? "ase" : "aseprite";
  return {
    tilesets,
    externalFiles,
    width: header.width,
    height: header.height,
    depth: header.depth,
    frames,
    layers,
    flags: header.flags,
    header: {
      fileSize: header.fileSize,
      magic: header.magic,
      speed: header.speed,
      next: header.next,
      frit: header.frit,
      transparentIndex: header.transparentIndex,
      ncolors: header.ncolors,
      pixelWidth: header.pixelWidth,
      pixelHeight: header.pixelHeight,
      gridX: header.gridX,
      gridY: header.gridY,
      gridWidth: header.gridWidth,
      gridHeight: header.gridHeight,
      ignore: header.ignore,
    },
    ...(palette ? { palette } : {}),
    tags,
    ...(colorProfile ? { colorProfile } : {}),
    ...(userData ? { userData } : {}),
    chunks,
    format,
  };
}
