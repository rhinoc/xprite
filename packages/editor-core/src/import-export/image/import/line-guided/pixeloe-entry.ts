import type { PixelBuffer } from "$/base/primitives";
import { resizeArea8 } from "$/import-export/image/import/line-guided/cv-ops";
import {
  legacyPixeloe,
  legacyPixeloeSizes,
  type LineGuide,
} from "$/import-export/image/import/line-guided/pixeloe-legacy";
import { otsuThreshold, xdogLines } from "$/import-export/image/import/line-guided/xdog";
import { resizeBox } from "$/import-export/image/import/resize";
import { LineGuideMode, type PixelationSize } from "$/import-export/image/import/types";

/**
 * The line drawing is made at no more than this long side (or the working size, if larger): the
 * XDoG parameters were tuned on sources of this size, where its 0.8 px blur finds drawn outlines
 * rather than texture.
 */
const LINE_SOURCE_MAX = 512;
const OPAQUE = 255;
const ALPHA_CUTOFF = 128;
const PAPER = 255;
/** Recent results, so changing only colour settings does not rerun PixelOE. */
const MEMO_SIZE = 4;
/** Larger results (full-size pre-passes of big photos, 8 MB and up) are not kept. */
const MAX_REMEMBERED_PIXELS = 2_097_152;
const memo: { key: string; result: PixelBuffer }[] = [];
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MIX_PRIME = 0x9e3779b1;
/** Two independent 32-bit hashes of the pixels (FNV-1a and a multiplicative mix). */
function fingerprint(data: Uint8ClampedArray): string {
  const bytes = data.byteOffset % 4 ? data.slice() : data;
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
  let a = FNV_OFFSET,
    b = 0;
  for (let i = 0; i < words.length; i++) {
    a = Math.imul(a ^ words[i], FNV_PRIME);
    b = Math.imul(b + words[i], MIX_PRIME) ^ (b >>> 15);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

/** RGB composited over white (transparent pixels would otherwise read as dark outlines). */
function opaqueRgb(image: PixelBuffer): { rgb: Uint8Array; opaque: boolean } {
  const { data } = image;
  const rgb = new Uint8Array(image.width * image.height * 3);
  let opaque = true;
  for (let p = 0, i = 0; i < data.length; i += 4, p += 3) {
    const alpha = data[i + 3];
    if (alpha !== OPAQUE) opaque = false;
    for (let c = 0; c < 3; c++)
      rgb[p + c] =
        alpha === OPAQUE
          ? data[i + c]
          : Math.round((data[i + c] * alpha + PAPER * (OPAQUE - alpha)) / OPAQUE);
  }
  return { rgb, opaque };
}

function lineGuide(
  rgb: Uint8Array,
  width: number,
  height: number,
  workLongSide: number,
  mode: LineGuideMode,
): LineGuide {
  const limit = Math.max(LINE_SOURCE_MAX, workLongSide);
  const scale = Math.min(1, limit / Math.max(width, height));
  const lw = Math.max(1, Math.round(width * scale)),
    lh = Math.max(1, Math.round(height * scale));
  const source = scale < 1 ? resizeArea8(rgb, width, height, 3, lw, lh) : rgb;
  const lines = xdogLines(source, lw, lh);
  return { lines, width: lw, height: lh, threshold: otsuThreshold(lines), mode };
}

/**
 * A recent PixelOE result for `image` under `variant` (the step and its settings), else computed
 * and remembered. Callers get their own copy of the pixels.
 */
export function rememberPixeloe(
  image: PixelBuffer,
  variant: string,
  compute: () => PixelBuffer,
): PixelBuffer {
  const key = `${image.width}x${image.height}:${fingerprint(image.data)}:${variant}`;
  const known = memo.find((entry) => entry.key === key);
  if (known) return { ...known.result, data: known.result.data.slice() };
  const result = compute();
  if (result.width * result.height > MAX_REMEMBERED_PIXELS) return result;
  memo.unshift({ key, result: { ...result, data: result.data.slice() } });
  memo.length = Math.min(memo.length, MEMO_SIZE);
  return result;
}

/** Stock PixelOE pixelize (optionally line-guided) of the whole image to `size`. */
export function runPixeloe(
  image: PixelBuffer,
  grid: PixelationSize,
  guide?: LineGuideMode,
): PixelBuffer {
  return rememberPixeloe(image, `${grid.width}x${grid.height}:${guide ?? ""}`, () =>
    pixeloe(image, grid, guide),
  );
}

function pixeloe(image: PixelBuffer, grid: PixelationSize, guide?: LineGuideMode): PixelBuffer {
  const { width, height } = image;
  const { rgb, opaque } = opaqueRgb(image);
  const sizes = legacyPixeloeSizes(width, height, grid.width, grid.height);
  const result = legacyPixeloe(rgb, width, height, {
    width: grid.width,
    height: grid.height,
    guide:
      guide === undefined
        ? undefined
        : lineGuide(rgb, width, height, Math.max(...sizes.work), guide),
  });
  const data = new Uint8ClampedArray(result.width * result.height * 4);
  const alpha = opaque ? null : resizeBox(image, result.width, result.height, "straight").data;
  for (let p = 0, i = 0; p < result.rgb.length; p += 3, i += 4) {
    data[i] = result.rgb[p];
    data[i + 1] = result.rgb[p + 1];
    data[i + 2] = result.rgb[p + 2];
    // Pixel art keeps hard edges: a cell is either drawn or empty.
    data[i + 3] = alpha && alpha[i + 3] < ALPHA_CUTOFF ? 0 : OPAQUE;
  }
  return { width: result.width, height: result.height, data };
}

/**
 * The binarised XDoG line mask at the image's own size (1 = line), for the image -> image PixelOE
 * + lines pre-pass. Made like the stock guide (Otsu cut of the XDoG drawing at no more than 512 px on
 * the long side), then enlarged to the image by nearest neighbour. Null when the drawing is uniform.
 */
export function sourceLineMask(image: PixelBuffer): Float32Array | null {
  const { width, height } = image;
  const { rgb } = opaqueRgb(image);
  const {
    lines,
    width: lw,
    height: lh,
    threshold,
  } = lineGuide(rgb, width, height, 0, LineGuideMode.Union);
  if (threshold === null) return null;
  const cut = Math.fround(threshold);
  const mask = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = Math.min(lh - 1, Math.floor(((y + 0.5) * lh) / height)) * lw;
    for (let x = 0; x < width; x++) {
      const v = lines[row + Math.min(lw - 1, Math.floor(((x + 0.5) * lw) / width))];
      mask[y * width + x] = Math.fround(v / 255) < cut ? 1 : 0;
    }
  }
  return mask;
}
