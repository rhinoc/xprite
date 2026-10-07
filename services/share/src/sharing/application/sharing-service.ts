import { validateAse } from "$/sharing/domain/ase-validation";
import { ShareError, ShareErrorCode } from "$/sharing/domain/errors";
import {
  isAccessible,
  publicShare,
  ShareState,
  validateReservation,
  type PublicShare,
  type ShareRecord,
} from "$/sharing/domain/model";
import {
  MANAGEMENT_KEY_PATTERN,
  RESERVATION_LIFETIME_MS,
  SHARE_LIFETIME_MS,
} from "$/sharing/domain/policy";
import type { ShareObjectStore } from "$/sharing/ports/object-store";
import type { ShareRepository } from "$/sharing/ports/repository";
import type { ShareRuntime } from "$/sharing/ports/runtime";

export class SharingService {
  constructor(
    private readonly repository: ShareRepository,
    private readonly objects: ShareObjectStore,
    private readonly runtime: ShareRuntime,
  ) {}

  async reserve(value: unknown, managementKey: string, ipKey: string): Promise<ShareRecord> {
    const input = validateReservation(value);
    const managementHash = await this.managementHash(managementKey);
    const existing = await this.repository.getByRequestId(input.requestId);
    if (existing) {
      this.authorize(existing, managementHash);
      if (
        existing.fileName !== input.fileName ||
        existing.sizeBytes !== input.sizeBytes ||
        existing.sha256 !== input.sha256
      ) {
        throw new ShareError(
          ShareErrorCode.Conflict,
          "The request ID belongs to a different file.",
        );
      }
      this.requireLive(existing);
      return existing;
    }
    const createdAt = this.runtime.now();
    const record = await this.repository.reserve({
      ...input,
      id: this.runtime.makeId(),
      managementHash,
      ipKey,
      createdAt,
      reservationUntil: createdAt + RESERVATION_LIFETIME_MS,
    });
    // The adapter can return a simultaneous winner for the same request ID.
    this.authorize(record, managementHash);
    if (
      record.fileName !== input.fileName ||
      record.sizeBytes !== input.sizeBytes ||
      record.sha256 !== input.sha256
    ) {
      throw new ShareError(ShareErrorCode.Conflict, "The request ID belongs to a different file.");
    }
    this.requireLive(record);
    return record;
  }

  async upload(id: string, managementKey: string, bytes: Uint8Array): Promise<PublicShare> {
    const record = await this.managed(id, managementKey);
    if (bytes.byteLength !== record.sizeBytes)
      throw new ShareError(
        ShareErrorCode.InvalidFile,
        "The uploaded size differs from the reservation.",
      );
    validateAse(bytes);
    if (!this.runtime.equalsHash(await this.runtime.hashBytes(bytes), record.sha256)) {
      throw new ShareError(
        ShareErrorCode.InvalidFile,
        "The uploaded checksum differs from the reservation.",
      );
    }
    if (record.state === ShareState.Active) return this.metadata(id);
    if (!(await this.repository.claimUpload(id, this.runtime.now()))) {
      throw new ShareError(
        ShareErrorCode.Conflict,
        "The upload is already running or no longer available.",
      );
    }
    try {
      await this.objects.writeOnce(id, bytes, record.sha256);
      const publishedAt = this.runtime.now();
      if (!(await this.repository.publish(id, publishedAt, publishedAt + SHARE_LIFETIME_MS))) {
        throw new ShareError(
          ShareErrorCode.Gone,
          "The upload expired or was revoked before publication.",
        );
      }
      const published = await this.repository.getAccessible(id);
      if (!published || !isAccessible(published, this.runtime.now()))
        throw new ShareError(ShareErrorCode.Gone, "The share was retired during publication.");
      return publicShare(published);
    } catch (error) {
      // A D1 response can be lost after commit. Never retire a published winner.
      const latest = await this.repository.getAccessible(id);
      if (latest && isAccessible(latest, this.runtime.now())) return publicShare(latest);
      // Cleanup is persisted before returning; Cron retries R2 failures. A write
      // fence prevents a delayed create-if-absent put from resurrecting content.
      await this.repository.retire(id, this.runtime.now());
      throw error;
    }
  }

  async metadata(id: string): Promise<PublicShare> {
    const accessible = await this.repository.getAccessible(id);
    if (accessible && isAccessible(accessible, this.runtime.now())) return publicShare(accessible);
    const record = await this.repository.get(id);
    if (!record || record.state === ShareState.Reserved || record.state === ShareState.Uploading)
      throw new ShareError(ShareErrorCode.NotFound, "Share not found.");
    throw new ShareError(ShareErrorCode.Gone, "This share has expired or was revoked.");
  }

  async download(id: string): Promise<{ share: PublicShare; bytes: Uint8Array }> {
    const share = await this.metadata(id);
    const bytes = await this.objects.read(id);
    if (!bytes || bytes.byteLength !== share.sizeBytes)
      throw new ShareError(ShareErrorCode.Unavailable, "The file is unavailable.");
    // Recheck after I/O, including revocation during a slow R2 read.
    await this.metadata(id);
    return { share, bytes };
  }

  async managed(id: string, managementKey: string): Promise<ShareRecord> {
    const hash = await this.managementHash(managementKey);
    const record = await this.repository.get(id);
    if (!record) throw new ShareError(ShareErrorCode.NotFound, "Share not found.");
    this.authorize(record, hash);
    this.requireLive(record);
    return record;
  }

  async revoke(id: string, managementKey: string): Promise<void> {
    const hash = await this.managementHash(managementKey);
    const record = await this.repository.get(id);
    if (!record) throw new ShareError(ShareErrorCode.NotFound, "Share not found.");
    this.authorize(record, hash);
    await this.repository.retire(id, this.runtime.now());
  }

  async capacity(ipKey: string) {
    return this.repository.capacity(ipKey, this.runtime.now());
  }

  private async managementHash(key: string): Promise<string> {
    if (!MANAGEMENT_KEY_PATTERN.test(key))
      throw new ShareError(ShareErrorCode.Unauthorized, "A valid management key is required.");
    return this.runtime.hashManagementKey(key);
  }

  private authorize(record: ShareRecord, hash: string): void {
    if (!this.runtime.equalsHash(record.managementHash, hash))
      throw new ShareError(ShareErrorCode.Unauthorized, "Invalid management key.");
  }

  private requireLive(record: ShareRecord): void {
    const now = this.runtime.now();
    if (
      record.state === ShareState.Retired ||
      (record.state === ShareState.Active
        ? !isAccessible(record, now)
        : record.reservationUntil <= now)
    ) {
      throw new ShareError(ShareErrorCode.Gone, "This share or upload reservation has expired.");
    }
  }
}
