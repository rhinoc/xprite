import { unzlibSync } from "fflate";

import { RecoveryCompression } from "$/adapters/workers/recovery-compression";
import { crc32 } from "@xprite/bedrock/common/crc32";
import { EDITOR_ASEPRITE_LIMITS } from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

const MIN_COMPRESSION_BYTES = 1024;
const ENCODING_OVERHEAD_BYTES = 256;
// Recent projects also retain their preview, original codec data and PNG preview.
const MAX_RESTORED_BYTES = EDITOR_ASEPRITE_LIMITS.maxDecodedBytes * 4;

enum BinaryKind {
  Buffer,
  Uint8,
  Clamped8,
  Uint16,
  Uint32,
  Int8,
  Int16,
  Int32,
  Float32,
  Float64,
}

interface CompressedBinary {
  kind: BinaryKind;
  byteLength: number;
  bytes: Uint8Array;
  checksum: number;
}

export interface RecentSnapshot {
  width: number;
  height: number;
  rgba: ArrayBuffer;
  project?: SessionProject;
}

export interface PackedRecentSnapshot {
  width: number;
  height: number;
  rgba: unknown;
  project?: unknown;
  /** Identity keys distinguish independent arrays even when compressed bytes are shared. */
  compressed?: Map<object, CompressedBinary>;
}

type Binary =
  | ArrayBuffer
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Float32Array
  | Float64Array;

function binaryKind(value: object): BinaryKind | undefined {
  if (value instanceof ArrayBuffer) return BinaryKind.Buffer;
  if (value instanceof Uint8Array) return BinaryKind.Uint8;
  if (value instanceof Uint8ClampedArray) return BinaryKind.Clamped8;
  if (value instanceof Uint16Array) return BinaryKind.Uint16;
  if (value instanceof Uint32Array) return BinaryKind.Uint32;
  if (value instanceof Int8Array) return BinaryKind.Int8;
  if (value instanceof Int16Array) return BinaryKind.Int16;
  if (value instanceof Int32Array) return BinaryKind.Int32;
  if (value instanceof Float32Array) return BinaryKind.Float32;
  if (value instanceof Float64Array) return BinaryKind.Float64;
  return undefined;
}

function restoreBinary(kind: BinaryKind, bytes: Uint8Array): Binary {
  const buffer = bytes.buffer as ArrayBuffer;
  switch (kind) {
    case BinaryKind.Buffer:
      return buffer;
    case BinaryKind.Uint8:
      return bytes;
    case BinaryKind.Clamped8:
      return new Uint8ClampedArray(buffer);
    case BinaryKind.Uint16:
      return new Uint16Array(buffer);
    case BinaryKind.Uint32:
      return new Uint32Array(buffer);
    case BinaryKind.Int8:
      return new Int8Array(buffer);
    case BinaryKind.Int16:
      return new Int16Array(buffer);
    case BinaryKind.Int32:
      return new Int32Array(buffer);
    case BinaryKind.Float32:
      return new Float32Array(buffer);
    case BinaryKind.Float64:
      return new Float64Array(buffer);
    default:
      throw new Error("Invalid recent-file binary type");
  }
}

/** Transform only binary leaves. Metadata, shared cels and independent cels keep
 * their exact graph structure; no native-file conversion or color conversion. */
function transformGraph(value: unknown, binary: (value: object) => unknown): unknown {
  const seen = new WeakMap<object, unknown>();
  const visit = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    const replacement = binary(value);
    if (replacement !== undefined) {
      seen.set(value, replacement);
      return replacement;
    }
    if (value instanceof Date) {
      const copy = new Date(value);
      seen.set(value, copy);
      return copy;
    }
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new TypeError("Unsupported recent-file snapshot value");
    const copy: Record<string, unknown> | unknown[] = Array.isArray(value)
      ? Object.assign([], { length: value.length })
      : {};
    seen.set(value, copy);
    for (const [key, child] of Object.entries(value)) {
      Object.defineProperty(copy, key, {
        value: visit(child),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return copy;
  };
  return visit(value);
}

export async function packRecentSnapshot(
  snapshot: RecentSnapshot,
  compression = new RecoveryCompression(),
): Promise<PackedRecentSnapshot> {
  const compressed = new Map<object, CompressedBinary>();
  const replacements = new WeakMap<object, object>();
  const pending: { value: Binary; kind: BinaryKind; bytes: Uint8Array }[] = [];
  let total = 0;
  // Collect before yielding; only the view's bytes belong to the snapshot.
  transformGraph(snapshot, (value) => {
    const kind = binaryKind(value);
    if (kind === undefined) return undefined;
    const data = value as Binary;
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    total += bytes.byteLength;
    if (total > MAX_RESTORED_BYTES)
      throw new RangeError("Recent-file snapshot exceeds its storage limit");
    pending.push({ value: data, kind, bytes });
    return value;
  });
  for (const { value, kind, bytes } of pending) {
    if (bytes.byteLength >= MIN_COMPRESSION_BYTES) {
      const encoded = await compression.deflate(bytes);
      if (encoded.byteLength + ENCODING_OVERHEAD_BYTES < bytes.byteLength) {
        const reference = {};
        replacements.set(value, reference);
        compressed.set(reference, {
          kind,
          byteLength: bytes.byteLength,
          bytes: encoded,
          checksum: crc32(encoded),
        });
        continue;
      }
    }
    replacements.set(value, restoreBinary(kind, bytes.slice()));
  }
  const result = transformGraph(snapshot, (value) =>
    replacements.get(value),
  ) as PackedRecentSnapshot;
  if (compressed.size) result.compressed = compressed;
  return result;
}

export function unpackRecentSnapshot(snapshot: PackedRecentSnapshot): RecentSnapshot {
  if (snapshot.compressed !== undefined && !(snapshot.compressed instanceof Map))
    throw new Error("Invalid recent-file compression table");
  const { compressed, ...data } = snapshot;
  let total = 0;
  return transformGraph(data, (value) => {
    const encoded = compressed?.get(value);
    if (encoded) {
      if (
        !Number.isSafeInteger(encoded.byteLength) ||
        encoded.byteLength < 1 ||
        !(encoded.bytes instanceof Uint8Array)
      )
        throw new Error("Invalid recent-file compressed buffer");
      total += encoded.byteLength;
      if (total > MAX_RESTORED_BYTES)
        throw new RangeError("Recent-file snapshot exceeds its storage limit");
      if (crc32(encoded.bytes) !== encoded.checksum)
        throw new Error("Invalid recent-file compressed checksum");
      // An extra byte detects streams that expand past the declared boundary.
      const bytes = unzlibSync(encoded.bytes, { out: new Uint8Array(encoded.byteLength + 1) });
      if (bytes.byteLength !== encoded.byteLength)
        throw new Error("Invalid recent-file expanded size");
      return restoreBinary(encoded.kind, bytes.slice());
    }
    if (binaryKind(value) !== undefined) {
      total += (value as Binary).byteLength;
      if (total > MAX_RESTORED_BYTES)
        throw new RangeError("Recent-file snapshot exceeds its storage limit");
      return value;
    }
    return undefined;
  }) as RecentSnapshot;
}
