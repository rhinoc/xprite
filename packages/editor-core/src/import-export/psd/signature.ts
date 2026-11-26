import { MAX_DOCUMENT_PIXEL_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base";
import { MAX_TIMELINE_FRAMES, MAX_TIMELINE_LAYERS } from "$/timeline";

export const PSD_SIGNATURE_BYTES = 4;
const PSD_MAGIC_B0 = 0x38; // '8'
const PSD_MAGIC_B1 = 0x42; // 'B'
const PSD_MAGIC_B2 = 0x50; // 'P'
const PSD_MAGIC_B3 = 0x53; // 'S'

const PSD_FILE_NAME_PATTERN = /\.(?:psd|psb)$/i;

export interface PsdResourceLimits {
  readonly maxFileBytes: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly maxPixels: number;
  readonly maxDecodedBytes: number;
  readonly maxLayers: number;
  readonly maxFrames: number;
}

export const EDITOR_PSD_LIMITS: Readonly<PsdResourceLimits> = {
  maxFileBytes: MAX_IMAGE_PIXELS * 8,
  maxWidth: MAX_IMAGE_DIMENSION,
  maxHeight: MAX_IMAGE_DIMENSION,
  maxPixels: MAX_IMAGE_PIXELS,
  maxDecodedBytes: MAX_DOCUMENT_PIXEL_BYTES,
  maxLayers: MAX_TIMELINE_LAYERS,
  maxFrames: MAX_TIMELINE_FRAMES,
};

export enum PsdIssueCode {
  InvalidHeader = "invalid-header",
  ResourceLimit = "resource-limit",
  DecodeFailed = "decode-failed",
}

export class PsdCodecError extends Error {
  readonly code: PsdIssueCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    message: string,
    code: PsdIssueCode = PsdIssueCode.DecodeFailed,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "PsdCodecError";
    this.code = code;
    this.details = details;
  }
}

/** Identifies a Photoshop PSD/PSB binary stream from its leading `8BPS` magic bytes. */
export function isPsdData(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= PSD_SIGNATURE_BYTES &&
    bytes[0] === PSD_MAGIC_B0 &&
    bytes[1] === PSD_MAGIC_B1 &&
    bytes[2] === PSD_MAGIC_B2 &&
    bytes[3] === PSD_MAGIC_B3
  );
}

/** Lightweight Photoshop filename check shared by file and session adapters. */
export function isPsdFileName(name: string): boolean {
  return PSD_FILE_NAME_PATTERN.test(name);
}
