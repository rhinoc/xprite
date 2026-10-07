import { strToU8 } from "fflate";

import type { EditorDocument } from "$/document";
import { EDITOR_ASEPRITE_LIMITS } from "$/import-export/aseprite";
import { decodeUtf8 } from "@xprite/bedrock/common/utf8";

/** Current recovery envelope, shared with persistence object partitioning. */
export const RECOVERY_MAGIC = new Uint8Array([65, 83, 69, 82, 69, 67, 79, 86]);
export const RECOVERY_HEADER_BYTES = 20;
export const MAX_RECOVERY_METADATA_BYTES = 64 * 1024;
export const MAX_RECOVERY_BYTES =
  EDITOR_ASEPRITE_LIMITS.maxFileBytes + MAX_RECOVERY_METADATA_BYTES + RECOVERY_HEADER_BYTES;

const RECOVERY_VERSION = 1;
const VERSION_OFFSET = 8;
const METADATA_LENGTH_OFFSET = 12;
const PROJECT_LENGTH_OFFSET = 16;
const MIN_METADATA_BYTES = 2;
const MIN_ASEPRITE_BYTES = 128;
const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

export interface RecoveryMetadata {
  name: string;
  format?: EditorDocument["format"];
  dirty: boolean;
  activeFrame: number;
  activeLayer: number;
  composeGroups: boolean;
}

function validateMetadata(value: unknown): asserts value is RecoveryMetadata {
  const metadata = value as RecoveryMetadata | null;
  if (
    !metadata ||
    typeof metadata.name !== "string" ||
    typeof metadata.dirty !== "boolean" ||
    (metadata.format !== undefined &&
      metadata.format !== "png" &&
      metadata.format !== "aseprite") ||
    typeof metadata.composeGroups !== "boolean" ||
    !Number.isSafeInteger(metadata.activeFrame) ||
    metadata.activeFrame < 0 ||
    !Number.isSafeInteger(metadata.activeLayer) ||
    metadata.activeLayer < 0
  )
    throw new Error("Invalid recovery metadata");
}

export function isRecoveryEnvelope(bytes: Uint8Array): boolean {
  return (
    bytes.length >= RECOVERY_HEADER_BYTES &&
    RECOVERY_MAGIC.every((value, index) => bytes[index] === value)
  );
}

function validateBounds(metadataBytes: number, projectBytes: number, totalBytes: number): void {
  if (
    metadataBytes < MIN_METADATA_BYTES ||
    metadataBytes > MAX_RECOVERY_METADATA_BYTES ||
    projectBytes < MIN_ASEPRITE_BYTES ||
    projectBytes > EDITOR_ASEPRITE_LIMITS.maxFileBytes ||
    RECOVERY_HEADER_BYTES + metadataBytes + projectBytes !== totalBytes
  )
    throw new Error("Invalid recovery snapshot bounds");
}

export function encodeRecoveryMetadata(metadata: RecoveryMetadata): Uint8Array {
  validateMetadata(metadata);
  const meta = strToU8(JSON.stringify(metadata));
  if (meta.length > MAX_RECOVERY_METADATA_BYTES)
    throw new RangeError("Recovery metadata exceeds its size limit");
  return meta;
}

function decodeMetadataUtf8(bytes: Uint8Array): string {
  const source = UTF8_BOM.every((value, index) => bytes[index] === value)
    ? bytes.subarray(UTF8_BOM.length)
    : bytes;
  const text = decodeUtf8(source);
  const encoded = strToU8(text);
  // The common reader replaces malformed sequences. Exact round-trip equality
  // rejects replacement, overlong forms and invalid scalar values before JSON.
  if (encoded.length !== source.length || encoded.some((value, index) => value !== source[index]))
    throw new TypeError("Invalid recovery metadata UTF-8");
  return text;
}

export function encodeRecoveryEnvelope(meta: Uint8Array, project: Uint8Array): Uint8Array {
  const totalBytes = RECOVERY_HEADER_BYTES + meta.length + project.length;
  validateBounds(meta.length, project.length, totalBytes);
  const bytes = new Uint8Array(totalBytes);
  bytes.set(RECOVERY_MAGIC);
  const header = new DataView(bytes.buffer);
  header.setUint32(VERSION_OFFSET, RECOVERY_VERSION, true);
  header.setUint32(METADATA_LENGTH_OFFSET, meta.length, true);
  header.setUint32(PROJECT_LENGTH_OFFSET, project.length, true);
  bytes.set(meta, RECOVERY_HEADER_BYTES);
  bytes.set(project, RECOVERY_HEADER_BYTES + meta.length);
  return bytes;
}

/** Returned project bytes borrow the envelope; decoding must snapshot or own it. */
export function decodeRecoveryEnvelope(bytes: Uint8Array): {
  metadata: RecoveryMetadata;
  project: Uint8Array;
} {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < RECOVERY_HEADER_BYTES ||
    bytes.length > MAX_RECOVERY_BYTES
  )
    throw new Error("Invalid recovery snapshot size");
  if (!isRecoveryEnvelope(bytes)) throw new Error("Invalid recovery snapshot magic");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(VERSION_OFFSET, true) !== RECOVERY_VERSION)
    throw new Error("Unsupported recovery snapshot version");
  const metaLength = header.getUint32(METADATA_LENGTH_OFFSET, true);
  validateBounds(metaLength, header.getUint32(PROJECT_LENGTH_OFFSET, true), bytes.length);
  const projectStart = RECOVERY_HEADER_BYTES + metaLength;
  const metadata: unknown = JSON.parse(
    decodeMetadataUtf8(bytes.subarray(RECOVERY_HEADER_BYTES, projectStart)),
  );
  validateMetadata(metadata);
  return { metadata, project: bytes.subarray(projectStart) };
}
