import { describe, expect, it, vi } from "vitest";

import {
  MAX_IMPORTED_ANIMATION_FRAMES,
  assertRasterAnimationCapacity,
  rasterAnimationProject,
} from "$/import-export/image/animation";
import { decodeGifAnimation, isGifData } from "$/import-export/image/gif-import";
import {
  decodeWebpAnimation,
  parseWebpAnimation,
  webpAnimationFrameData,
} from "$/import-export/image/webp-import";

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];
const CLEAR = [0, 0, 0, 0];
const GLOBAL_PALETTE = [0, 0, 0, 255, 0, 0];
const LOCAL_PALETTE = [0, 0, 0, 0, 255, 0];

function word(value: number) {
  return [value & 255, value >>> 8];
}

/** Specified code stream, not an encoder round-trip: clear before each literal, then end. */
function literalCodes(indices: readonly number[]) {
  const codes = indices.flatMap((index) => [4, index]).concat(5);
  const bytes = new Uint8Array(Math.ceil((codes.length * 3) / 8));
  for (const [index, code] of codes.entries()) {
    const bit = index * 3;
    bytes[bit >> 3] |= code << (bit & 7);
    if ((bit & 7) > 5) bytes[(bit >> 3) + 1] |= code >>> (8 - (bit & 7));
  }
  return [2, bytes.length, ...bytes, 0];
}

function gifFrame(
  options: {
    x?: number;
    width?: number;
    height?: number;
    indices?: readonly number[];
    compressed?: readonly number[];
    disposal?: number;
    transparent?: boolean;
    delay?: number;
    localPalette?: readonly number[];
    interlaced?: boolean;
  } = {},
) {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  const palette = options.localPalette;
  const paletteFlag = palette ? 0x80 | (Math.log2(palette.length / 3) - 1) : 0;
  return [
    0x21,
    0xf9,
    4,
    ((options.disposal ?? 1) << 2) | (options.transparent ? 1 : 0),
    ...word(options.delay ?? 5),
    0,
    0,
    0x2c,
    ...word(options.x ?? 0),
    0,
    0,
    ...word(width),
    ...word(height),
    paletteFlag | (options.interlaced ? 0x40 : 0),
    ...(palette ?? []),
    ...(options.compressed ?? literalCodes(options.indices ?? [1])),
  ];
}

/** Layout from GIF89a sections 18/20/22, with literal frame bytes authored for these cases. */
function gif(width: number, height: number, frames: readonly number[][]) {
  return new Uint8Array([
    71,
    73,
    70,
    56,
    57,
    97,
    ...word(width),
    ...word(height),
    0x80,
    0,
    0,
    ...GLOBAL_PALETTE,
    ...frames.flat(),
    0x3b,
  ]);
}

function fourCC(value: string) {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function uint24(value: number) {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255];
}

function chunk(kind: string, payload: readonly number[]) {
  const length = payload.length;
  return [...fourCC(kind), ...word(length), 0, 0, ...payload, ...(length & 1 ? [0] : [])];
}

function webpFrame(options: { x?: number; duration?: number; flags?: number } = {}) {
  return chunk("ANMF", [
    ...uint24((options.x ?? 0) / 2),
    ...uint24(0),
    ...uint24(0),
    ...uint24(0),
    ...uint24(options.duration ?? 25),
    options.flags ?? 0,
    // A VP8L container header suffices for demux tests; pixel decoding is supplied separately.
    ...chunk("VP8L", [0x2f, 0, 0, 0, 0]),
  ]);
}

function webp(
  width: number,
  frames: readonly number[][],
  background = [0, 0, 0, 0],
  profile = false,
) {
  const body = [
    ...fourCC("WEBP"),
    ...chunk("VP8X", [0x02 | (profile ? 0x20 : 0), 0, 0, 0, ...uint24(width - 1), ...uint24(0)]),
    ...(profile ? chunk("ICCP", [10, 20, 30]) : []),
    ...chunk("ANIM", [...background, 0, 0]),
    ...frames.flat(),
  ];
  return new Uint8Array([...fourCC("RIFF"), ...word(body.length), 0, 0, ...body]);
}

describe("animated raster import", () => {
  it("recognizes GIF signatures, leaves static images on the ordinary import path, and preserves GIF delays", () => {
    expect(isGifData(new Uint8Array([71, 73, 70, 56, 55, 97]))).toBe(true);
    expect(decodeGifAnimation(gif(1, 1, [gifFrame({ delay: 65535 })]))).toBeNull();
    const animation = decodeGifAnimation(
      gif(1, 1, [gifFrame({ delay: 7 }), gifFrame({ delay: 0 })]),
    )!;
    expect(animation.frames.map((frame) => frame.durationMs)).toEqual([70, 1]);
    expect(Array.from(animation.frames[0].pixels.data)).toEqual(RED);
  });

  it("restores previous/background regions and composites transparent local color tables at their offsets", () => {
    const animation = decodeGifAnimation(
      gif(3, 1, [
        gifFrame({ transparent: true }),
        gifFrame({ x: 1, transparent: true, disposal: 3, localPalette: LOCAL_PALETTE }),
        gifFrame({ x: 2, transparent: true, disposal: 2 }),
        gifFrame({ x: 1, transparent: true, localPalette: LOCAL_PALETTE }),
      ]),
    )!;
    expect(animation.frames.map((frame) => Array.from(frame.pixels.data))).toEqual([
      [...RED, ...CLEAR, ...CLEAR],
      [...RED, ...GREEN, ...CLEAR],
      [...RED, ...CLEAR, ...RED],
      [...RED, ...GREEN, ...CLEAR],
    ]);
    expect(animation.frames[0].pixels.data).not.toBe(animation.frames[1].pixels.data);
  });

  it("decodes all four GIF interlace passes", () => {
    const animation = decodeGifAnimation(
      gif(1, 5, [
        gifFrame({
          height: 5,
          indices: [1, 2, 3, 2, 1],
          interlaced: true,
          localPalette: [0, 0, 0, ...RED.slice(0, 3), ...GREEN.slice(0, 3), ...BLUE.slice(0, 3)],
        }),
        gifFrame(),
      ]),
    )!;
    expect(Array.from(animation.frames[0].pixels.data)).toEqual([
      ...RED,
      ...GREEN,
      ...BLUE,
      ...RED,
      ...GREEN,
    ]);
  });

  it("handles GIF dictionary growth and the next-code special case without relying on its own encoder", () => {
    // LSB-first (code,width): (4,3),(0,3),(1,3),(6,3),(8,4),(5,4).
    // This expands to 0,1,0,1,0,1,0, crossing from 3 to 4 bits at code 8.
    const animation = decodeGifAnimation(
      gif(7, 1, [gifFrame({ width: 7, compressed: [2, 3, 0x44, 0x8c, 0x05, 0] }), gifFrame()]),
    )!;
    const BLACK = [0, 0, 0, 255];
    expect(Array.from(animation.frames[0].pixels.data)).toEqual([
      ...BLACK,
      ...RED,
      ...BLACK,
      ...RED,
      ...BLACK,
      ...RED,
      ...BLACK,
    ]);
  });

  it("rejects truncated, out-of-bounds, over-budget, and unsupported-duration GIF animations", () => {
    const valid = gif(1, 1, [gifFrame(), gifFrame()]);
    expect(() => decodeGifAnimation(valid.subarray(0, valid.length - 1))).toThrow(/Truncated/);
    expect(() => decodeGifAnimation(gif(1, 1, [gifFrame({ x: 1 }), gifFrame()]))).toThrow(/bounds/);
    expect(() => decodeGifAnimation(gif(4096, 4096, [gifFrame(), gifFrame(), gifFrame()]))).toThrow(
      /limit/,
    );
    expect(() => decodeGifAnimation(gif(1, 1, [gifFrame({ delay: 65535 }), gifFrame()]))).toThrow(
      /duration/,
    );
    expect(() =>
      decodeGifAnimation(gif(1, 1, [gifFrame({ compressed: [2, 1, 0, 0] }), gifFrame()])),
    ).toThrow(/LZW/);
  });

  it("demuxes WebP rectangles, flags and exact durations and reconstructs still frames with color profiles", () => {
    const metadata = parseWebpAnimation(
      webp(
        3,
        [webpFrame({ duration: 37 }), webpFrame({ x: 2, flags: 3, duration: 81 })],
        [1, 2, 3, 4],
        true,
      ),
    )!;
    expect(metadata.background).toEqual([3, 2, 1, 4]);
    expect(metadata.frames.map((frame) => frame.durationMs)).toEqual([37, 81]);
    expect(metadata.frames[1]).toMatchObject({
      x: 2,
      width: 1,
      height: 1,
      replace: true,
      disposeBackground: true,
    });
    const encoded = webpAnimationFrameData(metadata.frames[1], metadata.profileChunk);
    expect(String.fromCharCode(...encoded.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...encoded.subarray(30, 34))).toBe("ICCP");
    expect(encoded[20] & 0x02).toBe(0);
    expect(encoded[20] & 0x20).toBe(0x20);
    expect(parseWebpAnimation(encoded)).toBeNull();
  });

  it("composes WebP source-over, replace, and background disposal without modifying decoded pixels", async () => {
    const metadata = parseWebpAnimation(
      webp(
        3,
        [webpFrame(), webpFrame({ flags: 1 }), webpFrame(), webpFrame({ flags: 2 })],
        [255, 0, 0, 255],
      ),
    )!; // Opaque blue ANIM background in BGRA order.
    const halfRed = new Uint8ClampedArray([255, 0, 0, 128]);
    const decode = vi
      .fn()
      .mockResolvedValueOnce({ width: 1, height: 1, data: new Uint8ClampedArray(GREEN) })
      .mockResolvedValueOnce({ width: 1, height: 1, data: halfRed })
      .mockResolvedValueOnce({ width: 1, height: 1, data: new Uint8ClampedArray(CLEAR) })
      .mockResolvedValueOnce({ width: 1, height: 1, data: new Uint8ClampedArray(CLEAR) });
    const result = await decodeWebpAnimation(metadata, decode);
    expect(Array.from(result.frames[0].pixels.data)).toEqual([...GREEN, ...BLUE, ...BLUE]);
    expect(Array.from(result.frames[1].pixels.data)).toEqual([128, 127, 0, 255, ...BLUE, ...BLUE]);
    expect(Array.from(result.frames[2].pixels.data)).toEqual([...BLUE, ...BLUE, ...BLUE]);
    expect(Array.from(result.frames[3].pixels.data)).toEqual([...CLEAR, ...BLUE, ...BLUE]);
    expect(Array.from(halfRed)).toEqual([255, 0, 0, 128]);
  });

  it("rejects truncated and missing WebP animation data before decoding", () => {
    const valid = webp(1, [webpFrame(), webpFrame()]);
    expect(() => parseWebpAnimation(valid.subarray(0, valid.length - 1))).toThrow(/Truncated/);
    expect(() => parseWebpAnimation(webp(1, []))).toThrow(/no animation frames/);
    expect(() => parseWebpAnimation(webp(1, [webpFrame({ x: 2 }), webpFrame()]))).toThrow(/bounds/);
    expect(() =>
      parseWebpAnimation(webp(1, [webpFrame({ duration: 65536 }), webpFrame()])),
    ).toThrow(/duration/);
  });

  it("creates a timeline project with independent editable frames and enforces aggregate allocation limits", () => {
    const frames = [GREEN, RED].map((color, index) => ({
      pixels: { width: 1, height: 1, data: new Uint8ClampedArray(color) },
      durationMs: 50 + index * 50,
    }));
    const project = rasterAnimationProject({ width: 1, height: 1, frames });
    expect(project.image).toBe(frames[0].pixels);
    expect(project.timeline.frames.map((frame) => frame.duration)).toEqual([50, 100]);
    expect(project.timeline.frames[1].cels[0]?.pixels).toBe(frames[1].pixels);
    expect(() => assertRasterAnimationCapacity(1, 1, MAX_IMPORTED_ANIMATION_FRAMES + 1)).toThrow(
      /limit/,
    );
    expect(() => assertRasterAnimationCapacity(4096, 4096, 3)).toThrow(/limit/);
    expect(() => rasterAnimationProject({ width: 2, height: 1, frames })).toThrow(/dimensions/);
  });
});
