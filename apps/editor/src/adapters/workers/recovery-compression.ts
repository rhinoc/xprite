import { zlibSync } from "fflate";

import { sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";

const RECOVERY_COMPRESSION_LEVEL = 9;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 512;

export const compressRecoveryBytes = (bytes: Uint8Array): Uint8Array =>
  zlibSync(bytes, { level: RECOVERY_COMPRESSION_LEVEL });

/** Each workspace/worker owns a bounded cache of derived compressed bytes.
 * Content hashes survive worker message cloning and never link editable cels. */
export class RecoveryCompression {
  private readonly entries = new Map<string, Uint8Array>();
  private bytes = 0;
  private epoch = 0;
  private immutableKeys = new WeakMap<object, Map<string, string>>();
  constructor(
    private readonly compress = compressRecoveryBytes,
    private readonly maxBytes = MAX_CACHE_BYTES,
    private readonly maxEntries = MAX_CACHE_ENTRIES,
    private readonly hash = sha256Hex,
  ) {}

  deflate = (source: Uint8Array): Promise<Uint8Array> => this.encode(source, false);

  /** Only detached immutable snapshot bytes may bypass repeated content hashing.
   * Byte range keys also recognize new views over the same retained cel buffer. */
  deflateImmutable = (source: Uint8Array): Promise<Uint8Array> => this.encode(source, true);

  private async encode(source: Uint8Array, immutable: boolean): Promise<Uint8Array> {
    if (this.maxBytes <= 0 || this.maxEntries <= 0) return this.compress(source);
    const epoch = this.epoch;
    const range = `${source.byteOffset}:${source.byteLength}`;
    const known = immutable ? this.immutableKeys.get(source.buffer)?.get(range) : undefined;
    const key = known ?? `${source.byteLength}:${await this.hash(source)}`;
    if (immutable && !known && epoch === this.epoch) {
      let ranges = this.immutableKeys.get(source.buffer);
      if (!ranges) {
        ranges = new Map();
        this.immutableKeys.set(source.buffer, ranges);
      }
      // A pathological buffer with many slice views must not grow metadata forever.
      if (ranges.size >= this.maxEntries) ranges.delete(ranges.keys().next().value!);
      ranges.set(range, key);
    }
    const cached = this.entries.get(key);
    if (cached && epoch === this.epoch) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    const result = this.compress(source);
    if (epoch !== this.epoch || result.byteLength > this.maxBytes) return result;
    // Concurrent encodes can finish hashing the same bytes together.
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.byteLength;
    this.entries.delete(key);
    this.entries.set(key, result);
    this.bytes += result.byteLength;
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.bytes -= this.entries.get(oldest)!.byteLength;
      this.entries.delete(oldest);
    }
    return result;
  }

  clear(): void {
    this.epoch++;
    this.entries.clear();
    this.immutableKeys = new WeakMap();
    this.bytes = 0;
  }
}
