import { isRecoveryEnvelope, readRecoveryChunkRanges } from "@xprite/editor-core/import-export";

const MIN_SPLIT_BYTES = 256 * 1024;
const MAX_PART_BYTES = 1024 * 1024;
const MIN_OBJECT_BYTES = 1024;

/** Keep unchanged ASE objects reusable even when an earlier cel changes length.
 * Small payloads (including workspace manifests) remain one ordinary generation. */
export function splitSnapshotParts(bytes: Uint8Array): readonly Uint8Array[] {
  if (bytes.length < MIN_SPLIT_BYTES || !isRecoveryEnvelope(bytes)) return [bytes];
  const objects = readRecoveryChunkRanges(bytes);
  const parts: Uint8Array[] = [];
  const append = (from: number, to: number) => {
    for (let at = from; at < to; at += MAX_PART_BYTES)
      parts.push(bytes.subarray(at, Math.min(to, at + MAX_PART_BYTES)));
  };
  let start = 0;
  for (const object of objects) {
    if (object.end - object.start < MIN_OBJECT_BYTES) continue;
    append(start, object.start);
    append(object.start, object.end);
    start = object.end;
  }
  append(start, bytes.length);
  return parts;
}
