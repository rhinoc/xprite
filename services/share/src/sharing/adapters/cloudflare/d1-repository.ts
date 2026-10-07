import { ShareError, ShareErrorCode } from "$/sharing/domain/errors";
import { CleanupMode, ShareState, type IpCapacity, type ShareRecord } from "$/sharing/domain/model";
import {
  MAX_IP_BYTES,
  MAX_STORAGE_BYTES,
  MAX_RESERVATIONS_PER_WINDOW,
  UPLOAD_RATE_WINDOW_MS,
  CLEANUP_RETRY_BASE_MS,
  CLEANUP_RETRY_MAX_EXPONENT,
  SHARE_LIFETIME_MS,
} from "$/sharing/domain/policy";
import type { NewReservation, ShareRepository } from "$/sharing/ports/repository";

interface ShareRow {
  id: string;
  request_id: string;
  ip_key: string;
  management_hash: string;
  file_name: string;
  size_bytes: number;
  sha256: string;
  state: ShareState;
  created_at: number;
  reservation_until: number;
  expires_at: number | null;
  retired_at: number | null;
  cleanup_mode: CleanupMode;
  storage_released: number;
}

function fromRow(row: ShareRow): ShareRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    ipKey: row.ip_key,
    managementHash: row.management_hash,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    state: row.state,
    createdAt: row.created_at,
    reservationUntil: row.reservation_until,
    expiresAt: row.expires_at,
    retiredAt: row.retired_at,
    cleanupMode: row.cleanup_mode,
    storageReleased: row.storage_released === 1,
  };
}

// Use database time as a lower bound. A request can wait in transit while a
// later request consumes capacity released by its expired upload reservation.
const DATABASE_NOW_MS = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
const RETIRE_VALUES = `state = 'retired', retired_at = MAX(?, ${DATABASE_NOW_MS}), cleanup_after = MAX(?, ${DATABASE_NOW_MS}), cleanup_mode = CASE WHEN state = 'uploading' THEN 'fence' ELSE 'delete' END`;

export class D1ShareRepository implements ShareRepository {
  constructor(private readonly database: D1Database) {}

  async get(id: string): Promise<ShareRecord | null> {
    const row = await this.database
      .prepare("SELECT * FROM shares WHERE id = ?")
      .bind(id)
      .first<ShareRow>();
    return row ? fromRow(row) : null;
  }

  async getByRequestId(requestId: string): Promise<ShareRecord | null> {
    const row = await this.database
      .prepare("SELECT * FROM shares WHERE request_id = ?")
      .bind(requestId)
      .first<ShareRow>();
    return row ? fromRow(row) : null;
  }

  async getAccessible(id: string): Promise<ShareRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT * FROM shares WHERE id = ? AND state = 'active' AND expires_at > ${DATABASE_NOW_MS}`,
      )
      .bind(id)
      .first<ShareRow>();
    return row ? fromRow(row) : null;
  }

  async capacity(ipKey: string, now: number): Promise<IpCapacity> {
    const row = await this.database
      .prepare(`SELECT
      COALESCE(SUM(CASE WHEN state = 'active' AND expires_at > MAX(?, ${DATABASE_NOW_MS}) THEN size_bytes ELSE 0 END), 0) AS used,
      COALESCE(SUM(CASE WHEN state IN ('reserved', 'uploading') AND reservation_until > MAX(?, ${DATABASE_NOW_MS}) THEN size_bytes ELSE 0 END), 0) AS reserved
      FROM shares WHERE ip_key = ?`)
      .bind(now, now, ipKey)
      .first<{ used: number; reserved: number }>();
    return { usedBytes: row?.used ?? 0, reservedBytes: row?.reserved ?? 0 };
  }

  async reserve(input: NewReservation): Promise<ShareRecord> {
    // Admission and the held-byte trigger are ONE SQLite write transaction.
    // No application-side read/modify/write counter and no eventually-consistent KV.
    const statement = this.database
      .prepare(`WITH admission AS (SELECT MAX(?, ${DATABASE_NOW_MS}) AS now)
      INSERT INTO shares
      (id, request_id, ip_key, management_hash, file_name, size_bytes, sha256, state, created_at, reservation_until)
      SELECT ?, ?, ?, ?, ?, ?, ?, 'reserved', admission.now, admission.now + ? FROM admission
      WHERE (SELECT held_bytes FROM service_capacity WHERE id = 1) + ? <= ?
      AND (SELECT COALESCE(SUM(size_bytes), 0) FROM shares WHERE ip_key = ? AND
        ((state = 'active' AND expires_at > admission.now) OR (state IN ('reserved', 'uploading') AND reservation_until > admission.now))) + ? <= ?
      AND (SELECT COUNT(*) FROM shares WHERE ip_key = ? AND created_at > admission.now - ?) < ?
      ON CONFLICT(request_id) DO NOTHING`)
      .bind(
        input.createdAt,
        input.id,
        input.requestId,
        input.ipKey,
        input.managementHash,
        input.fileName,
        input.sizeBytes,
        input.sha256,
        input.reservationUntil - input.createdAt,
        input.sizeBytes,
        MAX_STORAGE_BYTES,
        input.ipKey,
        input.sizeBytes,
        MAX_IP_BYTES,
        input.ipKey,
        UPLOAD_RATE_WINDOW_MS,
        MAX_RESERVATIONS_PER_WINDOW,
      );
    await statement.run();
    const winner = await this.getByRequestId(input.requestId);
    if (winner) return winner;
    const capacity = await this.capacity(input.ipKey, input.createdAt);
    if (capacity.usedBytes + capacity.reservedBytes + input.sizeBytes > MAX_IP_BYTES)
      throw new ShareError(
        ShareErrorCode.IpCapacityExceeded,
        "This IP has insufficient upload capacity.",
      );
    const held = await this.database
      .prepare("SELECT held_bytes FROM service_capacity WHERE id = 1")
      .first<{ held_bytes: number }>();
    if (!held)
      throw new ShareError(
        ShareErrorCode.Unavailable,
        "The service database has not been initialized.",
      );
    if (held.held_bytes + input.sizeBytes > MAX_STORAGE_BYTES)
      throw new ShareError(
        ShareErrorCode.StorageCapacityExceeded,
        "New uploads are temporarily unavailable.",
      );
    const recent = await this.database
      .prepare("SELECT COUNT(*) AS count FROM shares WHERE ip_key = ? AND created_at > ?")
      .bind(input.ipKey, input.createdAt - UPLOAD_RATE_WINDOW_MS)
      .first<{ count: number }>();
    if ((recent?.count ?? 0) >= MAX_RESERVATIONS_PER_WINDOW)
      throw new ShareError(
        ShareErrorCode.RateLimited,
        "Too many upload reservations. Try again later.",
      );
    throw new ShareError(
      ShareErrorCode.Conflict,
      "Capacity changed during admission. Retry the same request.",
    );
  }

  async claimUpload(id: string, now: number): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE shares SET state = 'uploading' WHERE id = ? AND state = 'reserved' AND reservation_until > MAX(?, ${DATABASE_NOW_MS})`,
      )
      .bind(id, now)
      .run();
    return result.meta.changes === 1;
  }

  async publish(id: string, now: number, expiresAt: number): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE shares SET state = 'active', expires_at = MAX(?, ${DATABASE_NOW_MS} + ${SHARE_LIFETIME_MS}) WHERE id = ? AND state = 'uploading' AND reservation_until > MAX(?, ${DATABASE_NOW_MS})`,
      )
      .bind(expiresAt, id, now)
      .run();
    return result.meta.changes === 1;
  }

  async retire(id: string, now: number): Promise<ShareRecord | null> {
    await this.database
      .prepare(`UPDATE shares SET ${RETIRE_VALUES} WHERE id = ? AND state <> 'retired'`)
      .bind(now, now, id)
      .run();
    return this.get(id);
  }

  async retireExpired(now: number, limit: number): Promise<void> {
    await this.database
      .prepare(`UPDATE shares SET ${RETIRE_VALUES} WHERE id IN
      (SELECT id FROM shares WHERE (state = 'active' AND expires_at <= MAX(?, ${DATABASE_NOW_MS}))
      OR (state IN ('reserved', 'uploading') AND reservation_until <= MAX(?, ${DATABASE_NOW_MS}))
      ORDER BY created_at LIMIT ?)`)
      .bind(now, now, now, now, limit)
      .run();
  }

  async pendingCleanup(now: number, limit: number): Promise<ShareRecord[]> {
    const result = await this.database
      .prepare(
        `SELECT * FROM shares WHERE state = 'retired' AND storage_released = 0 AND cleanup_after <= MAX(?, ${DATABASE_NOW_MS}) ORDER BY cleanup_after LIMIT ?`,
      )
      .bind(now, limit)
      .all<ShareRow>();
    return result.results.map(fromRow);
  }

  async retryCleanup(id: string, now: number): Promise<void> {
    await this.database
      .prepare(
        `UPDATE shares SET cleanup_after = MAX(?, ${DATABASE_NOW_MS}) + ? * (1 << MIN(cleanup_attempts, ?)), cleanup_attempts = cleanup_attempts + 1 WHERE id = ? AND state = 'retired' AND storage_released = 0`,
      )
      .bind(now, CLEANUP_RETRY_BASE_MS, CLEANUP_RETRY_MAX_EXPONENT, id)
      .run();
  }

  async acknowledgeCleanup(id: string, now: number): Promise<void> {
    await this.database
      .prepare(
        `UPDATE shares SET storage_released = 1, released_at = MAX(?, ${DATABASE_NOW_MS}) WHERE id = ? AND state = 'retired' AND storage_released = 0`,
      )
      .bind(now, id)
      .run();
  }

  async purgeRetired(before: number, limit: number): Promise<void> {
    await this.database
      .prepare(
        "DELETE FROM shares WHERE id IN (SELECT id FROM shares WHERE storage_released = 1 AND released_at <= ? ORDER BY released_at LIMIT ?)",
      )
      .bind(before, limit)
      .run();
  }
}
