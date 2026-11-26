import { UINT8_MAX, type PixelBuffer, type Rgba } from "$/base";
import { blendAt, mulUn8 } from "$/canvas";
import { blendExtraPsdAt, isUnsupportedXpriteBlendMode } from "$/import-export/psd/blend";
import { rasterizeGradientFill, rasterizePatternFill } from "$/import-export/psd/fills";
import type { PsdEffects, PsdPattern } from "$/import-export/psd/model";

const RGBA_CHANNELS = 4;
const DEG_TO_RAD = Math.PI / 180;
const MAX_EFFECT_PADDING = 128;

export interface EffectRaster {
  readonly x: number;
  readonly y: number;
  readonly pixels: PixelBuffer;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= UINT8_MAX) return UINT8_MAX;
  return Math.round(value);
}

/** 3-pass separable box blur approximating Photoshop's Gaussian kernel (sigma ≈ 0.35 * size). */
function blurAlphaPlane(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const r = Math.min(MAX_EFFECT_PADDING, Math.max(0, Math.round(radius * 0.35)));
  if (r <= 0) return src.slice();

  let current = new Uint8Array(src);
  let temp = new Uint8Array(src.length);
  const windowSize = r * 2 + 1;

  for (let pass = 0; pass < 3; pass++) {
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let dx = -r; dx <= r; dx++) {
        const sx = Math.max(0, Math.min(width - 1, dx));
        sum += current[row + sx];
      }
      for (let x = 0; x < width; x++) {
        temp[row + x] = Math.round(sum / windowSize);
        const removeX = Math.max(0, Math.min(width - 1, x - r));
        const addX = Math.max(0, Math.min(width - 1, x + r + 1));
        sum += current[row + addX] - current[row + removeX];
      }
    }
    // Vertical pass
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = -r; dy <= r; dy++) {
        const sy = Math.max(0, Math.min(height - 1, dy));
        sum += temp[sy * width + x];
      }
      for (let y = 0; y < height; y++) {
        current[y * width + x] = Math.round(sum / windowSize);
        const removeY = Math.max(0, Math.min(height - 1, y - r));
        const addY = Math.max(0, Math.min(height - 1, y + r + 1));
        sum += temp[addY * width + x] - temp[removeY * width + x];
      }
    }
  }
  return current;
}

const EDT_INF = 1e12;

/** 1D Felzenszwalb-Huttenlocher squared Euclidean distance transform in O(n). */
function edt1d(
  input: Float32Array,
  output: Float32Array,
  v: Int32Array,
  z: Float32Array,
  length: number,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -EDT_INF;
  z[1] = EDT_INF;

  for (let q = 1; q < length; q++) {
    const fq = input[q];
    let s = (fq + q * q - (input[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (fq + q * q - (input[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = EDT_INF;
  }

  k = 0;
  for (let q = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const dx = q - v[k];
    output[q] = dx * dx + input[v[k]];
  }
}

/** O(W*H) exact circular dilation/erosion of an alpha plane via 2D Euclidean distance transform. */
function morphAlphaPlane(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
  dilate: boolean,
): Uint8Array {
  const r = Math.min(MAX_EFFECT_PADDING, Math.max(0, radius));
  if (r <= 0) return src.slice();

  // For tiny radii (<= 2), direct 2D max/min preserves exact fractional alpha cleanly.
  if (r <= 2) {
    const ri = Math.ceil(r);
    const offsets: number[] = [];
    const rSq = r * r;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy <= rSq + 0.25) offsets.push(dx, dy);
      }
    }
    const out = new Uint8Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let best = dilate ? 0 : UINT8_MAX;
        for (let i = 0; i < offsets.length; i += 2) {
          const nx = x + offsets[i];
          const ny = y + offsets[i + 1];
          const value = nx >= 0 && nx < width && ny >= 0 && ny < height ? src[ny * width + nx] : 0;
          if (dilate ? value > best : value < best) best = value;
        }
        out[y * width + x] = best;
      }
    }
    return out;
  }

  // Exact O(W*H) 2D EDT for larger radii (avoids O(W*H*R^2) blowup on large shadows/strokes).
  const grid = new Float32Array(width * height);
  for (let i = 0; i < src.length; i++) {
    const inside = dilate ? src[i] >= 128 : src[i] < 128;
    grid[i] = inside ? 0 : EDT_INF;
  }

  const maxDim = Math.max(width, height);
  const f = new Float32Array(maxDim);
  const d = new Float32Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    edt1d(f, d, v, z, height);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = grid[row + x];
    edt1d(f, d, v, z, width);
    for (let x = 0; x < width; x++) grid[row + x] = d[x];
  }

  const out = new Uint8Array(src.length);
  const inner = Math.max(0, r - 0.5);
  const outer = r + 0.5;
  const innerSq = inner * inner;
  const outerSq = outer * outer;
  for (let i = 0; i < src.length; i++) {
    const distSq = grid[i];
    if (dilate) {
      if (distSq <= innerSq) out[i] = UINT8_MAX;
      else if (distSq >= outerSq) out[i] = 0;
      else out[i] = clampByte((outer - Math.sqrt(distSq)) * UINT8_MAX);
      if (src[i] > out[i]) out[i] = src[i];
    } else {
      if (distSq <= innerSq) out[i] = 0;
      else if (distSq >= outerSq) out[i] = UINT8_MAX;
      else out[i] = clampByte((Math.sqrt(distSq) - inner) * UINT8_MAX);
      if (src[i] < out[i]) out[i] = src[i];
    }
  }
  return out;
}

function extractAlphaPlane(
  pixels: PixelBuffer,
  padLeft: number,
  padTop: number,
  outWidth: number,
  outHeight: number,
): Uint8Array {
  const alpha = new Uint8Array(outWidth * outHeight);
  const src = pixels.data;
  for (let y = 0; y < pixels.height; y++) {
    const dstRow = (y + padTop) * outWidth + padLeft;
    const srcRow = y * pixels.width;
    for (let x = 0; x < pixels.width; x++) {
      alpha[dstRow + x] = src[(srcRow + x) * RGBA_CHANNELS + 3];
    }
  }
  return alpha;
}

function compositeMaskedColor(
  dst: Uint8ClampedArray,
  mask: Uint8Array,
  color: Rgba,
  opacity: number,
  blendModeName: string,
  mapBlendMode: (name: string) => number,
  clipMask?: Uint8Array,
  invertClip = false,
  width = 1,
): void {
  const isExtra = isUnsupportedXpriteBlendMode(blendModeName);
  const blendMode = isExtra ? 0 : mapBlendMode(blendModeName);
  const cR = color[0];
  const cG = color[1];
  const cB = color[2];
  const pixel = new Uint8ClampedArray([cR, cG, cB, 0]);
  for (let i = 0; i < mask.length; i++) {
    let a = mask[i];
    if (a === 0) continue;
    if (clipMask) {
      const clip = invertClip ? UINT8_MAX - clipMask[i] : clipMask[i];
      if (clip === 0) continue;
      if (clip !== UINT8_MAX) a = mulUn8(a, clip);
      if (a === 0) continue;
    }
    const at = i * RGBA_CHANNELS;
    if (dst[at + 3] === 0 && !isExtra) {
      const fa = opacity === UINT8_MAX ? a : mulUn8(a, opacity);
      if (fa === 0) continue;
      dst[at] = cR;
      dst[at + 1] = cG;
      dst[at + 2] = cB;
      dst[at + 3] = fa;
      continue;
    }
    if (isExtra) {
      blendExtraPsdAt(
        dst,
        at,
        cR,
        cG,
        cB,
        a,
        opacity,
        blendModeName,
        i % width,
        Math.floor(i / width),
      );
    } else {
      pixel[3] = a;
      blendAt(dst, at, pixel, 0, opacity, blendMode);
    }
  }
}

function compositeMaskedBuffer(
  dst: Uint8ClampedArray,
  overlay: PixelBuffer,
  mask: Uint8Array,
  opacity: number,
  blendModeName: string,
  mapBlendMode: (name: string) => number,
): void {
  const isExtra = isUnsupportedXpriteBlendMode(blendModeName);
  const blendMode = isExtra ? 0 : mapBlendMode(blendModeName);
  const src = overlay.data;
  const pixel = new Uint8ClampedArray(4);
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i];
    if (m === 0) continue;
    const at = i * RGBA_CHANNELS;
    const sa = mulUn8(src[at + 3], m);
    if (sa === 0) continue;
    if (isExtra) {
      blendExtraPsdAt(
        dst,
        at,
        src[at],
        src[at + 1],
        src[at + 2],
        sa,
        opacity,
        blendModeName,
        i % overlay.width,
        Math.floor(i / overlay.width),
      );
    } else {
      pixel[0] = src[at];
      pixel[1] = src[at + 1];
      pixel[2] = src[at + 2];
      pixel[3] = sa;
      blendAt(dst, at, pixel, 0, opacity, blendMode);
    }
  }
}

export type LayerEffectPass = "all" | "behind" | "foreground";

export function hasBehindEffects(effects: PsdEffects | undefined): boolean {
  if (!effects || effects.disabled) return false;
  return Boolean(
    effects.dropShadows?.some((e) => e.enabled) ||
    effects.outerGlow?.enabled ||
    (effects.bevel?.enabled &&
      (effects.bevel.style === "outer bevel" ||
        effects.bevel.style === "emboss" ||
        effects.bevel.style === "pillow emboss")) ||
    effects.strokes?.some((e) => e.enabled && e.position === "outside"),
  );
}

export function hasForegroundEffects(effects: PsdEffects | undefined): boolean {
  if (!effects || effects.disabled) return false;
  return Boolean(
    effects.innerShadows?.some((e) => e.enabled) ||
    effects.innerGlow?.enabled ||
    effects.satin?.enabled ||
    (effects.bevel?.enabled && effects.bevel.style !== "outer bevel") ||
    effects.solidFills?.some((e) => e.enabled) ||
    effects.gradientOverlays?.some((e) => e.enabled) ||
    effects.patternOverlays?.some((e) => e.enabled) ||
    effects.strokes?.some((e) => e.enabled && e.position !== "outside"),
  );
}

export function hasEnabledEffects(effects: PsdEffects | undefined): boolean {
  return hasBehindEffects(effects) || hasForegroundEffects(effects);
}

/**
 * Bakes enabled Photoshop layer effects (Drop Shadow, Outer/Inner Glow, Inner Shadow,
 * Color/Gradient/Pattern Overlay, Outside/Inside/Center Stroke) onto a raster layer.
 */
export function applyLayerEffects(
  raster: EffectRaster,
  effects: PsdEffects | undefined,
  fillOpacity: number,
  patterns: ReadonlyMap<string, PsdPattern>,
  mapBlendMode: (name: string) => number,
  pass: LayerEffectPass = "all",
  blendInteriorAsGroup = false,
): EffectRaster {
  if (!hasEnabledEffects(effects) || !effects) return raster;
  const renderBehind = pass === "all" || pass === "behind";
  const renderForeground = pass === "all" || pass === "foreground";
  const includeInterior = pass === "all";

  let padLeft = 0;
  let padRight = 0;
  let padTop = 0;
  let padBottom = 0;

  if (renderBehind) {
    for (const shadow of effects.dropShadows ?? []) {
      if (!shadow.enabled) continue;
      const rad = shadow.angle * DEG_TO_RAD;
      const dx = Math.round(-Math.cos(rad) * shadow.distance);
      const dy = Math.round(Math.sin(rad) * shadow.distance);
      const blur = Math.ceil(shadow.size);
      padLeft = Math.max(padLeft, blur + Math.max(0, -dx));
      padRight = Math.max(padRight, blur + Math.max(0, dx));
      padTop = Math.max(padTop, blur + Math.max(0, -dy));
      padBottom = Math.max(padBottom, blur + Math.max(0, dy));
    }
    if (effects.outerGlow?.enabled) {
      const pad = Math.ceil(effects.outerGlow.size);
      padLeft = Math.max(padLeft, pad);
      padRight = Math.max(padRight, pad);
      padTop = Math.max(padTop, pad);
      padBottom = Math.max(padBottom, pad);
    }
    if (
      effects.bevel?.enabled &&
      (effects.bevel.style === "outer bevel" ||
        effects.bevel.style === "emboss" ||
        effects.bevel.style === "pillow emboss")
    ) {
      const pad = Math.ceil(effects.bevel.size + effects.bevel.soften);
      padLeft = Math.max(padLeft, pad);
      padRight = Math.max(padRight, pad);
      padTop = Math.max(padTop, pad);
      padBottom = Math.max(padBottom, pad);
    }
  }
  for (const stroke of effects.strokes ?? []) {
    if (!stroke.enabled || stroke.position === "inside") continue;
    if (stroke.position === "outside" && !renderBehind) continue;
    if (stroke.position === "center" && !renderForeground) continue;
    const pad = Math.ceil(stroke.position === "outside" ? stroke.size : stroke.size * 0.5);
    padLeft = Math.max(padLeft, pad);
    padRight = Math.max(padRight, pad);
    padTop = Math.max(padTop, pad);
    padBottom = Math.max(padBottom, pad);
  }

  padLeft = Math.min(MAX_EFFECT_PADDING, padLeft);
  padRight = Math.min(MAX_EFFECT_PADDING, padRight);
  padTop = Math.min(MAX_EFFECT_PADDING, padTop);
  padBottom = Math.min(MAX_EFFECT_PADDING, padBottom);

  const outWidth = raster.pixels.width + padLeft + padRight;
  const outHeight = raster.pixels.height + padTop + padBottom;
  const outX = raster.x - padLeft;
  const outY = raster.y - padTop;
  const outData = new Uint8ClampedArray(outWidth * outHeight * RGBA_CHANNELS);
  const baseAlpha = extractAlphaPlane(raster.pixels, padLeft, padTop, outWidth, outHeight);

  // 1. Behind-layer effects: Drop Shadows (back-to-front)
  if (renderBehind) {
    for (const shadow of [...(effects.dropShadows ?? [])].reverse()) {
      if (!shadow.enabled) continue;
      const rad = shadow.angle * DEG_TO_RAD;
      const dx = Math.round(-Math.cos(rad) * shadow.distance);
      const dy = Math.round(Math.sin(rad) * shadow.distance);
      const shifted = new Uint8Array(outWidth * outHeight);
      for (let y = 0; y < outHeight; y++) {
        const sy = y - dy;
        if (sy < 0 || sy >= outHeight) continue;
        for (let x = 0; x < outWidth; x++) {
          const sx = x - dx;
          if (sx < 0 || sx >= outWidth) continue;
          shifted[y * outWidth + x] = baseAlpha[sy * outWidth + sx];
        }
      }
      const chokeRadius = (shadow.size * Math.max(0, Math.min(100, shadow.choke))) / 100;
      const spread =
        chokeRadius > 0
          ? morphAlphaPlane(shifted, outWidth, outHeight, chokeRadius, true)
          : shifted;
      const blurRadius = Math.max(0, shadow.size - chokeRadius);
      const blurred =
        blurRadius > 0 ? blurAlphaPlane(spread, outWidth, outHeight, blurRadius) : spread;
      compositeMaskedColor(
        outData,
        blurred,
        shadow.color,
        clampByte(shadow.opacity),
        shadow.blendMode,
        mapBlendMode,
        shadow.layerConceals ? baseAlpha : undefined,
        true,
        outWidth,
      );
    }

    // 2. Outer Glow
    if (effects.outerGlow?.enabled) {
      const glow = effects.outerGlow;
      const chokeRadius = (glow.size * Math.max(0, Math.min(100, glow.choke))) / 100;
      const spread =
        chokeRadius > 0
          ? morphAlphaPlane(baseAlpha, outWidth, outHeight, chokeRadius, true)
          : baseAlpha;
      const blurred = blurAlphaPlane(
        spread,
        outWidth,
        outHeight,
        Math.max(0, glow.size - chokeRadius),
      );
      compositeMaskedColor(
        outData,
        blurred,
        glow.color,
        clampByte(glow.opacity),
        glow.blendMode,
        mapBlendMode,
        baseAlpha,
        true,
        outWidth,
      );
    }
  }

  // 3. Outside Strokes
  const renderStroke = (stroke: NonNullable<PsdEffects["strokes"]>[number]) => {
    if (!stroke.enabled || stroke.size <= 0) return;
    let strokeMask: Uint8Array;
    if (stroke.position === "outside") {
      const dilated = morphAlphaPlane(baseAlpha, outWidth, outHeight, stroke.size, true);
      strokeMask = new Uint8Array(baseAlpha.length);
      for (let i = 0; i < baseAlpha.length; i++) {
        strokeMask[i] = Math.max(0, dilated[i] - baseAlpha[i]);
      }
    } else if (stroke.position === "inside") {
      const eroded = morphAlphaPlane(baseAlpha, outWidth, outHeight, stroke.size, false);
      strokeMask = new Uint8Array(baseAlpha.length);
      for (let i = 0; i < baseAlpha.length; i++) {
        strokeMask[i] = Math.max(0, baseAlpha[i] - eroded[i]);
      }
    } else {
      const half = stroke.size * 0.5;
      const dilated = morphAlphaPlane(baseAlpha, outWidth, outHeight, half, true);
      const eroded = morphAlphaPlane(baseAlpha, outWidth, outHeight, half, false);
      strokeMask = new Uint8Array(baseAlpha.length);
      for (let i = 0; i < baseAlpha.length; i++) {
        strokeMask[i] = Math.max(0, dilated[i] - eroded[i]);
      }
    }

    const op = clampByte(stroke.opacity);
    if (stroke.gradient) {
      const fill = rasterizeGradientFill(stroke.gradient, outWidth, outHeight);
      compositeMaskedBuffer(outData, fill, strokeMask, op, stroke.blendMode, mapBlendMode);
    } else if (stroke.pattern) {
      const fill = rasterizePatternFill(stroke.pattern, patterns, outWidth, outHeight, outX, outY);
      if (fill)
        compositeMaskedBuffer(outData, fill, strokeMask, op, stroke.blendMode, mapBlendMode);
    } else if (stroke.color) {
      compositeMaskedColor(
        outData,
        strokeMask,
        stroke.color,
        op,
        stroke.blendMode,
        mapBlendMode,
        undefined,
        false,
        outWidth,
      );
    }
  };

  // Helper for Bevel & Emboss (height-field directional shading; runs outer pass behind and inner pass on interior)
  const renderBevel = (target: Uint8ClampedArray, outerPass: boolean) => {
    const bevel = effects.bevel;
    if (!bevel?.enabled || bevel.size <= 0) return;
    const wantsOuter =
      bevel.style === "outer bevel" || bevel.style === "emboss" || bevel.style === "pillow emboss";
    const wantsInner = bevel.style !== "outer bevel";
    if (outerPass && !wantsOuter) return;
    if (!outerPass && !wantsInner) return;

    const heightField = blurAlphaPlane(
      baseAlpha,
      outWidth,
      outHeight,
      Math.max(1, bevel.size + bevel.soften),
    );
    const azRad = bevel.angle * DEG_TO_RAD;
    const altRad = Math.max(5, Math.min(89, bevel.altitude)) * DEG_TO_RAD;
    const lx = Math.cos(azRad) * Math.cos(altRad);
    const ly = -Math.sin(azRad) * Math.cos(altRad);
    const dirSign = bevel.direction === "down" ? -1 : 1;
    const passSign = outerPass && bevel.style === "pillow emboss" ? -1 : 1;
    const gain = Math.max(0.1, bevel.strength) * 2.5 * dirSign * passSign;

    const hiMask = new Uint8Array(outWidth * outHeight);
    const shMask = new Uint8Array(outWidth * outHeight);
    for (let y = 1; y < outHeight - 1; y++) {
      const row = y * outWidth;
      for (let x = 1; x < outWidth - 1; x++) {
        const i = row + x;
        const maskA = outerPass ? UINT8_MAX - baseAlpha[i] : baseAlpha[i];
        if (maskA === 0) continue;
        const gx =
          heightField[i - outWidth + 1] +
          2 * heightField[i + 1] +
          heightField[i + outWidth + 1] -
          (heightField[i - outWidth - 1] + 2 * heightField[i - 1] + heightField[i + outWidth - 1]);
        const gy =
          heightField[i + outWidth - 1] +
          2 * heightField[i + outWidth] +
          heightField[i + outWidth + 1] -
          (heightField[i - outWidth - 1] +
            2 * heightField[i - outWidth] +
            heightField[i - outWidth + 1]);
        if (gx === 0 && gy === 0) continue;
        const nx = (gx / (4 * UINT8_MAX)) * gain;
        const ny = (gy / (4 * UINT8_MAX)) * gain;
        const invLen = 1 / Math.hypot(nx, ny, 1);
        const dot = (nx * lx + ny * ly) * invLen;
        if (dot > 0) {
          hiMask[i] = mulUn8(clampByte(dot * UINT8_MAX), maskA);
        } else if (dot < 0) {
          shMask[i] = mulUn8(clampByte(-dot * UINT8_MAX), maskA);
        }
      }
    }
    compositeMaskedColor(
      target,
      hiMask,
      bevel.highlightColor,
      clampByte(bevel.highlightOpacity),
      bevel.highlightBlendMode,
      mapBlendMode,
      undefined,
      false,
      outWidth,
    );
    compositeMaskedColor(
      target,
      shMask,
      bevel.shadowColor,
      clampByte(bevel.shadowOpacity),
      bevel.shadowBlendMode,
      mapBlendMode,
      undefined,
      false,
      outWidth,
    );
  };

  if (renderBehind) {
    renderBevel(outData, true);
    for (const stroke of effects.strokes ?? []) {
      if (stroke.position === "outside") renderStroke(stroke);
    }
  }

  if (!renderForeground) {
    return {
      x: outX,
      y: outY,
      pixels: { width: outWidth, height: outHeight, data: outData },
    };
  }

  // 4. Layer interior pixels (scaled by fillOpacity immediately unless blendInteriorAsGroup is true)
  const interior = new Uint8ClampedArray(outWidth * outHeight * RGBA_CHANNELS);
  const src = raster.pixels.data;
  const fOp = includeInterior ? clampByte(fillOpacity) : 0;
  const initialInteriorOp = includeInterior ? (blendInteriorAsGroup ? UINT8_MAX : fOp) : 0;
  if (initialInteriorOp > 0) {
    for (let y = 0; y < raster.pixels.height; y++) {
      for (let x = 0; x < raster.pixels.width; x++) {
        const sAt = (y * raster.pixels.width + x) * RGBA_CHANNELS;
        const sa = mulUn8(src[sAt + 3], initialInteriorOp);
        if (sa === 0) continue;
        const dAt = ((y + padTop) * outWidth + (x + padLeft)) * RGBA_CHANNELS;
        interior[dAt] = src[sAt];
        interior[dAt + 1] = src[sAt + 1];
        interior[dAt + 2] = src[sAt + 2];
        interior[dAt + 3] = sa;
      }
    }
  }

  // 5. Interior overlays clipped to layer silhouette (Pattern -> Gradient -> Color Overlay)
  for (const overlay of [...(effects.patternOverlays ?? [])].reverse()) {
    if (!overlay.enabled) continue;
    const alignToLayer = overlay.pattern.align !== false;
    const patOriginX = alignToLayer ? -padLeft : outX;
    const patOriginY = alignToLayer ? -padTop : outY;
    const fill = rasterizePatternFill(
      overlay.pattern,
      patterns,
      outWidth,
      outHeight,
      patOriginX,
      patOriginY,
    );
    if (fill) {
      compositeMaskedBuffer(
        interior,
        fill,
        baseAlpha,
        clampByte(overlay.opacity),
        overlay.blendMode,
        mapBlendMode,
      );
    }
  }
  for (const overlay of [...(effects.gradientOverlays ?? [])].reverse()) {
    if (!overlay.enabled) continue;
    // Align gradient to original layer bounds inside padded buffer.
    const grad = rasterizeGradientFill(overlay.gradient, raster.pixels.width, raster.pixels.height);
    const paddedGrad = new Uint8ClampedArray(outWidth * outHeight * RGBA_CHANNELS);
    for (let y = 0; y < raster.pixels.height; y++) {
      const dstStart = ((y + padTop) * outWidth + padLeft) * RGBA_CHANNELS;
      const srcStart = y * raster.pixels.width * RGBA_CHANNELS;
      paddedGrad.set(
        grad.data.subarray(srcStart, srcStart + raster.pixels.width * RGBA_CHANNELS),
        dstStart,
      );
    }
    compositeMaskedBuffer(
      interior,
      { width: outWidth, height: outHeight, data: paddedGrad },
      baseAlpha,
      clampByte(overlay.opacity),
      overlay.blendMode,
      mapBlendMode,
    );
  }
  for (const overlay of [...(effects.solidFills ?? [])].reverse()) {
    if (!overlay.enabled) continue;
    compositeMaskedColor(
      interior,
      baseAlpha,
      overlay.color,
      clampByte(overlay.opacity),
      overlay.blendMode,
      mapBlendMode,
      undefined,
      false,
      outWidth,
    );
  }

  // 6. Inner Glow & Inner Shadows
  if (effects.innerGlow?.enabled) {
    const glow = effects.innerGlow;
    const inverted = new Uint8Array(baseAlpha.length);
    for (let i = 0; i < baseAlpha.length; i++) inverted[i] = UINT8_MAX - baseAlpha[i];
    const blurred = blurAlphaPlane(inverted, outWidth, outHeight, glow.size);
    const glowMask = new Uint8Array(baseAlpha.length);
    for (let i = 0; i < baseAlpha.length; i++) {
      glowMask[i] = glow.innerSource === "center" ? UINT8_MAX - blurred[i] : blurred[i];
    }
    compositeMaskedColor(
      interior,
      glowMask,
      glow.color,
      clampByte(glow.opacity),
      glow.blendMode,
      mapBlendMode,
      baseAlpha,
      false,
      outWidth,
    );
  }
  for (const shadow of [...(effects.innerShadows ?? [])].reverse()) {
    if (!shadow.enabled) continue;
    const rad = shadow.angle * DEG_TO_RAD;
    const dx = Math.round(-Math.cos(rad) * shadow.distance);
    const dy = Math.round(Math.sin(rad) * shadow.distance);
    const invShifted = new Uint8Array(outWidth * outHeight);
    invShifted.fill(UINT8_MAX);
    for (let y = 0; y < outHeight; y++) {
      const sy = y - dy;
      if (sy < 0 || sy >= outHeight) continue;
      for (let x = 0; x < outWidth; x++) {
        const sx = x - dx;
        if (sx < 0 || sx >= outWidth) continue;
        invShifted[y * outWidth + x] = UINT8_MAX - baseAlpha[sy * outWidth + sx];
      }
    }
    const blurred = blurAlphaPlane(invShifted, outWidth, outHeight, shadow.size);
    compositeMaskedColor(
      interior,
      blurred,
      shadow.color,
      clampByte(shadow.opacity),
      shadow.blendMode,
      mapBlendMode,
      baseAlpha,
      false,
      outWidth,
    );
  }

  // 6b. Satin (dual opposite-shifted blurred silhouettes)
  if (effects.satin?.enabled) {
    const satin = effects.satin;
    const rad = satin.angle * DEG_TO_RAD;
    const dx = Math.round(Math.cos(rad) * satin.distance);
    const dy = Math.round(-Math.sin(rad) * satin.distance);
    const blurred =
      satin.size > 0 ? blurAlphaPlane(baseAlpha, outWidth, outHeight, satin.size) : baseAlpha;
    const satinMask = new Uint8Array(outWidth * outHeight);
    for (let y = 0; y < outHeight; y++) {
      const y1 = y - dy;
      const y2 = y + dy;
      for (let x = 0; x < outWidth; x++) {
        const i = y * outWidth + x;
        if (baseAlpha[i] === 0) continue;
        const x1 = x - dx;
        const x2 = x + dx;
        const a1 =
          x1 >= 0 && x1 < outWidth && y1 >= 0 && y1 < outHeight ? blurred[y1 * outWidth + x1] : 0;
        const a2 =
          x2 >= 0 && x2 < outWidth && y2 >= 0 && y2 < outHeight ? blurred[y2 * outWidth + x2] : 0;
        const diff = Math.abs(a1 - a2);
        satinMask[i] = satin.invert ? UINT8_MAX - diff : diff;
      }
    }
    compositeMaskedColor(
      interior,
      satinMask,
      satin.color,
      clampByte(satin.opacity),
      satin.blendMode,
      mapBlendMode,
      baseAlpha,
      false,
      outWidth,
    );
  }

  // 6c. Inner Bevel & Emboss
  renderBevel(interior, false);

  // Blend interior onto behind-effects buffer (apply fillOpacity as group if blendInteriorAsGroup is true)
  const interiorBlendOpacity = includeInterior && blendInteriorAsGroup ? fOp : UINT8_MAX;
  for (let i = 0; i < outData.length; i += RGBA_CHANNELS) {
    const ia = interior[i + 3];
    if (ia === 0) continue;
    if (outData[i + 3] === 0) {
      const fa = interiorBlendOpacity === UINT8_MAX ? ia : mulUn8(ia, interiorBlendOpacity);
      if (fa === 0) continue;
      outData[i] = interior[i];
      outData[i + 1] = interior[i + 1];
      outData[i + 2] = interior[i + 2];
      outData[i + 3] = fa;
    } else {
      blendAt(outData, i, interior, i, interiorBlendOpacity, 0);
    }
  }

  // 7. Inside & Center Strokes
  for (const stroke of effects.strokes ?? []) {
    if (stroke.position === "inside" || stroke.position === "center") renderStroke(stroke);
  }

  return {
    x: outX,
    y: outY,
    pixels: { width: outWidth, height: outHeight, data: outData },
  };
}
