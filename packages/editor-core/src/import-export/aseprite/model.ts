import type { EncodedRgbaPixels } from "$/base/primitives";

/**
 * Platform independent data exchanged by the Aseprite codec.
 *
 * The codec deliberately keeps the decoded file model separate from the
 * editor's document model.  A cel's `pixels` are tightly packed RGBA bytes,
 * one row after another, and are present for raw and compressed image cels.
 * Linked cels retain their link so callers can choose whether to resolve it.
 */

export enum AsepriteCelType {
  Raw = "raw",
  Compressed = "compressed",
  Linked = "linked",
  Tilemap = "tilemap",
  Unknown = "unknown",
}
export enum AsepriteLayerType {
  Image = "image",
  Group = "group",
  Tilemap = "tilemap",
  Unknown = "unknown",
}

export interface AsepriteHeaderMetadata {
  /** Original header file-size field. The encoder recalculates it. */
  fileSize: number;
  /** Original header magic (normally 0xa5e0). */
  magic: number;
  /** Deprecated default frame duration field. */
  speed: number;
  /** Header next/frit fields, retained for round-trip diagnostics. */
  next: number;
  frit: number;
  transparentIndex: number;
  /** 0 means 256 in the on-disk format; this value is normalized to 256. */
  ncolors: number;
  pixelWidth: number;
  pixelHeight: number;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  /** Header bytes 24..27 that Aseprite currently reserves. */
  ignore: readonly [number, number, number];
}

export interface AsepritePaletteEntry {
  red: number;
  green: number;
  blue: number;
  alpha: number;
  name?: string;
}

export interface AsepritePalette {
  entries: AsepritePaletteEntry[];
  /** Frame on which this palette chunk was encountered, when known. */
  frameIndex?: number;
}

export enum AsepriteTagDirection {
  Forward = "forward",
  Reverse = "reverse",
  PingPong = "ping-pong",
  PingPongReverse = "ping-pong-reverse",
}

export interface AsepriteTag {
  from: number;
  to: number;
  direction: AsepriteTagDirection;
  repeat: number;
  color: [number, number, number, number];
  name: string;
  userData?: AsepriteUserData;
}

export interface AsepriteUserData {
  text?: string;
  color?: [number, number, number, number];
  /** Serialized Aseprite property maps, retained for lossless file round trips. */
  properties?: Uint8Array;
}

export type AsepriteColorProfile =
  | { type: "none"; gamma?: number }
  | { type: "srgb"; gamma?: number }
  | { type: "icc"; gamma?: number; data: Uint8Array };

export interface AsepriteLayer {
  /** Index in the file's layer table. Cel layerIndex values refer to this. */
  index: number;
  type: AsepriteLayerType;
  flags: number;
  /** Aseprite layer flags decoded from `flags`. */
  visible: boolean;
  editable: boolean;
  /** Lock-move flag is distinct from the pixel-edit lock. */
  moveLocked?: boolean;
  locked: boolean;
  background: boolean;
  collapsed: boolean;
  reference: boolean;
  continuous: boolean;
  name: string;
  childLevel: number;
  /** Index of the nearest preceding group at a lower child level, if any. */
  parentIndex?: number;
  blendMode: number;
  opacity: number;
  defaultWidth: number;
  defaultHeight: number;
  uuid?: Uint8Array;
  tilesetIndex?: number;
  userData?: AsepriteUserData;
}

export interface AsepriteTileset {
  id: number;
  flags: number;
  name: string;
  tileWidth: number;
  tileHeight: number;
  tileCount: number;
  baseIndex: number;
  pixels: Uint8Array;
  asepritePixels?: Uint8Array;
  /** Aseprite external-file reference; pixels may be absent from the file. */
  external?: { fileId: number; tilesetId: number; fileName: string };
  userData?: AsepriteUserData;
  tileUserData?: AsepriteUserData[];
}

export interface AsepriteCel {
  /** Grid dimensions and canonical tile index/flip bits. */
  tilemap?: { width: number; height: number; tiles: Uint32Array };
  layerIndex: number;
  x: number;
  y: number;
  opacity: number;
  zIndex: number;
  type: AsepriteCelType;
  width: number;
  height: number;
  /** Packed RGBA8 data for image cels. Linked cels may expose resolved source bytes. */
  pixels?: Uint8Array;
  encodedPixels?: EncodedRgbaPixels;
  /** Original indexed/grayscale image samples; retained independently of RGBA projection. */
  asepritePixels?: Uint8Array;
  /** Source frame for a linked cel. Aseprite links are within one layer. */
  linkedFrame?: number;
  /** Original numeric cel type, retained for diagnostics and round-trip policy. */
  rawType: number;
  preciseBounds?: { x: number; y: number; width: number; height: number };
  userData?: AsepriteUserData;
}

export interface AsepriteFrame {
  /** Effective palette for this frame (unchanged frames share the same snapshot). */
  palette?: AsepritePalette;
  index: number;
  duration: number;
  cels: AsepriteCel[];
  /** Unknown/unsupported chunks encountered in this frame, payload only. */
  chunks?: AsepriteRawChunk[];
}

export interface AsepriteRawChunk {
  type: number;
  /** Chunk payload, excluding the 4-byte size and 2-byte type fields. */
  bytes: Uint8Array;
  frameIndex?: number;
}

export interface AsepriteSprite {
  tilesets?: AsepriteTileset[];
  externalFiles?: { id: number; type: number; fileName: string }[];
  width: number;
  height: number;
  depth: number;
  frames: AsepriteFrame[];
  layers: AsepriteLayer[];
  flags: number;
  header: AsepriteHeaderMetadata;
  palette?: AsepritePalette;
  tags: AsepriteTag[];
  colorProfile?: AsepriteColorProfile;
  userData?: AsepriteUserData;
  /** Unknown chunks are retained when harmless; they are not interpreted. */
  chunks: AsepriteRawChunk[];
  /** File extension is intentionally advisory; both .ase and .aseprite use this format. */
  format: "ase" | "aseprite";
}

/** Authored metadata retained by the editor. Pixel/sample/tile arrays belong to
 * canonical timeline cels and tilesets, rather than a second source graph. */
export type AsepriteCelMetadata = Omit<
  AsepriteCel,
  "pixels" | "encodedPixels" | "asepritePixels" | "tilemap"
>;
export type AsepriteFrameMetadata = Omit<AsepriteFrame, "cels"> & { cels: AsepriteCelMetadata[] };
export type AsepriteSourceMetadata = Omit<AsepriteSprite, "frames" | "tilesets"> & {
  frames: AsepriteFrameMetadata[];
};

export interface AsepriteResourceLimits {
  maxFileBytes: number;
  maxWidth: number;
  maxHeight: number;
  maxFrames: number;
  maxLayers: number;
  maxCels: number;
  maxChunkBytes: number;
  maxCelPixels: number;
  maxDecodedBytes: number;
  /** RGBA cel projections, excluding retained indexed/gray source samples. */
  maxExpandedBytes: number;
  maxStringBytes: number;
}

export interface AsepriteDecodeOptions {
  /** Required for compressed cels. Node/browser adapters provide this function. */
  inflate?: AsepriteInflate;
  limits?: Partial<AsepriteResourceLimits>;
  /** Optional filename used only to select the advisory format field. */
  fileName?: string;
  /** Run unsupported-feature preflight first (default true). */
  preflight?: boolean;
  /** Permit unsupported feature diagnostics to return a partial model. Default false. */
  allowUnsupported?: boolean;
  /** Inspect this decode's validated scan before any cel is inflated. Throw to reject it. */
  onPreflight?: (result: AsepritePreflightResult) => void;
  /** Transfer ownership of the input to this call without detaching its buffer.
   * The caller must not mutate or reuse it during decoding. Otherwise a private
   * snapshot is taken so asynchronous inflaters cannot observe caller edits. */
  takeOwnership?: boolean;
  /** The inflater returns fresh owned output and will never mutate/reuse it. */
  takeInflatedOwnership?: boolean;
  /** Validate RGB cels but retain their zlib backing instead of every RGBA frame. */
  deferPixels?: boolean;
}

export type AsepriteInflate = (
  bytes: Uint8Array,
  expectedBytes: number,
) => Uint8Array | PromiseLike<Uint8Array>;

export enum AsepriteIssueCode {
  InvalidHeader = "invalid-header",
  Truncated = "truncated",
  InvalidFrame = "invalid-frame",
  InvalidChunk = "invalid-chunk",
  ResourceLimit = "resource-limit",
  UnsupportedDepth = "unsupported-depth",
  UnsupportedLayer = "unsupported-layer",
  UnsupportedCel = "unsupported-cel",
  UnsupportedBlendMode = "unsupported-blend-mode",
  InvalidData = "invalid-data",
}

export interface AsepriteIssue {
  code: AsepriteIssueCode;
  message: string;
  offset?: number;
  frameIndex?: number;
  layerIndex?: number;
  chunkType?: number;
  details?: Readonly<Record<string, unknown>>;
  fatal: boolean;
}

export interface AsepritePreflightHeader {
  magic: number;
  fileSize: number;
  frames: number;
  width: number;
  height: number;
  depth: number;
  flags: number;
}

export interface AsepritePreflightResult {
  ok: boolean;
  header?: AsepritePreflightHeader;
  issues: AsepriteIssue[];
}

export interface AsepriteEncodeOptions {
  /** Reuse validated compressed RGB backing for unchanged cels. */
  preserveCelCompression?: boolean;
  fileName?: string;
  /** Preserve opaque chunks where the encoder can place them safely. */
  preserveUnknownChunks?: boolean;
  /** Emit compressed image cels using the injected deflate function. */
  compress?: boolean;
  deflate?: (bytes: Uint8Array) => Uint8Array | PromiseLike<Uint8Array>;
  limits?: Partial<AsepriteResourceLimits>;
}

export const DEFAULT_ASEPRITE_LIMITS: AsepriteResourceLimits = {
  maxFileBytes: 256 * 1024 * 1024,
  maxWidth: 16384,
  maxHeight: 16384,
  maxFrames: 10000,
  maxLayers: 10000,
  maxCels: 1_000_000,
  maxChunkBytes: 256 * 1024 * 1024,
  maxCelPixels: 100_000_000,
  maxDecodedBytes: 512 * 1024 * 1024,
  maxExpandedBytes: 512 * 1024 * 1024,
  maxStringBytes: 1024 * 1024,
};
