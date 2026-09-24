import { FIXED_POINT_16_16_SCALE } from "$/base/numeric-constants";

const ICC_HEADER_BYTES = 132;
const MAX_PROFILE_BYTES = 16 * 1024 * 1024;
const MAX_TAGS = 4096;
const TAG_RECORD_BYTES = 12;
const TAG_HEADER_BYTES = 8;

enum HeaderField {
  Size = 0,
  Version = 8,
  Class = 12,
  Space = 16,
  Pcs = 20,
  Magic = 36,
  TagCount = 128,
}

export enum IccPcs {
  Xyz = "XYZ ",
  Lab = "Lab ",
}

export function unsupportedIcc(message: string): never {
  throw new Error(
    `Unsupported ICC profile: ${message}. The original profile is preserved; this file has not been installed.`,
  );
}

export class IccData {
  private readonly view: DataView;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  need(offset: number, count: number): void {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(count) ||
      offset < 0 ||
      count < 0 ||
      offset + count > this.bytes.length
    )
      unsupportedIcc("truncated or invalid tag data");
  }

  signature(offset: number): string {
    this.need(offset, 4);
    return String.fromCharCode(...this.bytes.subarray(offset, offset + 4));
  }

  u8(offset: number): number {
    this.need(offset, 1);
    return this.view.getUint8(offset);
  }
  u16(offset: number): number {
    this.need(offset, 2);
    return this.view.getUint16(offset, false);
  }
  u32(offset: number): number {
    this.need(offset, 4);
    return this.view.getUint32(offset, false);
  }
  fixed(offset: number): number {
    this.need(offset, 4);
    return this.view.getInt32(offset, false) / FIXED_POINT_16_16_SCALE;
  }
}

export interface IccCicp {
  primaries: number;
  transfer: number;
  matrix: number;
  fullRange: boolean;
}

export interface IccHeader {
  space: "RGB" | "GRAY";
  pcs: IccPcs;
  tags: ReadonlyMap<string, IccData>;
  cicp?: IccCicp;
}

// ICC.1:2022, section 10.3 / ITU-T H.273. The ICC transform remains
// authoritative, including any narrow-range mapping encoded by its curves/LUT.
const SDR_TRANSFERS = new Set([1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17]);
const COLOR_PRIMARIES = new Set([1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 22]);
const PQ_TRANSFER = 16;
const HLG_TRANSFER = 18;

function readCicp(data: IccData, space: IccHeader["space"]): IccCicp {
  data.need(0, 12);
  if (data.signature(0) !== "cicp") unsupportedIcc("invalid CICP tag type");
  const primaries = data.u8(8),
    transfer = data.u8(9),
    matrix = data.u8(10),
    range = data.u8(11);
  if (transfer === PQ_TRANSFER || transfer === HLG_TRANSFER)
    unsupportedIcc(`HDR ${transfer === PQ_TRANSFER ? "PQ" : "HLG"} rendering is not supported`);
  if (!SDR_TRANSFERS.has(transfer))
    unsupportedIcc(`CICP transfer characteristic ${transfer} is not supported`);
  if (!COLOR_PRIMARIES.has(primaries))
    unsupportedIcc(`CICP colour primaries ${primaries} are not supported`);
  if (space !== "RGB" || matrix !== 0)
    unsupportedIcc("CICP YCbCr/ICtCp or non-RGB signals are not supported");
  if (range !== 0 && range !== 1) unsupportedIcc("invalid CICP full-range flag");
  return { primaries, transfer, matrix, fullRange: range === 1 };
}

export function readIccHeader(bytes: Uint8Array): IccHeader {
  if (bytes.length < ICC_HEADER_BYTES || bytes.length > MAX_PROFILE_BYTES)
    unsupportedIcc("invalid profile size");
  const data = new IccData(bytes),
    size = data.u32(HeaderField.Size);
  if (
    size < ICC_HEADER_BYTES ||
    size > bytes.length ||
    data.signature(HeaderField.Magic) !== "acsp"
  )
    unsupportedIcc("invalid ICC header");
  if (![2, 4].includes(data.u8(HeaderField.Version)))
    unsupportedIcc("only ICC v2/v4 profiles are supported");
  const signature = data.signature(HeaderField.Space);
  const space =
    signature === "RGB "
      ? "RGB"
      : signature === "GRAY"
        ? "GRAY"
        : unsupportedIcc(`color space ${signature.trim()} is not RGB or Gray`);
  const pcs = data.signature(HeaderField.Pcs);
  if (pcs !== IccPcs.Xyz && pcs !== IccPcs.Lab)
    unsupportedIcc(`PCS ${pcs.trim()} is not XYZ or Lab`);
  if (!["mntr", "scnr", "prtr", "spac"].includes(data.signature(HeaderField.Class)))
    unsupportedIcc("device-link/abstract/named-color profiles are not supported");
  const count = data.u32(HeaderField.TagCount);
  if (count > MAX_TAGS || ICC_HEADER_BYTES + count * TAG_RECORD_BYTES > size)
    unsupportedIcc("invalid tag directory");
  const tags = new Map<string, IccData>();
  for (let i = 0; i < count; i++) {
    const at = ICC_HEADER_BYTES + i * TAG_RECORD_BYTES;
    const name = data.signature(at),
      offset = data.u32(at + 4),
      length = data.u32(at + 8);
    if (
      offset < ICC_HEADER_BYTES + count * TAG_RECORD_BYTES ||
      length < TAG_HEADER_BYTES ||
      offset + length > size
    )
      unsupportedIcc(`invalid ${name} tag bounds`);
    if (tags.has(name)) unsupportedIcc(`duplicate ${name} tag`);
    tags.set(name, new IccData(bytes.subarray(offset, offset + length)));
  }
  if ([...tags.keys()].some((tag) => /^(D2B|B2D)[0-3]$/.test(tag)))
    unsupportedIcc("floating-point D2B/B2D transforms are not supported");
  const cicp = tags.get("cicp");
  return { space, pcs, tags, ...(cicp ? { cicp: readCicp(cicp, space) } : {}) };
}
