import type { IpCapacity, ReservationInput, ShareRecord } from "$/sharing/domain/model";

export interface NewReservation extends ReservationInput {
  id: string;
  ipKey: string;
  managementHash: string;
  createdAt: number;
  reservationUntil: number;
}

export interface ShareRepository {
  get(id: string): Promise<ShareRecord | null>;
  getAccessible(id: string): Promise<ShareRecord | null>;
  getByRequestId(requestId: string): Promise<ShareRecord | null>;
  capacity(ipKey: string, now: number): Promise<IpCapacity>;
  /** Atomic admission against IP, physical storage, and creation-rate limits. */
  reserve(input: NewReservation): Promise<ShareRecord>;
  /** Exactly one caller may write the immutable R2 object. */
  claimUpload(id: string, now: number): Promise<boolean>;
  publish(id: string, now: number, expiresAt: number): Promise<boolean>;
  /** Also selects a write fence when retirement races an uploading writer. */
  retire(id: string, now: number): Promise<ShareRecord | null>;
  retireExpired(now: number, limit: number): Promise<void>;
  pendingCleanup(now: number, limit: number): Promise<ShareRecord[]>;
  retryCleanup(id: string, now: number): Promise<void>;
  acknowledgeCleanup(id: string, now: number): Promise<void>;
  purgeRetired(before: number, limit: number): Promise<void>;
}
