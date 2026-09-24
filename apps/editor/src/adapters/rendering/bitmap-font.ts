/** Browser-side conversion of an RGBA atlas into the editor-core bitmap font contract. */
import type { BitmapFont } from "@xprite/editor-core";
import type { Rgba } from "@xprite/editor-core";
import { UINT8_MAX } from "@xprite/editor-core";

type BitmapGlyphTuple = readonly [x: number, y: number, width: number, height: number];

type BitmapAtlasAlpha =
  | "alpha"
  | "red"
  | "green"
  | "blue"
  | "luminance"
  | ((rgba: Rgba, x: number, y: number, codePoint: string) => number);

export interface BitmapFontFromAtlasOptions {
  /** Line spacing in atlas pixels. Defaults to the tallest source glyph. */
  lineHeight?: number;
  /** Font height in atlas pixels. Defaults to the tallest source glyph. */
  height?: number;
  /** Advance in atlas pixels; defaults to each glyph tuple's width. */
  advance?: number | ((codePoint: string, bounds: BitmapGlyphTuple) => number);
  /** Channel used as glyph coverage. The default is the atlas alpha channel. */
  alpha?: BitmapAtlasAlpha;
}

function codePointString(key: string): string {
  // The generated JSON uses decimal code points as keys. Keep already textual
  // keys intact so callers can also provide { A: [...] } records.
  if (/^(?:0|[1-9]\d*)$/.test(key)) {
    const codePoint = Number(key);
    if (Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
      return String.fromCodePoint(codePoint);
    }
  }
  return key;
}

function checkedTuple(key: string, value: number[]): BitmapGlyphTuple {
  if (!Array.isArray(value) || value.length < 4) {
    throw new TypeError(`Glyph ${key} must be an [x, y, width, height] tuple`);
  }
  const tuple = value.slice(0, 4) as number[];
  if (!tuple.every((part) => Number.isSafeInteger(part))) {
    throw new TypeError(`Glyph ${key} has non-integer atlas bounds`);
  }
  const [x, y, width, height] = tuple;
  if (x < 0 || y < 0 || width < 0 || height < 0) {
    throw new RangeError(`Glyph ${key} has negative atlas bounds`);
  }
  return [x, y, width, height];
}

function alphaValue(
  mode: BitmapAtlasAlpha | undefined,
  rgba: Rgba,
  x: number,
  y: number,
  codePoint: string,
): number {
  if (typeof mode === "function")
    return Math.max(0, Math.min(UINT8_MAX, Math.round(mode(rgba, x, y, codePoint))));
  switch (mode) {
    case "red":
      return rgba[0];
    case "green":
      return rgba[1];
    case "blue":
      return rgba[2];
    case "luminance":
      return Math.round(
        (0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2]) * (rgba[3] / UINT8_MAX),
      );
    case "alpha":
    case undefined:
      return rgba[3];
  }
}

/**
 * Convert an atlas and source glyph bounds into an editor-core BitmapFont.
 *
 * Glyph records are keyed by rendered code-point strings (`font.glyphs["A"]`).
 * Numeric JSON keys such as `"65"` are converted to `"A"` automatically.
 */
export function bitmapFontFromAtlas(
  image: { width: number; height: number; data: Uint8ClampedArray },
  glyphs: Readonly<Record<string, number[]>>,
  options: BitmapFontFromAtlasOptions = {},
): BitmapFont {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)) {
    throw new TypeError("bitmapFontFromAtlas expects an image with integer dimensions");
  }
  if (image.width < 0 || image.height < 0)
    throw new RangeError("Bitmap atlas dimensions cannot be negative");
  if (!image.data || image.data.length !== image.width * image.height * 4) {
    throw new TypeError("Bitmap atlas data does not match its dimensions");
  }
  if (
    options.height !== undefined &&
    (!Number.isSafeInteger(options.height) || options.height < 0)
  ) {
    throw new RangeError("Bitmap font height must be a non-negative integer");
  }
  if (
    options.lineHeight !== undefined &&
    (!Number.isSafeInteger(options.lineHeight) || options.lineHeight < 0)
  ) {
    throw new RangeError("Bitmap font lineHeight must be a non-negative integer");
  }
  if (
    typeof options.advance === "number" &&
    (!Number.isSafeInteger(options.advance) || options.advance < 0)
  ) {
    throw new RangeError("Bitmap font advance must be a non-negative integer");
  }

  const result: Record<
    string,
    { width: number; height: number; advance: number; alpha: Uint8Array }
  > = {};
  let tallest = 0;
  for (const [key, sourceBounds] of Object.entries(glyphs)) {
    const bounds = checkedTuple(key, sourceBounds);
    const [x, y, width, height] = bounds;
    if (x + width > image.width || y + height > image.height) {
      throw new RangeError(`Glyph ${key} lies outside the ${image.width} × ${image.height} atlas`);
    }
    const character = codePointString(key);
    const alpha = new Uint8Array(width * height);
    for (let gy = 0; gy < height; gy++) {
      for (let gx = 0; gx < width; gx++) {
        const sourceIndex = ((y + gy) * image.width + x + gx) * 4;
        const rgba: Rgba = [
          image.data[sourceIndex],
          image.data[sourceIndex + 1],
          image.data[sourceIndex + 2],
          image.data[sourceIndex + 3],
        ];
        alpha[gy * width + gx] = alphaValue(options.alpha, rgba, x + gx, y + gy, character);
      }
    }
    const advance =
      typeof options.advance === "function"
        ? options.advance(character, bounds)
        : (options.advance ?? width);
    if (!Number.isSafeInteger(advance) || advance < 0) {
      throw new RangeError(`Glyph ${key} advance must be a non-negative integer`);
    }
    result[character] = { width, height, advance, alpha };
    tallest = Math.max(tallest, height);
  }
  const height = options.height ?? tallest;
  const lineHeight = options.lineHeight ?? height;
  return { height, lineHeight, glyphs: result };
}
