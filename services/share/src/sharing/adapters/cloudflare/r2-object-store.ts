import { ShareError, ShareErrorCode } from "$/sharing/domain/errors";
import { MAX_FILE_BYTES } from "$/sharing/domain/policy";
import type { ShareObjectStore } from "$/sharing/ports/object-store";

const OBJECT_PREFIX = "shares/";
const FILE_CONTENT_TYPE = "application/octet-stream";
const FENCE_METADATA = { retired: "true" };
const STANDARD_STORAGE_CLASS = "Standard";

export class R2ShareObjectStore implements ShareObjectStore {
  constructor(private readonly bucket: R2Bucket) {}

  async writeOnce(id: string, bytes: Uint8Array, sha256: string): Promise<void> {
    const object = await this.bucket.put(this.key(id), bytes, {
      onlyIf: new Headers({ "If-None-Match": "*" }),
      sha256,
      storageClass: STANDARD_STORAGE_CLASS,
      httpMetadata: { contentType: FILE_CONTENT_TYPE, cacheControl: "no-store" },
    });
    if (!object)
      throw new ShareError(
        ShareErrorCode.Conflict,
        "The object already exists or the upload was retired.",
      );
    if (object.size !== bytes.byteLength)
      throw new ShareError(ShareErrorCode.Unavailable, "Stored file size verification failed.");
  }

  async read(id: string): Promise<Uint8Array | null> {
    const object = await this.bucket.get(this.key(id));
    if (!object || object.customMetadata?.retired === FENCE_METADATA.retired) return null;
    if (object.size > MAX_FILE_BYTES)
      throw new ShareError(ShareErrorCode.Unavailable, "Stored file exceeds the service limit.");
    return new Uint8Array(await object.arrayBuffer());
  }

  async delete(id: string): Promise<void> {
    await this.bucket.delete(this.key(id));
  }

  async fence(id: string): Promise<void> {
    // Retain ONLY for interrupted uploading writers. A zero-byte marker makes
    // create-if-absent fail even if an old R2 request finishes after cleanup.
    // Normal completed shares are physically deleted, without a marker.
    await this.bucket.put(this.key(id), new Uint8Array(0), {
      customMetadata: FENCE_METADATA,
      storageClass: STANDARD_STORAGE_CLASS,
    });
  }

  private key(id: string): string {
    return `${OBJECT_PREFIX}${id}`;
  }
}
