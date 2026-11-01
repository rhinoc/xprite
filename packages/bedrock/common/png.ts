import { crc32 } from "./crc32";
import { joinBytes } from "./join-bytes";
import { UINT8_MAX } from "./numeric-constants";
import { decodeUtf8 } from "./utf8";

const RGBA_CHANNELS = 4;
const PNG_HEADER_BYTES = 33;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export interface PngSource {
  width: number;
  height: number;
  alpha: boolean;
  grayscale: boolean;
  compressed: Uint8Array;
  inflatedByteLength: number;
  /** Call only after checking dimensions and inflating exactly inflatedByteLength bytes. */
  decode(samples: Uint8Array): { width: number; height: number; data: Uint8ClampedArray };
}

export function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;
/** Read PNG source samples without canvas alpha rounding or display color conversion. */
export function readPng(bytes: Uint8Array): PngSource | null {
  if (!hasPngSignature(bytes)) return null;
  if (bytes.length < PNG_HEADER_BYTES) throw new Error("Incomplete PNG header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20),
    bits = bytes[24],
    type = bytes[25];
  if (
    !width ||
    !height ||
    view.getUint32(8) !== 13 ||
    decodeUtf8(bytes.subarray(12, 16)) !== "IHDR"
  )
    throw new Error("Invalid PNG header.");
  const channels =
    type === 0 || type === 3 ? 1 : type === 2 ? 3 : type === 4 ? 2 : type === 6 ? 4 : 0;
  if (
    !channels ||
    ![1, 2, 4, 8, 16].includes(bits) ||
    (type !== 0 && type !== 3 && bits < 8) ||
    (type === 3 && bits === 16) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] > 1
  )
    throw new Error("Invalid PNG color layout.");
  const compressed: Uint8Array[] = [];
  let transparency: Uint8Array | null = null;
  let paletteBytes: Uint8Array | null = null;
  let ended = false;
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = view.getUint32(at),
      end = at + length + 12;
    if (
      end > bytes.length ||
      crc32(bytes.subarray(at + 4, at + 8 + length)) !== view.getUint32(at + 8 + length)
    )
      throw new Error("Invalid PNG chunk.");
    const name = decodeUtf8(bytes.subarray(at + 4, at + 8));
    if (name === "IDAT") compressed.push(bytes.subarray(at + 8, at + 8 + length));
    if (name === "PLTE") paletteBytes = bytes.subarray(at + 8, at + 8 + length);
    if (name === "tRNS") transparency = bytes.subarray(at + 8, at + 8 + length);
    if (name === "IEND") {
      ended = true;
      break;
    }
    at = end;
  }
  if (!ended || !compressed.length) throw new Error("Incomplete PNG image.");
  const passes = bytes[28] ? ADAM7 : [[0, 0, 1, 1] as const];
  const passSize = (start: number, step: number, size: number) =>
    Math.max(0, Math.ceil((size - start) / step));
  let expected = 0;
  for (const [x, y, sx, sy] of passes) {
    const w = passSize(x, sx, width),
      h = passSize(y, sy, height);
    if (w && h) expected += (Math.ceil((w * channels * bits) / 8) + 1) * h;
  }
  if (!Number.isSafeInteger(expected)) throw new Error("Invalid PNG sample size.");
  if (type === 3 && (!paletteBytes?.length || paletteBytes.length % 3 || paletteBytes.length > 768))
    throw new Error("Invalid PNG palette.");
  const palette = paletteBytes;
  if (
    transparency &&
    ((type === 0 && transparency.length !== 2) ||
      (type === 2 && transparency.length !== 6) ||
      (type === 3 && transparency.length > palette!.length / 3) ||
      type === 4 ||
      type === 6)
  )
    throw new Error("Invalid PNG transparency.");
  return {
    width,
    height,
    alpha: type === 4 || type === 6 || transparency !== null,
    grayscale: type === 0 || type === 4,
    compressed: joinBytes(compressed),
    inflatedByteLength: expected,
    decode(packed) {
      if (packed.length !== expected) throw new Error("Incomplete PNG samples.");
      const pixels = { width, height, data: new Uint8ClampedArray(width * height * RGBA_CHANNELS) };
      const transparent =
        transparency && type !== 3
          ? new DataView(transparency.buffer, transparency.byteOffset, transparency.byteLength)
          : null;
      let offset = 0;
      for (const [px, py, sx, sy] of passes) {
        const w = passSize(px, sx, width),
          h = passSize(py, sy, height);
        if (!w || !h) continue;
        const stride = Math.ceil((w * channels * bits) / 8),
          bpp = Math.max(1, Math.ceil((channels * bits) / 8));
        let previous = new Uint8Array(stride);
        for (let y = 0; y < h; y++) {
          const filter = packed[offset++];
          if (filter > 4) throw new Error("Invalid PNG filter.");
          const row = new Uint8Array(stride);
          for (let at = 0; at < stride; at++) {
            const left = at >= bpp ? row[at - bpp] : 0,
              up = previous[at],
              corner = at >= bpp ? previous[at - bpp] : 0;
            const p = left + up - corner,
              a = Math.abs(p - left),
              b = Math.abs(p - up),
              c = Math.abs(p - corner);
            const prediction =
              filter === 1
                ? left
                : filter === 2
                  ? up
                  : filter === 3
                    ? Math.floor((left + up) / 2)
                    : filter === 4
                      ? a <= b && a <= c
                        ? left
                        : b <= c
                          ? up
                          : corner
                      : 0;
            row[at] = (packed[offset++] + prediction) & UINT8_MAX;
          }
          for (let x = 0; x < w; x++) {
            const raw = (channel: number) => {
              const at = x * channels + channel;
              return bits < 8
                ? (row[Math.floor((at * bits) / 8)] >>> (8 - bits - ((at * bits) % 8))) &
                    ((1 << bits) - 1)
                : bits === 16
                  ? row[at * 2] * 256 + row[at * 2 + 1]
                  : row[at];
            };
            const sample = (channel: number) =>
              bits < 8
                ? (raw(channel) * UINT8_MAX) / ((1 << bits) - 1)
                : bits === 16
                  ? raw(channel) >>> 8
                  : raw(channel);
            let rgba: readonly number[];
            if (type === 3) {
              const index = raw(0),
                at = index * 3;
              if (at + 3 > palette!.length) throw new Error("PNG index exceeds its palette.");
              rgba = [
                palette![at],
                palette![at + 1],
                palette![at + 2],
                transparency?.[index] ?? UINT8_MAX,
              ];
            } else if (type === 0 || type === 4)
              rgba = [
                sample(0),
                sample(0),
                sample(0),
                type === 4
                  ? sample(1)
                  : transparent && raw(0) === transparent.getUint16(0)
                    ? 0
                    : UINT8_MAX,
              ];
            else
              rgba = [
                sample(0),
                sample(1),
                sample(2),
                type === 6
                  ? sample(3)
                  : transparent &&
                      [0, 1, 2].every(
                        (channel) => raw(channel) === transparent.getUint16(channel * 2),
                      )
                    ? 0
                    : UINT8_MAX,
              ];
            pixels.data.set(rgba, ((py + y * sy) * width + px + x * sx) * RGBA_CHANNELS);
          }
          previous = row;
        }
      }
      return pixels;
    },
  };
}
