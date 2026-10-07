import { ShareError, ShareErrorCode } from "$/sharing/domain/errors";
import {
  MAX_FILE_NAME_LENGTH,
  MAX_FILE_BYTES,
  ASE_HEADER_BYTES,
  FRAME_HEADER_BYTES,
  REQUEST_ID_PATTERN,
  SHA256_PATTERN,
} from "$/sharing/domain/policy";

export enum ShareState {
  Reserved = "reserved",
  Uploading = "uploading",
  Active = "active",
  Retired = "retired",
}

export enum CleanupMode {
  Delete = "delete",
  Fence = "fence",
}

export interface ShareRecord {
  id: string;
  requestId: string;
  ipKey: string;
  managementHash: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  state: ShareState;
  createdAt: number;
  reservationUntil: number;
  expiresAt: number | null;
  retiredAt: number | null;
  cleanupMode: CleanupMode;
  storageReleased: boolean;
}

export interface ReservationInput {
  requestId: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
}

export interface PublicShare {
  id: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  expiresAt: number;
}

export interface IpCapacity {
  usedBytes: number;
  reservedBytes: number;
}

const INVALID_FILE_NAME = /[\\/]/u;
const UNPAIRED_SURROGATE = /[\ud800-\udfff]/u;
const MIN_PRINTABLE_CHARACTER = 32;
const DELETE_CHARACTER = 127;
const FILE_EXTENSION = /\.(ase|aseprite)$/iu;

export function validateReservation(value: unknown): ReservationInput {
  if (!value || typeof value !== "object")
    throw new ShareError(ShareErrorCode.InvalidRequest, "Expected reservation metadata.");
  const input = value as Partial<ReservationInput>;
  if (
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId) ||
    typeof input.fileName !== "string" ||
    input.fileName.length === 0 ||
    input.fileName.length > MAX_FILE_NAME_LENGTH ||
    input.fileName !== input.fileName.trim() ||
    INVALID_FILE_NAME.test(input.fileName) ||
    UNPAIRED_SURROGATE.test(input.fileName) ||
    Array.from(input.fileName).some(
      (character) =>
        character.charCodeAt(0) < MIN_PRINTABLE_CHARACTER ||
        character.charCodeAt(0) === DELETE_CHARACTER,
    ) ||
    !FILE_EXTENSION.test(input.fileName) ||
    typeof input.sha256 !== "string" ||
    !SHA256_PATTERN.test(input.sha256) ||
    typeof input.sizeBytes !== "number" ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < ASE_HEADER_BYTES + FRAME_HEADER_BYTES
  ) {
    throw new ShareError(ShareErrorCode.InvalidRequest, "Invalid reservation metadata.");
  }
  if (input.sizeBytes > MAX_FILE_BYTES)
    throw new ShareError(ShareErrorCode.FileTooLarge, "The file exceeds 250 KB.");
  return {
    requestId: input.requestId,
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
  };
}

export function isAccessible(record: ShareRecord, now: number): boolean {
  return record.state === ShareState.Active && record.expiresAt !== null && record.expiresAt > now;
}

export function publicShare(record: ShareRecord): PublicShare {
  if (record.expiresAt === null)
    throw new ShareError(ShareErrorCode.Conflict, "The upload has not completed.");
  return {
    id: record.id,
    fileName: record.fileName,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    expiresAt: record.expiresAt,
  };
}
