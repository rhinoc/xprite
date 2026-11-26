import { UINT8_MAX, type PixelBuffer } from "$/base";
import { mulUn8 } from "$/canvas";

const RGBA_CHANNELS = 4;

const EXTRA_PSD_BLEND_MODES = new Set([
  "dissolve",
  "linear burn",
  "darker color",
  "lighter color",
  "vivid light",
  "linear light",
  "pin light",
  "hard mix",
]);

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= UINT8_MAX) return UINT8_MAX;
  return Math.round(value);
}

/** Deterministic spatial hash in [0, 1) for Photoshop Dissolve blend mode. */
function dissolveHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function blendChannel(b: number, s: number, mode: string): number {
  switch (mode) {
    case "linear burn":
      return clamp01(b + s - 1);
    case "vivid light":
      if (s <= 0.5) {
        return s <= 1e-6 ? 0 : clamp01(1 - (1 - b) / (2 * s));
      }
      return s >= 1 - 1e-6 ? 1 : clamp01(b / (2 * (1 - s)));
    case "linear light":
      return clamp01(b + 2 * s - 1);
    case "pin light":
      if (s < 0.5) return Math.min(b, 2 * s);
      return Math.max(b, 2 * s - 1);
    case "hard mix":
      return b + s >= 1 ? 1 : 0;
    default:
      return s;
  }
}

function blendRgb(
  br: number,
  bg: number,
  bb: number,
  sr: number,
  sg: number,
  sb: number,
  mode: string,
): [number, number, number] {
  if (mode === "darker color") {
    const bLum = 0.299 * br + 0.587 * bg + 0.114 * bb;
    const sLum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
    return sLum < bLum ? [sr, sg, sb] : [br, bg, bb];
  }
  if (mode === "lighter color") {
    const bLum = 0.299 * br + 0.587 * bg + 0.114 * bb;
    const sLum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
    return sLum > bLum ? [sr, sg, sb] : [br, bg, bb];
  }
  return [blendChannel(br, sr, mode), blendChannel(bg, sg, mode), blendChannel(bb, sb, mode)];
}

export function isUnsupportedXpriteBlendMode(blendMode: string | undefined): boolean {
  if (!blendMode) return false;
  return EXTRA_PSD_BLEND_MODES.has(blendMode.toLowerCase());
}

/** Blends a single RGBA source pixel onto `dst` at byte index `dstAt` using one of the 8 extra PS modes. */
export function blendExtraPsdAt(
  dst: Uint8ClampedArray,
  dstAt: number,
  srcR: number,
  srcG: number,
  srcB: number,
  srcA: number,
  opacity: number,
  blendMode: string,
  docX = 0,
  docY = 0,
): void {
  const saByte = mulUn8(srcA, opacity);
  if (saByte === 0) return;
  const mode = blendMode.toLowerCase();

  if (mode === "dissolve") {
    if (dissolveHash(docX, docY) * UINT8_MAX < saByte) {
      dst[dstAt] = srcR;
      dst[dstAt + 1] = srcG;
      dst[dstAt + 2] = srcB;
      dst[dstAt + 3] = UINT8_MAX;
    }
    return;
  }

  const baByte = dst[dstAt + 3];
  if (baByte === 0) {
    dst[dstAt] = srcR;
    dst[dstAt + 1] = srcG;
    dst[dstAt + 2] = srcB;
    dst[dstAt + 3] = saByte;
    return;
  }

  const sa = saByte / UINT8_MAX;
  const ba = baByte / UINT8_MAX;
  const outA = sa + ba * (1 - sa);
  if (outA <= 0) return;

  const br = dst[dstAt] / UINT8_MAX;
  const bg = dst[dstAt + 1] / UINT8_MAX;
  const bb = dst[dstAt + 2] / UINT8_MAX;
  const sr = srcR / UINT8_MAX;
  const sg = srcG / UINT8_MAX;
  const sb = srcB / UINT8_MAX;
  const [rr, rg, rb] = blendRgb(br, bg, bb, sr, sg, sb, mode);

  const cr = (1 - ba) * sr + ba * rr;
  const cg = (1 - ba) * sg + ba * rg;
  const cb = (1 - ba) * sb + ba * rb;
  dst[dstAt] = clampByte(((sa * cr + ba * (1 - sa) * br) / outA) * UINT8_MAX);
  dst[dstAt + 1] = clampByte(((sa * cg + ba * (1 - sa) * bg) / outA) * UINT8_MAX);
  dst[dstAt + 2] = clampByte(((sa * cb + ba * (1 - sa) * bb) / outA) * UINT8_MAX);
  dst[dstAt + 3] = clampByte(outA * UINT8_MAX);
}

/**
 * Evaluates a Photoshop-only blend mode (one of the 8 modes absent from Xprite's 19-mode engine)
 * over the composited backdrop and returns a Normal-mode pixel buffer for the layer's bounds.
 */
export function bakeExtraPsdBlendMode(
  backdrop: PixelBuffer,
  top: PixelBuffer,
  topX: number,
  topY: number,
  opacity: number,
  blendMode: string,
  backdropX = 0,
  backdropY = 0,
): PixelBuffer {
  const mode = blendMode.toLowerCase();
  const out = new Uint8ClampedArray(top.width * top.height * RGBA_CHANNELS);
  const src = top.data;
  const bg = backdrop.data;
  const bgW = backdrop.width;
  const bgH = backdrop.height;

  for (let y = 0; y < top.height; y++) {
    const docY = topY + y;
    const by = docY - backdropY;
    for (let x = 0; x < top.width; x++) {
      const docX = topX + x;
      const bx = docX - backdropX;
      const at = (y * top.width + x) * RGBA_CHANNELS;
      const saByte = mulUn8(src[at + 3], opacity);
      if (saByte === 0) continue;

      if (mode === "dissolve") {
        if (dissolveHash(docX, docY) * UINT8_MAX < saByte) {
          out[at] = src[at];
          out[at + 1] = src[at + 1];
          out[at + 2] = src[at + 2];
          out[at + 3] = UINT8_MAX;
        }
        continue;
      }

      const inBounds = bx >= 0 && bx < bgW && by >= 0 && by < bgH;
      const bgAt = inBounds ? (by * bgW + bx) * RGBA_CHANNELS : -1;
      const baByte = bgAt >= 0 ? bg[bgAt + 3] : 0;

      if (baByte === 0) {
        out[at] = src[at];
        out[at + 1] = src[at + 1];
        out[at + 2] = src[at + 2];
        out[at + 3] = saByte;
        continue;
      }

      const sr = src[at] / UINT8_MAX;
      const sg = src[at + 1] / UINT8_MAX;
      const sb = src[at + 2] / UINT8_MAX;
      const br = bg[bgAt] / UINT8_MAX;
      const bgc = bg[bgAt + 1] / UINT8_MAX;
      const bb = bg[bgAt + 2] / UINT8_MAX;
      const [rr, rg, rb] = blendRgb(br, bgc, bb, sr, sg, sb, mode);

      // Porter-Duff blending color over backdrop so rendering this layer in Normal mode matches PS.
      const ba = baByte / UINT8_MAX;
      const cr = (1 - ba) * sr + ba * rr;
      const cg = (1 - ba) * sg + ba * rg;
      const cb = (1 - ba) * sb + ba * rb;
      out[at] = clampByte(cr * UINT8_MAX);
      out[at + 1] = clampByte(cg * UINT8_MAX);
      out[at + 2] = clampByte(cb * UINT8_MAX);
      out[at + 3] = saByte;
    }
  }

  return { width: top.width, height: top.height, data: out };
}
