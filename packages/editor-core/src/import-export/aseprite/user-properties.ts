import {
  FIXED_POINT_16_16_SCALE,
  INT16_MAX,
  INT16_MIN,
  UINT16_MAX,
  UINT8_MAX,
} from "$/base/numeric-constants";
import { UINT32_MAX } from "@xprite/bedrock/common/numeric-constants";
import { decodeUtf8 } from "@xprite/bedrock/common/utf8";

export enum AsepriteUserPropertyType {
  Null = "null",
  Boolean = "bool",
  Int8 = "int8",
  Uint8 = "uint8",
  Int16 = "int16",
  Uint16 = "uint16",
  Int32 = "int32",
  Uint32 = "uint32",
  Int64 = "int64",
  Uint64 = "uint64",
  Fixed = "fixed",
  Float = "float",
  Double = "double",
  String = "string",
  Point = "point",
  Size = "size",
  Rect = "rect",
  Vector = "vector",
  Properties = "properties",
  Uuid = "uuid",
}

export type AsepriteUserPropertyValue =
  | { type: AsepriteUserPropertyType.Null }
  | { type: AsepriteUserPropertyType.Boolean; value: boolean }
  | {
      type:
        | AsepriteUserPropertyType.Int8
        | AsepriteUserPropertyType.Uint8
        | AsepriteUserPropertyType.Int16
        | AsepriteUserPropertyType.Uint16
        | AsepriteUserPropertyType.Int32
        | AsepriteUserPropertyType.Uint32
        | AsepriteUserPropertyType.Float
        | AsepriteUserPropertyType.Double;
      value: number;
    }
  | {
      type: AsepriteUserPropertyType.Int64 | AsepriteUserPropertyType.Uint64;
      /** Decimal string keeps all 64 bits intact in JavaScript. */
      value: string;
    }
  | { type: AsepriteUserPropertyType.Fixed; value: number }
  | { type: AsepriteUserPropertyType.String; value: string }
  | { type: AsepriteUserPropertyType.Point; value: { x: number; y: number } }
  | {
      type: AsepriteUserPropertyType.Size;
      value: { width: number; height: number };
    }
  | {
      type: AsepriteUserPropertyType.Rect;
      value: { x: number; y: number; width: number; height: number };
    }
  | {
      type: AsepriteUserPropertyType.Vector;
      value: { elementType: number; values: AsepriteUserPropertyValue[] };
    }
  | {
      type: AsepriteUserPropertyType.Properties;
      value: AsepriteUserProperty[];
    }
  | { type: AsepriteUserPropertyType.Uuid; value: string };

export interface AsepriteUserProperty {
  name: string;
  value: AsepriteUserPropertyValue;
}

export interface AsepriteUserPropertyMap {
  /** Zero is the user-defined map. Non-zero IDs belong to extensions. */
  key: number;
  properties: AsepriteUserProperty[];
}

const PROPERTY_TYPE_IDS: Record<AsepriteUserPropertyType, number> = {
  [AsepriteUserPropertyType.Null]: 0,
  [AsepriteUserPropertyType.Boolean]: 1,
  [AsepriteUserPropertyType.Int8]: 2,
  [AsepriteUserPropertyType.Uint8]: 3,
  [AsepriteUserPropertyType.Int16]: 4,
  [AsepriteUserPropertyType.Uint16]: 5,
  [AsepriteUserPropertyType.Int32]: 6,
  [AsepriteUserPropertyType.Uint32]: 7,
  [AsepriteUserPropertyType.Int64]: 8,
  [AsepriteUserPropertyType.Uint64]: 9,
  [AsepriteUserPropertyType.Fixed]: 10,
  [AsepriteUserPropertyType.Float]: 11,
  [AsepriteUserPropertyType.Double]: 12,
  [AsepriteUserPropertyType.String]: 13,
  [AsepriteUserPropertyType.Point]: 14,
  [AsepriteUserPropertyType.Size]: 15,
  [AsepriteUserPropertyType.Rect]: 16,
  [AsepriteUserPropertyType.Vector]: 17,
  [AsepriteUserPropertyType.Properties]: 18,
  [AsepriteUserPropertyType.Uuid]: 19,
};

const PROPERTY_TYPES_BY_ID = new Map(
  Object.entries(PROPERTY_TYPE_IDS).map(([type, id]) => [id, type as AsepriteUserPropertyType]),
);
export const ASEPRITE_USER_PROPERTY_MAP_KEY = 0;
const PROPERTY_TYPE_ID_MAX = 19;
const PROPERTY_MAP_HEADER_BYTE_SIZE = 8;
const UUID_BYTE_LENGTH = 16;
const INT8_MIN = -0x80;
const INT8_MAX = 0x7f;
const INT32_MIN = -0x8000_0000;
const INT32_MAX = 0x7fff_ffff;
const EMPTY_PROPERTIES_BLOCK = Uint8Array.from([
  PROPERTY_MAP_HEADER_BYTE_SIZE,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
]);
const MAX_PROPERTY_DEPTH = 128;
const MAX_PROPERTY_ITEMS = 100_000;
const UTF16_SURROGATE_START = 0xd800;
const UTF16_SURROGATE_END = 0xdbff;
const UTF16_LOW_SURROGATE_START = 0xdc00;
const UTF16_LOW_SURROGATE_END = 0xdfff;
const UTF16_SURROGATE_OFFSET = 0x10000;
const UTF8_CONTINUATION_BITS = 6;
const UTF8_CONTINUATION_MASK = 0x3f;

class PropertyReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly end = bytes.byteLength,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get position() {
    return this.offset;
  }

  get remaining() {
    return this.end - this.offset;
  }

  private ensure(size: number) {
    if (!Number.isSafeInteger(size) || size < 0 || this.offset + size > this.end)
      throw new Error("User properties are truncated");
  }

  u8() {
    this.ensure(1);
    return this.bytes[this.offset++];
  }

  i8() {
    this.ensure(1);
    return this.view.getInt8(this.offset++);
  }

  u16() {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  i16() {
    this.ensure(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32() {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  i32() {
    this.ensure(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  i64() {
    this.ensure(8);
    const value = this.view.getBigInt64(this.offset, true).toString();
    this.offset += 8;
    return value;
  }

  u64() {
    this.ensure(8);
    const value = this.view.getBigUint64(this.offset, true).toString();
    this.offset += 8;
    return value;
  }

  f32() {
    this.ensure(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f64() {
    this.ensure(8);
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  bytesCopy(size: number) {
    this.ensure(size);
    const value = this.bytes.slice(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }

  string() {
    return decodeUtf8(this.bytesCopy(this.u16()));
  }
}

class PropertyWriter {
  private readonly bytes: number[] = [];

  get length() {
    return this.bytes.length;
  }

  u8(value: number) {
    this.bytes.push(value & 0xff);
  }

  i8(value: number) {
    this.u8(value);
  }

  u16(value: number) {
    this.u8(value);
    this.u8(value >>> 8);
  }

  i16(value: number) {
    this.u16(value);
  }

  u32(value: number) {
    this.u8(value);
    this.u8(value >>> 8);
    this.u8(value >>> 16);
    this.u8(value >>> 24);
  }

  i32(value: number) {
    this.u32(value);
  }

  i64(value: bigint) {
    const normalized = BigInt.asUintN(64, value);
    for (let shift = 0n; shift < 64n; shift += 8n) this.u8(Number((normalized >> shift) & 0xffn));
  }

  u64(value: bigint) {
    this.i64(value);
  }

  f32(value: number) {
    if (typeof value !== "number") throw new Error("float property value is invalid");
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    this.bytesCopy(new Uint8Array(buffer));
  }

  f64(value: number) {
    if (typeof value !== "number") throw new Error("double property value is invalid");
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    this.bytesCopy(new Uint8Array(buffer));
  }

  bytesCopy(value: Uint8Array) {
    for (const byte of value) this.bytes.push(byte);
  }

  string(value: string) {
    const bytes = encodeUtf8(value);
    if (bytes.byteLength > UINT16_MAX)
      throw new Error("Property names and strings must fit in 65535 UTF-8 bytes");
    this.u16(bytes.byteLength);
    this.bytesCopy(bytes);
  }

  patchU32(offset: number, value: number) {
    for (let index = 0; index < 4; index += 1)
      this.bytes[offset + index] = (value >>> (index * 8)) & 0xff;
  }

  toBytes() {
    return Uint8Array.from(this.bytes);
  }
}

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= UTF16_SURROGATE_START && code <= UTF16_SURROGATE_END && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= UTF16_LOW_SURROGATE_START && low <= UTF16_LOW_SURROGATE_END) {
        code =
          UTF16_SURROGATE_OFFSET +
          ((code - UTF16_SURROGATE_START) << 10) +
          low -
          UTF16_LOW_SURROGATE_START;
        index += 1;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800)
      bytes.push(0xc0 | (code >> UTF8_CONTINUATION_BITS), 0x80 | (code & UTF8_CONTINUATION_MASK));
    else if (code < UTF16_SURROGATE_START)
      bytes.push(
        0xe0 | (code >> (UTF8_CONTINUATION_BITS * 2)),
        0x80 | ((code >> UTF8_CONTINUATION_BITS) & UTF8_CONTINUATION_MASK),
        0x80 | (code & UTF8_CONTINUATION_MASK),
      );
    else if (code > UTF16_LOW_SURROGATE_END)
      bytes.push(
        0xf0 | (code >> (UTF8_CONTINUATION_BITS * 3)),
        0x80 | ((code >> (UTF8_CONTINUATION_BITS * 2)) & UTF8_CONTINUATION_MASK),
        0x80 | ((code >> UTF8_CONTINUATION_BITS) & UTF8_CONTINUATION_MASK),
        0x80 | (code & UTF8_CONTINUATION_MASK),
      );
    else bytes.push(0xef, 0xbf, 0xbd);
  }
  return Uint8Array.from(bytes);
}

function propertyType(id: number): AsepriteUserPropertyType {
  const type = PROPERTY_TYPES_BY_ID.get(id);
  if (type === undefined) throw new Error(`Unsupported Aseprite property type ${id}`);
  return type;
}

function readProperties(
  reader: PropertyReader,
  count: number,
  depth: number,
): AsepriteUserProperty[] {
  if (depth > MAX_PROPERTY_DEPTH)
    throw new Error("User properties exceed the 128-level nesting limit");
  if (count > MAX_PROPERTY_ITEMS) throw new Error("User properties contain too many items");
  const properties: AsepriteUserProperty[] = [];
  for (let index = 0; index < count; index += 1) {
    const name = reader.string();
    properties.push({ name, value: readPropertyValue(reader, propertyType(reader.u16()), depth) });
  }
  return properties;
}

function readPropertyValue(
  reader: PropertyReader,
  type: AsepriteUserPropertyType,
  depth: number,
): AsepriteUserPropertyValue {
  if (depth > MAX_PROPERTY_DEPTH)
    throw new Error("User properties exceed the 128-level nesting limit");
  switch (type) {
    case AsepriteUserPropertyType.Null:
      return { type };
    case AsepriteUserPropertyType.Boolean:
      return { type, value: reader.u8() !== 0 };
    case AsepriteUserPropertyType.Int8:
      return { type, value: reader.i8() };
    case AsepriteUserPropertyType.Uint8:
      return { type, value: reader.u8() };
    case AsepriteUserPropertyType.Int16:
      return { type, value: reader.i16() };
    case AsepriteUserPropertyType.Uint16:
      return { type, value: reader.u16() };
    case AsepriteUserPropertyType.Int32:
      return { type, value: reader.i32() };
    case AsepriteUserPropertyType.Uint32:
      return { type, value: reader.u32() };
    case AsepriteUserPropertyType.Int64:
      return { type, value: reader.i64() };
    case AsepriteUserPropertyType.Uint64:
      return { type, value: reader.u64() };
    case AsepriteUserPropertyType.Fixed:
      return { type, value: reader.i32() / FIXED_POINT_16_16_SCALE };
    case AsepriteUserPropertyType.Float:
      return { type, value: reader.f32() };
    case AsepriteUserPropertyType.Double:
      return { type, value: reader.f64() };
    case AsepriteUserPropertyType.String:
      return { type, value: reader.string() };
    case AsepriteUserPropertyType.Point:
      return { type, value: { x: reader.i32(), y: reader.i32() } };
    case AsepriteUserPropertyType.Size:
      return { type, value: { width: reader.i32(), height: reader.i32() } };
    case AsepriteUserPropertyType.Rect:
      return {
        type,
        value: { x: reader.i32(), y: reader.i32(), width: reader.i32(), height: reader.i32() },
      };
    case AsepriteUserPropertyType.Vector: {
      const count = reader.u32();
      if (count > MAX_PROPERTY_ITEMS) throw new Error("User vectors contain too many items");
      const elementType = reader.u16();
      const values = Array.from({ length: count }, () => {
        const itemType = elementType === 0 ? propertyType(reader.u16()) : propertyType(elementType);
        return readPropertyValue(reader, itemType, depth + 1);
      });
      return { type, value: { elementType, values } };
    }
    case AsepriteUserPropertyType.Properties: {
      const count = reader.u32();
      return { type, value: readProperties(reader, count, depth + 1) };
    }
    case AsepriteUserPropertyType.Uuid: {
      const value = [...reader.bytesCopy(UUID_BYTE_LENGTH)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return { type, value };
    }
  }
}

/** Decode the Aseprite User Data properties block, preserving every property map. */
export function decodeAsepriteUserPropertyMaps(bytes: Uint8Array): AsepriteUserPropertyMap[] {
  const header = new PropertyReader(bytes);
  const size = header.u32();
  if (size < PROPERTY_MAP_HEADER_BYTE_SIZE || size > bytes.byteLength)
    throw new Error("Invalid Aseprite user properties size");
  const reader = new PropertyReader(bytes, size);
  reader.u32();
  const mapCount = reader.u32();
  if (mapCount > MAX_PROPERTY_ITEMS) throw new Error("User properties contain too many maps");
  const maps: AsepriteUserPropertyMap[] = [];
  for (let index = 0; index < mapCount; index += 1) {
    const key = reader.u32();
    const count = reader.u32();
    maps.push({ key, properties: readProperties(reader, count, 0) });
  }
  if (reader.position !== size) throw new Error("Aseprite user properties contain trailing bytes");
  return maps;
}

function checkedInteger(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
    throw new Error(`${label} must be an integer in ${min}..${max}`);
  return value;
}

function checkedNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label} must be finite`);
  return value;
}

function checkedBigInt(value: unknown, unsigned: boolean): bigint {
  if (typeof value !== "string" || !/^-?\d+$/.test(value))
    throw new Error("Expected a decimal 64-bit integer");
  const integer = BigInt(value);
  const min = unsigned ? 0n : -(1n << 63n);
  const max = unsigned ? (1n << 64n) - 1n : (1n << 63n) - 1n;
  if (integer < min || integer > max) throw new Error("64-bit integer is out of range");
  return integer;
}

function checkedObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function propertyTypeId(type: AsepriteUserPropertyType): number {
  const id = PROPERTY_TYPE_IDS[type];
  if (id === undefined) throw new Error("Unsupported user property type");
  return id;
}

function writeProperties(
  writer: PropertyWriter,
  properties: readonly AsepriteUserProperty[],
  depth: number,
) {
  if (depth > MAX_PROPERTY_DEPTH)
    throw new Error("User properties exceed the 128-level nesting limit");
  if (properties.length > MAX_PROPERTY_ITEMS)
    throw new Error("User properties contain too many items");
  writer.u32(properties.length);
  for (const property of properties) {
    writer.string(property.name);
    writer.u16(propertyTypeId(property.value.type));
    writePropertyValue(writer, property.value, depth);
  }
}

function writePropertyValue(
  writer: PropertyWriter,
  value: AsepriteUserPropertyValue,
  depth: number,
) {
  if (depth > MAX_PROPERTY_DEPTH)
    throw new Error("User properties exceed the 128-level nesting limit");
  switch (value.type) {
    case AsepriteUserPropertyType.Null:
      return;
    case AsepriteUserPropertyType.Boolean:
      if (typeof value.value !== "boolean") throw new Error("Boolean property value is invalid");
      writer.u8(value.value ? 1 : 0);
      return;
    case AsepriteUserPropertyType.Int8:
      writer.i8(checkedInteger(value.value, INT8_MIN, INT8_MAX, "int8 property"));
      return;
    case AsepriteUserPropertyType.Uint8:
      writer.u8(checkedInteger(value.value, 0, 255, "uint8 property"));
      return;
    case AsepriteUserPropertyType.Int16:
      writer.i16(checkedInteger(value.value, INT16_MIN, INT16_MAX, "int16 property"));
      return;
    case AsepriteUserPropertyType.Uint16:
      writer.u16(checkedInteger(value.value, 0, UINT16_MAX, "uint16 property"));
      return;
    case AsepriteUserPropertyType.Int32:
      writer.i32(checkedInteger(value.value, INT32_MIN, INT32_MAX, "int32 property"));
      return;
    case AsepriteUserPropertyType.Uint32:
      writer.u32(checkedInteger(value.value, 0, UINT32_MAX, "uint32 property"));
      return;
    case AsepriteUserPropertyType.Int64:
      writer.i64(checkedBigInt(value.value, false));
      return;
    case AsepriteUserPropertyType.Uint64:
      writer.u64(checkedBigInt(value.value, true));
      return;
    case AsepriteUserPropertyType.Fixed: {
      const fixedValue = Math.round(
        checkedNumber(value.value, "fixed property") * FIXED_POINT_16_16_SCALE,
      );
      writer.i32(checkedInteger(fixedValue, INT32_MIN, INT32_MAX, "fixed property"));
      return;
    }
    case AsepriteUserPropertyType.Float:
      writer.f32(value.value);
      return;
    case AsepriteUserPropertyType.Double:
      writer.f64(value.value);
      return;
    case AsepriteUserPropertyType.String:
      if (typeof value.value !== "string") throw new Error("String property value is invalid");
      writer.string(value.value);
      return;
    case AsepriteUserPropertyType.Point: {
      const point = checkedObject(value.value, "Point property");
      writer.i32(checkedInteger(point.x, INT32_MIN, INT32_MAX, "Point x"));
      writer.i32(checkedInteger(point.y, INT32_MIN, INT32_MAX, "Point y"));
      return;
    }
    case AsepriteUserPropertyType.Size: {
      const size = checkedObject(value.value, "Size property");
      writer.i32(checkedInteger(size.width, INT32_MIN, INT32_MAX, "Size width"));
      writer.i32(checkedInteger(size.height, INT32_MIN, INT32_MAX, "Size height"));
      return;
    }
    case AsepriteUserPropertyType.Rect: {
      const rect = checkedObject(value.value, "Rect property");
      writer.i32(checkedInteger(rect.x, INT32_MIN, INT32_MAX, "Rect x"));
      writer.i32(checkedInteger(rect.y, INT32_MIN, INT32_MAX, "Rect y"));
      writer.i32(checkedInteger(rect.width, INT32_MIN, INT32_MAX, "Rect width"));
      writer.i32(checkedInteger(rect.height, INT32_MIN, INT32_MAX, "Rect height"));
      return;
    }
    case AsepriteUserPropertyType.Vector: {
      const vector = checkedObject(value.value, "Vector property");
      if (!Array.isArray(vector.values)) throw new Error("Vector values must be an array");
      const values = vector.values as AsepriteUserPropertyValue[];
      if (values.length > MAX_PROPERTY_ITEMS)
        throw new Error("User vectors contain too many items");
      const homogeneousType =
        values.length && values.every((item) => item.type === values[0].type)
          ? propertyTypeId(values[0].type)
          : 0;
      const elementType = checkedInteger(
        vector.elementType,
        0,
        PROPERTY_TYPE_ID_MAX,
        "Vector element type",
      );
      const storedType = elementType || homogeneousType;
      if (storedType && values.some((item) => propertyTypeId(item.type) !== storedType))
        throw new Error("Vector elements do not match the selected element type");
      writer.u32(values.length);
      writer.u16(storedType);
      for (const item of values) {
        if (storedType === 0) writer.u16(propertyTypeId(item.type));
        writePropertyValue(writer, item, depth + 1);
      }
      return;
    }
    case AsepriteUserPropertyType.Properties:
      if (!Array.isArray(value.value)) throw new Error("Nested properties must be an array");
      writeProperties(writer, value.value, depth + 1);
      return;
    case AsepriteUserPropertyType.Uuid: {
      if (typeof value.value !== "string") throw new Error("UUID property value is invalid");
      const hex = value.value.replace(/-/g, "");
      if (hex.length !== UUID_BYTE_LENGTH * 2 || !/^[0-9a-fA-F]+$/.test(hex))
        throw new Error("UUID must contain 32 hexadecimal digits");
      for (let index = 0; index < hex.length; index += 2)
        writer.u8(Number.parseInt(hex.slice(index, index + 2), 16));
      return;
    }
    default:
      throw new Error("Unsupported user property type");
  }
}

/** Encode Aseprite property maps in the on-disk User Data chunk format. */
export function encodeAsepriteUserPropertyMaps(
  maps: readonly AsepriteUserPropertyMap[],
): Uint8Array {
  const nonemptyMaps = maps.filter((map) => map.properties.length > 0);
  if (nonemptyMaps.length > MAX_PROPERTY_ITEMS)
    throw new Error("User properties contain too many maps");
  if (!nonemptyMaps.length) return new Uint8Array();
  const writer = new PropertyWriter();
  writer.u32(0);
  writer.u32(nonemptyMaps.length);
  for (const map of nonemptyMaps) {
    writer.u32(checkedInteger(map.key, 0, UINT32_MAX, "Property map key"));
    writeProperties(writer, map.properties, 0);
  }
  writer.patchU32(0, writer.length);
  return writer.toBytes();
}

/** Replace the user-defined map while retaining maps owned by Aseprite extensions. */
export function replaceAsepriteUserProperties(
  bytes: Uint8Array | undefined,
  properties: readonly AsepriteUserProperty[],
): Uint8Array | undefined {
  const maps = bytes?.byteLength ? decodeAsepriteUserPropertyMaps(bytes) : [];
  const originalMapSize = bytes?.byteLength
    ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true)
    : 0;
  const trailingBytes = bytes?.slice(originalMapSize) ?? new Uint8Array();
  const userMapIndex = maps.findIndex((map) => map.key === ASEPRITE_USER_PROPERTY_MAP_KEY);
  if (!properties.length) {
    if (userMapIndex >= 0) maps.splice(userMapIndex, 1);
  } else if (userMapIndex >= 0)
    maps[userMapIndex] = { key: ASEPRITE_USER_PROPERTY_MAP_KEY, properties: [...properties] };
  else maps.unshift({ key: ASEPRITE_USER_PROPERTY_MAP_KEY, properties: [...properties] });
  const encoded = encodeAsepriteUserPropertyMaps(maps);
  if (!trailingBytes.byteLength) return encoded.byteLength ? encoded : undefined;
  const mapBlock = encoded.byteLength ? encoded : EMPTY_PROPERTIES_BLOCK;
  const withTrailingBytes = new Uint8Array(mapBlock.byteLength + trailingBytes.byteLength);
  withTrailingBytes.set(mapBlock);
  withTrailingBytes.set(trailingBytes, mapBlock.byteLength);
  return withTrailingBytes;
}

/** Build one edited row from the type selector and its text/JSON value. */
export function createAsepriteUserPropertyValue(
  type: AsepriteUserPropertyType,
  text: string,
): AsepriteUserPropertyValue {
  const trimmed = text.trim();
  if (type === AsepriteUserPropertyType.Null) return { type };
  if (type === AsepriteUserPropertyType.String) return { type, value: text };
  if (type === AsepriteUserPropertyType.Boolean) {
    if (trimmed !== "true" && trimmed !== "false") throw new Error("Enter true or false");
    return { type, value: trimmed === "true" };
  }
  if (type === AsepriteUserPropertyType.Int64 || type === AsepriteUserPropertyType.Uint64) {
    checkedBigInt(trimmed, type === AsepriteUserPropertyType.Uint64);
    return { type, value: trimmed };
  }
  if (
    type === AsepriteUserPropertyType.Int8 ||
    type === AsepriteUserPropertyType.Uint8 ||
    type === AsepriteUserPropertyType.Int16 ||
    type === AsepriteUserPropertyType.Uint16 ||
    type === AsepriteUserPropertyType.Int32 ||
    type === AsepriteUserPropertyType.Uint32
  ) {
    if (!trimmed) throw new Error("Enter an integer");
    const value = Number(trimmed);
    const ranges: Record<string, readonly [number, number]> = {
      [AsepriteUserPropertyType.Int8]: [INT8_MIN, INT8_MAX],
      [AsepriteUserPropertyType.Uint8]: [0, UINT8_MAX],
      [AsepriteUserPropertyType.Int16]: [INT16_MIN, INT16_MAX],
      [AsepriteUserPropertyType.Uint16]: [0, UINT16_MAX],
      [AsepriteUserPropertyType.Int32]: [INT32_MIN, INT32_MAX],
      [AsepriteUserPropertyType.Uint32]: [0, UINT32_MAX],
    };
    const [min, max] = ranges[type];
    return { type, value: checkedInteger(value, min, max, type) };
  }
  if (
    type === AsepriteUserPropertyType.Fixed ||
    type === AsepriteUserPropertyType.Float ||
    type === AsepriteUserPropertyType.Double
  ) {
    if (!trimmed) throw new Error("Enter a number");
    const value = Number(trimmed);
    if (type === AsepriteUserPropertyType.Fixed) checkedNumber(value, type);
    else if (
      !Number.isFinite(value) &&
      !["NaN", "Infinity", "+Infinity", "-Infinity"].includes(trimmed)
    )
      throw new Error("Enter a number");
    return { type, value };
  }
  if (type === AsepriteUserPropertyType.Uuid) return { type, value: text.trim() };
  const parsed = JSON.parse(text) as unknown;
  if (type === AsepriteUserPropertyType.Point) {
    const value = checkedObject(parsed, "Point");
    return { type, value: { x: value.x as number, y: value.y as number } };
  }
  if (type === AsepriteUserPropertyType.Size) {
    const value = checkedObject(parsed, "Size");
    return { type, value: { width: value.width as number, height: value.height as number } };
  }
  if (type === AsepriteUserPropertyType.Rect) {
    const value = checkedObject(parsed, "Rectangle");
    return {
      type,
      value: {
        x: value.x as number,
        y: value.y as number,
        width: value.width as number,
        height: value.height as number,
      },
    };
  }
  if (type === AsepriteUserPropertyType.Vector) {
    const value = checkedObject(parsed, "Vector");
    if (!Array.isArray(value.values)) throw new Error("Vector JSON needs a values array");
    return {
      type,
      value: {
        elementType: checkedInteger(value.elementType, 0, 19, "Vector element type"),
        values: value.values as AsepriteUserPropertyValue[],
      },
    };
  }
  if (type === AsepriteUserPropertyType.Properties) {
    if (!Array.isArray(parsed)) throw new Error("Nested properties JSON needs an array");
    return { type, value: parsed as AsepriteUserProperty[] };
  }
  throw new Error(`Unsupported property type ${type}`);
}

export function formatAsepriteUserPropertyValue(value: AsepriteUserPropertyValue): string {
  if (
    value.type === AsepriteUserPropertyType.Point ||
    value.type === AsepriteUserPropertyType.Size ||
    value.type === AsepriteUserPropertyType.Rect ||
    value.type === AsepriteUserPropertyType.Vector ||
    value.type === AsepriteUserPropertyType.Properties
  )
    return JSON.stringify(value.value);
  if (value.type === AsepriteUserPropertyType.Null) return "";
  if (typeof value.value === "number" && Object.is(value.value, -0)) return "-0";
  return String(value.value);
}
