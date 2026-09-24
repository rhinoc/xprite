import type { SliceKey, SpriteSlice } from "$/sprite/slices";
import { decodeUtf8 } from "@xprite/bedrock/common/utf8";
export type { SliceKey, SpriteSlice, SlicePropertiesEdit } from "$/sprite/slices";
import { UINT8_MAX, UINT16_MAX } from "$/base/numeric-constants";
import type { AsepriteRawChunk } from "$/import-export/aseprite/model";

const SLICE = 0x2022;
const USER_DATA = 0x2020;
function encodeUtf8(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
  }
  return out;
}

export function sliceKeyAt(slice: SpriteSlice, frame: number): SliceKey | undefined {
  const key = [...slice.keys].reverse().find((value) => value.frame <= frame);
  return key && key.bounds.width > 0 && key.bounds.height > 0 ? key : undefined;
}
export function setSliceKey(
  slice: SpriteSlice,
  frame: number,
  key: Omit<SliceKey, "frame">,
): SpriteSlice {
  const keys = slice.keys.filter((value) => value.frame !== frame);
  return { ...slice, keys: [...keys, { ...key, frame }].sort((a, b) => a.frame - b.frame) };
}
export function parseSliceChunks(chunks: readonly AsepriteRawChunk[]): SpriteSlice[] {
  const result: SpriteSlice[] = [];
  let last: SpriteSlice | undefined;
  for (const chunk of chunks) {
    if (chunk.type !== SLICE && chunk.type !== USER_DATA) {
      last = undefined;
      continue;
    }
    const bytes = chunk.bytes,
      view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 0;
    const need = (n: number) => {
      if (at + n > bytes.length) throw new Error("Truncated Slice chunk");
    };
    const u16 = () => {
      need(2);
      const n = view.getUint16(at, true);
      at += 2;
      return n;
    };
    const u32 = () => {
      need(4);
      const n = view.getUint32(at, true);
      at += 4;
      return n;
    };
    const i32 = () => {
      need(4);
      const n = view.getInt32(at, true);
      at += 4;
      return n;
    };
    const str = () => {
      const n = u16();
      need(n);
      const value = decodeUtf8(bytes.subarray(at, at + n));
      at += n;
      return value;
    };
    if (chunk.type === USER_DATA) {
      if (!last) continue;
      const flags = u32();
      if (flags & 1) last.data = str();
      if (flags & 2) {
        need(4);
        last.color = `#${[...bytes.subarray(at, at + 4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        at += 4;
      }
      if (flags & 4) last.properties = bytes.slice(at);
      last = undefined;
      continue;
    }
    const count = u32(),
      flags = u32();
    u32();
    const name = str();
    if (count > UINT16_MAX) throw new Error("Too many Slice keys");
    const keys: SliceKey[] = [];
    for (let i = 0; i < count; i++) {
      const frame = u32(),
        bounds = { x: i32(), y: i32(), width: u32(), height: u32() };
      const rawCenter = flags & 1 ? { x: i32(), y: i32(), width: u32(), height: u32() } : undefined;
      const rawPivot = flags & 2 ? { x: i32(), y: i32() } : undefined;
      keys.push({
        frame,
        bounds,
        center: rawCenter?.width && rawCenter.height ? rawCenter : undefined,
        pivot: rawPivot?.x === -2147483648 ? undefined : rawPivot,
      });
    }
    last = { id: `slice-${result.length + 1}`, name, keys };
    result.push(last);
  }
  return result;
}
export function serializeSliceChunks(slices: readonly SpriteSlice[]): AsepriteRawChunk[] {
  const chunks: AsepriteRawChunk[] = [];
  for (const slice of slices) {
    const flags =
      (slice.keys.some((k) => k.center) ? 1 : 0) | (slice.keys.some((k) => k.pivot) ? 2 : 0);
    const output: number[] = [];
    const u16 = (n: number) => output.push(n & UINT8_MAX, (n >>> 8) & UINT8_MAX);
    const u32 = (n: number) =>
      output.push(
        n & UINT8_MAX,
        (n >>> 8) & UINT8_MAX,
        (n >>> 16) & UINT8_MAX,
        (n >>> 24) & UINT8_MAX,
      );
    const str = (s: string) => {
      const bytes = encodeUtf8(s);
      if (bytes.length > UINT16_MAX) throw new Error("Slice name is too long");
      u16(bytes.length);
      output.push(...bytes);
    };
    u32(slice.keys.length);
    u32(flags);
    u32(0);
    str(slice.name);
    for (const key of slice.keys) {
      u32(key.frame);
      u32(key.bounds.x);
      u32(key.bounds.y);
      u32(key.bounds.width);
      u32(key.bounds.height);
      if (flags & 1) {
        const c = key.center ?? { x: 0, y: 0, width: 0, height: 0 };
        u32(c.x);
        u32(c.y);
        u32(c.width);
        u32(c.height);
      }
      if (flags & 2) {
        const p = key.pivot ?? { x: -2147483648, y: -2147483648 };
        u32(p.x);
        u32(p.y);
      }
    }
    chunks.push({ type: SLICE, bytes: Uint8Array.from(output), frameIndex: 0 });
    if (slice.color !== undefined || slice.data !== undefined || slice.properties !== undefined) {
      const extra: number[] = [];
      const byte = encodeUtf8(slice.data ?? "");
      const color = (slice.color ?? "#0000ffff").replace(/^#/, "");
      const word = (n: number) =>
        extra.push(
          n & UINT8_MAX,
          (n >>> 8) & UINT8_MAX,
          (n >>> 16) & UINT8_MAX,
          (n >>> 24) & UINT8_MAX,
        );
      word(
        (slice.data !== undefined ? 1 : 0) |
          (slice.color !== undefined ? 2 : 0) |
          (slice.properties !== undefined ? 4 : 0),
      );
      if (slice.data !== undefined) {
        extra.push(byte.length & UINT8_MAX, (byte.length >>> 8) & UINT8_MAX, ...byte);
      }
      if (slice.color !== undefined)
        for (let i = 0; i < 8; i += 2) extra.push(Number.parseInt(color.slice(i, i + 2), 16) || 0);
      if (slice.properties) for (const byte of slice.properties) extra.push(byte);
      chunks.push({ type: USER_DATA, bytes: Uint8Array.from(extra), frameIndex: 0 });
    }
  }
  return chunks;
}
export function sliceMetadataForExport(slices: readonly SpriteSlice[]): Record<string, unknown>[] {
  return slices.map((slice) => ({
    name: slice.name,
    ...(slice.color ? { color: slice.color } : {}),
    ...(slice.data !== undefined ? { data: slice.data } : {}),
    keys: slice.keys.map((key) => ({
      frame: key.frame,
      bounds: { x: key.bounds.x, y: key.bounds.y, w: key.bounds.width, h: key.bounds.height },
      ...(key.center
        ? {
            center: { x: key.center.x, y: key.center.y, w: key.center.width, h: key.center.height },
          }
        : {}),
      ...(key.pivot ? { pivot: key.pivot } : {}),
    })),
  }));
}
