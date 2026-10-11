enum SfntSignature {
  TrueType = 0x00010000,
  Cff = 0x4f54544f,
  AppleTrueType = 0x74727565,
  AppleType1 = 0x74797031,
}

enum BitmapTableTag {
  Eblc = 0x45424c43,
  Cblc = 0x43424c43,
  Sbix = 0x73626978,
}

const SFNT_HEADER_SIZE = 12;
const TABLE_COUNT_OFFSET = 4;
const TABLE_RECORD_SIZE = 16;
const TABLE_OFFSET_FIELD = 8;
const TABLE_LENGTH_FIELD = 12;
const BITMAP_HEADER_SIZE = 8;
const BITMAP_COUNT_OFFSET = 4;
const BITMAP_SIZE_RECORD_SIZE = 48;
const BITMAP_PPEM_X_OFFSET = 44;
const BITMAP_PPEM_Y_OFFSET = 45;
const EBLC_VERSION = 2;
const CBLC_VERSION = 3;
const SBIX_VERSION = 1;
const SBIX_OFFSET_SIZE = 4;
const SBIX_STRIKE_HEADER_SIZE = 4;

function bitmapLocationSizes(table: DataView, majorVersion: number): readonly number[] {
  if (table.byteLength < BITMAP_HEADER_SIZE || table.getUint16(0) !== majorVersion) return [];
  const count = table.getUint32(BITMAP_COUNT_OFFSET);
  if (count > Math.floor((table.byteLength - BITMAP_HEADER_SIZE) / BITMAP_SIZE_RECORD_SIZE))
    return [];
  const sizes: number[] = [];
  for (let index = 0; index < count; index++) {
    const record = BITMAP_HEADER_SIZE + index * BITMAP_SIZE_RECORD_SIZE;
    const x = table.getUint8(record + BITMAP_PPEM_X_OFFSET);
    const y = table.getUint8(record + BITMAP_PPEM_Y_OFFSET);
    // A single font-size value cannot describe a rectangular pixel grid.
    if (x > 0 && x === y) sizes.push(y);
  }
  return sizes;
}

function sbixSizes(table: DataView): readonly number[] {
  if (table.byteLength < BITMAP_HEADER_SIZE || table.getUint16(0) !== SBIX_VERSION) return [];
  const count = table.getUint32(BITMAP_COUNT_OFFSET);
  if (count > Math.floor((table.byteLength - BITMAP_HEADER_SIZE) / SBIX_OFFSET_SIZE)) return [];
  const headerEnd = BITMAP_HEADER_SIZE + count * SBIX_OFFSET_SIZE;
  const sizes: number[] = [];
  for (let index = 0; index < count; index++) {
    const offset = table.getUint32(BITMAP_HEADER_SIZE + index * SBIX_OFFSET_SIZE);
    if (offset < headerEnd || offset > table.byteLength - SBIX_STRIKE_HEADER_SIZE) return [];
    const size = table.getUint16(offset);
    if (size > 0) sizes.push(size);
  }
  return sizes;
}

/** Read explicit square-pixel bitmap strikes from one SFNT font face.
 * Outline design units and minimum readable sizes are not native pixel sizes.
 * Intended for the SFNT-wrapped bytes supplied by FontData.blob().
 */
export function readFontBitmapSizes(bytes: Uint8Array): readonly number[] {
  if (bytes.byteLength < SFNT_HEADER_SIZE) return [];
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = data.getUint32(0);
  if (!Object.values(SfntSignature).includes(signature)) return [];
  const count = data.getUint16(TABLE_COUNT_OFFSET);
  const directoryEnd = SFNT_HEADER_SIZE + count * TABLE_RECORD_SIZE;
  if (directoryEnd > data.byteLength) return [];
  const sizes = new Set<number>();
  for (let index = 0; index < count; index++) {
    const record = SFNT_HEADER_SIZE + index * TABLE_RECORD_SIZE;
    const tag = data.getUint32(record);
    if (!Object.values(BitmapTableTag).includes(tag)) continue;
    const offset = data.getUint32(record + TABLE_OFFSET_FIELD);
    const length = data.getUint32(record + TABLE_LENGTH_FIELD);
    if (offset < directoryEnd || offset > data.byteLength || length > data.byteLength - offset)
      continue;
    const table = new DataView(bytes.buffer, bytes.byteOffset + offset, length);
    const found =
      tag === BitmapTableTag.Sbix
        ? sbixSizes(table)
        : bitmapLocationSizes(table, tag === BitmapTableTag.Eblc ? EBLC_VERSION : CBLC_VERSION);
    for (const size of found) sizes.add(size);
  }
  return [...sizes].sort((left, right) => left - right);
}
