/**
 * The few OpenCV / NumPy image operations the legacy PixelOE pipeline and XDoG use, reproduced with
 * the same rounding and accumulation order as OpenCV 5 (modules/imgproc resize.cpp, filter.simd.hpp,
 * smooth.dispatch.cpp, morph) and NumPy's pairwise sums. Images are row-major; `cn` interleaved
 * channels where noted.
 */
const f32 = Math.fround;
/** Single-precision fused multiply-add, as the AVX2 kernels OpenCV dispatches to. */
const fma32 = (a: number, b: number, c: number) => f32(a * b + c);
const RESIZE_COEF_SCALE = 2048;

const VELTKAMP_SPLIT = 134217729; // 2^27 + 1
const bitsView = new DataView(new ArrayBuffer(8));
/** Moves `v` one ulp towards `towards` when `v` has an even mantissa (round-to-odd step). */
function roundToOdd(v: number, towards: number): number {
  if (towards === 0) return v;
  bitsView.setFloat64(0, v);
  let high = bitsView.getUint32(0),
    low = bitsView.getUint32(4);
  if ((low & 1) === 1) return v;
  if (towards > 0 === v > 0) {
    low = (low + 1) >>> 0;
    if (low === 0) high++;
  } else {
    if (low === 0) high--;
    low = (low - 1) >>> 0;
  }
  bitsView.setUint32(0, high);
  bitsView.setUint32(4, low);
  return bitsView.getFloat64(0);
}
/**
 * Correctly rounded `a * b + c` (IEEE fused multiply-add) for finite, normal-range inputs,
 * via exact products/sums and Boldo–Melquiond round-to-odd.
 */
function fma64(a: number, b: number, c: number): number {
  const p = a * b;
  let t = VELTKAMP_SPLIT * a;
  const ah = t - (t - a),
    al = a - ah;
  t = VELTKAMP_SPLIT * b;
  const bh = t - (t - b),
    bl = b - bh;
  const pl = ah * bh - p + ah * bl + al * bh + al * bl;
  const sh = c + p;
  const sb = sh - c;
  const sl = c - (sh - sb) + (p - sb);
  const vh = sl + pl;
  const vb = vh - sl;
  const vl = sl - (vh - vb) + (pl - vb);
  return sh + (vh === 0 ? vl : roundToOdd(vh, vl));
}

/** cvRound: round half to even. */
function cvRound(v: number): number {
  const r = Math.round(v);
  return r - v === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
const saturateByte = (v: number) => {
  const r = cvRound(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
};
const saturateShort = (v: number) => Math.max(-32768, Math.min(32767, cvRound(v)));

/** COLOR_RGB2GRAY on 8-bit RGB (fixed point, 14-bit coefficients). */
/** OpenCV 5 `RGB2Gray<uchar>` 15-bit coefficients (verified over every 24-bit colour). */
const GRAY_SHIFT = 15;
const GRAY_R = 9798;
const GRAY_G = 19235;
const GRAY_B = 3735;

export function rgbToGray8(rgb: Uint8Array): Uint8Array {
  const out = new Uint8Array(rgb.length / 3);
  for (let i = 0, j = 0; j < out.length; i += 3, j++)
    out[j] =
      (rgb[i] * GRAY_R + rgb[i + 1] * GRAY_G + rgb[i + 2] * GRAY_B + (1 << (GRAY_SHIFT - 1))) >>
      GRAY_SHIFT;
  return out;
}

interface LinearTaps {
  offset: Int32Array;
  /** Coefficient of the first tap (`1 - fx` in float32, as OpenCV stores it). */
  first: Float32Array;
  /** Coefficient of the second tap (`fx`). */
  second: Float32Array;
  /** Destination indices from here on copy the clamped edge sample. */
  limit: number;
}
function linearTaps(source: number, target: number, clampFraction: boolean): LinearTaps {
  const scale = 1 / (target / source);
  const offset = new Int32Array(target);
  const first = new Float32Array(target);
  const second = new Float32Array(target);
  let limit = target;
  for (let d = 0; d < target; d++) {
    let f = f32((d + 0.5) * scale - 0.5);
    let s = Math.floor(f);
    f = f32(f - s);
    if (clampFraction && s < 0) {
      f = 0;
      s = 0;
    }
    if (s + 1 >= source) {
      limit = Math.min(limit, d);
      if (clampFraction && s >= source - 1) {
        f = 0;
        s = source - 1;
      }
    }
    offset[d] = s;
    first[d] = f32(1 - f);
    second[d] = f;
  }
  return { offset, first, second, limit };
}
const isTwice = (source: number, target: number) => {
  const scale = 1 / (target / source);
  return Math.abs(scale - 2) < Number.EPSILON;
};

/** cv::resize INTER_LINEAR for 8-bit images with `cn` interleaved channels. */
export function resizeLinear8(
  src: Uint8Array,
  sw: number,
  sh: number,
  cn: number,
  dw: number,
  dh: number,
): Uint8Array {
  if (sw === dw && sh === dh) return src.slice();
  if (isTwice(sw, dw) && isTwice(sh, dh)) return halve8(src, sw, sh, cn, dw, dh);
  const xs = linearTaps(sw, dw, true);
  const ys = linearTaps(sh, dh, false);
  const ax0 = new Int32Array(dw),
    ax1 = new Int32Array(dw);
  for (let d = 0; d < dw; d++) {
    ax0[d] = saturateShort(xs.first[d] * RESIZE_COEF_SCALE);
    ax1[d] = saturateShort(xs.second[d] * RESIZE_COEF_SCALE);
  }
  const rowCache = new Map<number, Int32Array>();
  const row = (sy: number) => {
    let r = rowCache.get(sy);
    if (r) return r;
    r = new Int32Array(dw * cn);
    const base = sy * sw * cn;
    for (let d = 0; d < dw; d++) {
      const sx = xs.offset[d] * cn;
      for (let c = 0; c < cn; c++)
        r[d * cn + c] =
          d < xs.limit
            ? src[base + sx + c] * ax0[d] + src[base + sx + cn + c] * ax1[d]
            : src[base + sx + c] * RESIZE_COEF_SCALE;
    }
    if (rowCache.size > 4) rowCache.delete(rowCache.keys().next().value as number);
    rowCache.set(sy, r);
    return r;
  };
  const out = new Uint8Array(dw * dh * cn);
  for (let d = 0; d < dh; d++) {
    const sy = ys.offset[d];
    const s0 = row(Math.min(sh - 1, Math.max(0, sy)));
    const s1 = row(Math.min(sh - 1, Math.max(0, sy + 1)));
    const b0 = saturateShort(ys.first[d] * RESIZE_COEF_SCALE);
    const b1 = saturateShort(ys.second[d] * RESIZE_COEF_SCALE);
    const o = d * dw * cn;
    for (let i = 0; i < dw * cn; i++) {
      const v = (((b0 * (s0[i] >> 4)) >> 16) + ((b1 * (s1[i] >> 4)) >> 16) + 2) >> 2;
      out[o + i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return out;
}

/** OpenCV's exact 2x INTER_LINEAR downscale, which it runs as the vectorised area average. */
function halve8(src: Uint8Array, sw: number, sh: number, cn: number, dw: number, dh: number) {
  const out = new Uint8Array(dw * dh * cn);
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++)
      for (let c = 0; c < cn; c++) {
        const a = (2 * y * sw + 2 * x) * cn + c;
        out[(y * dw + x) * cn + c] =
          (src[a] + src[a + cn] + src[a + sw * cn] + src[a + sw * cn + cn] + 2) >> 2;
      }
  return out;
}

/** cv::resize INTER_LINEAR for one-channel float64 images, as OpenCV 5's IPP HAL computes it. */
export function resizeLinear64(
  src: Float64Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float64Array {
  if (sw === dw && sh === dh) return src.slice();
  const xs = linearTaps64(sw, dw);
  const ys = linearTaps64(sh, dh);
  const rows = new Float64Array(sh * dw);
  for (let y = 0; y < sh; y++)
    for (let d = 0; d < dw; d++) {
      const p = src[y * sw + xs.offset[d]];
      const q = src[y * sw + Math.min(sw - 1, xs.offset[d] + 1)];
      rows[y * dw + d] = fma64(q - p, xs.fraction[d], p);
    }
  const out = new Float64Array(dw * dh);
  for (let d = 0; d < dh; d++) {
    const s0 = ys.offset[d] * dw;
    const s1 = Math.min(sh - 1, ys.offset[d] + 1) * dw;
    const f = ys.fraction[d];
    for (let x = 0; x < dw; x++) {
      const p = rows[s0 + x];
      out[d * dw + x] = fma64(rows[s1 + x] - p, f, p);
    }
  }
  return out;
}

/**
 * Taps of the IPP HAL's float64 linear resize, which OpenCV 5 wheels use for CV_64F:
 * double-precision fractions `fma(d + 0.5, source / target, -0.5)` and taps blended as
 * `fma(q - p, fraction, p)` (verified bit-exact against cv2 5.0 on random float64 images).
 */
function linearTaps64(source: number, target: number) {
  const scale = source / target;
  const offset = new Int32Array(target);
  const fraction = new Float64Array(target);
  for (let d = 0; d < target; d++) {
    const f = fma64(d + 0.5, scale, -0.5);
    let s = Math.floor(f);
    let frac = f - s;
    if (s < 0) {
      s = 0;
      frac = 0;
    }
    if (s >= source - 1) {
      s = source - 1;
      frac = 0;
    }
    offset[d] = s;
    fraction[d] = frac;
  }
  return { offset, fraction };
}

interface AreaTap {
  d: number;
  s: number;
  alpha: number;
}
function areaTaps(source: number, target: number, scale: number): AreaTap[] {
  const taps: AreaTap[] = [];
  for (let d = 0; d < target; d++) {
    const fs1 = d * scale;
    const fs2 = fs1 + scale;
    const cell = Math.min(scale, source - fs1);
    let s2 = Math.floor(fs2);
    let s1 = Math.ceil(fs1);
    s2 = Math.min(s2, source - 1);
    s1 = Math.min(s1, s2);
    if (s1 - fs1 > 1e-3) taps.push({ d, s: s1 - 1, alpha: f32((s1 - fs1) / cell) });
    for (let s = s1; s < s2; s++) taps.push({ d, s, alpha: f32(1 / cell) });
    if (fs2 - s2 > 1e-3)
      taps.push({ d, s: s2, alpha: f32(Math.min(Math.min(fs2 - s2, 1), cell) / cell) });
  }
  return taps;
}

/**
 * cv::resize INTER_AREA when shrinking (`round` true stores 8-bit results, false keeps float32).
 * Integer factors take OpenCV's fast path; other factors its weighted-area tables.
 */
function resizeAreaDown(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  cn: number,
  dw: number,
  dh: number,
  round: boolean,
): Float32Array {
  const scaleX = 1 / (dw / sw),
    scaleY = 1 / (dh / sh);
  const ix = Math.round(scaleX),
    iy = Math.round(scaleY);
  const out = new Float32Array(dw * dh * cn);
  const store = (v: number) => (round ? saturateByte(v) : v);
  if (Math.abs(scaleX - ix) < Number.EPSILON && Math.abs(scaleY - iy) < Number.EPSILON) {
    const area = ix * iy;
    const inv = f32(1 / area);
    for (let y = 0; y < dh; y++)
      for (let x = 0; x < dw; x++)
        for (let c = 0; c < cn; c++) {
          if (ix === 2 && iy === 2) {
            const a = (2 * y * sw + 2 * x) * cn + c;
            const s = src[a] + src[a + cn] + src[a + sw * cn] + src[a + sw * cn + cn];
            out[(y * dw + x) * cn + c] = round ? (s + 2) >> 2 : f32(f32(s) * 0.25);
            continue;
          }
          const values: number[] = [];
          for (let sy = 0; sy < iy; sy++)
            for (let sx = 0; sx < ix; sx++)
              values.push(src[((y * iy + sy) * sw + x * ix + sx) * cn + c]);
          let sum = 0;
          let k = 0;
          for (; k <= area - 4; k += 4)
            sum = f32(
              sum + f32(f32(f32(values[k] + values[k + 1]) + values[k + 2]) + values[k + 3]),
            );
          for (; k < area; k++) sum = f32(sum + values[k]);
          out[(y * dw + x) * cn + c] = store(f32(sum * inv));
        }
    return out;
  }
  const xt = areaTaps(sw, dw, scaleX);
  const yt = areaTaps(sh, dh, scaleY);
  const width = dw * cn;
  const buf = new Float32Array(width);
  const sum = new Float32Array(width);
  let prev = yt[0]?.d ?? 0;
  for (const { d: dy, s: sy, alpha: beta } of yt) {
    buf.fill(0);
    const base = sy * sw * cn;
    for (const { d, s, alpha } of xt)
      for (let c = 0; c < cn; c++)
        buf[d * cn + c] = f32(buf[d * cn + c] + f32(src[base + s * cn + c] * alpha));
    if (dy !== prev) {
      for (let i = 0; i < width; i++) out[prev * width + i] = store(sum[i]);
      for (let i = 0; i < width; i++) sum[i] = f32(buf[i] * beta);
      prev = dy;
    } else for (let i = 0; i < width; i++) sum[i] = f32(sum[i] + f32(buf[i] * beta));
  }
  for (let i = 0; i < width; i++) out[prev * width + i] = store(sum[i]);
  return out;
}

/** cv::resize INTER_AREA of a one-channel float32 image. Enlarging uses OpenCV's area-weighted bilinear. */
export function resizeArea32(
  src: Float32Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float32Array {
  if (sw === dw && sh === dh) return src.slice();
  if (dw <= sw && dh <= sh) return resizeAreaDown(src, sw, sh, 1, dw, dh, false);
  return resizeAreaUp32(src, sw, sh, dw, dh);
}

/** cv::resize INTER_AREA of an 8-bit image with `cn` channels, when shrinking. */
export function resizeArea8(
  src: Uint8Array,
  sw: number,
  sh: number,
  cn: number,
  dw: number,
  dh: number,
): Uint8Array {
  if (sw === dw && sh === dh) return src.slice();
  return Uint8Array.from(resizeAreaDown(src, sw, sh, cn, dw, dh, true));
}

function areaUpTaps(source: number, target: number) {
  const scale = 1 / (target / source);
  const inv = target / source;
  const offset = new Int32Array(target);
  const first = new Float32Array(target);
  const second = new Float32Array(target);
  for (let d = 0; d < target; d++) {
    let s = Math.floor(d * scale);
    let f = f32(d + 1 - (s + 1) * inv);
    f = f <= 0 ? 0 : f32(f - Math.floor(f));
    if (s < 0) {
      f = 0;
      s = 0;
    }
    if (s >= source - 1) {
      f = 0;
      s = source - 1;
    }
    offset[d] = s;
    first[d] = f32(1 - f);
    second[d] = f;
  }
  return { offset, first, second };
}
function resizeAreaUp32(src: Float32Array, sw: number, sh: number, dw: number, dh: number) {
  const xs = areaUpTaps(sw, dw),
    ys = areaUpTaps(sh, dh);
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const y0 = ys.offset[y],
      y1 = Math.min(sh - 1, y0 + 1);
    const b0 = ys.first[y],
      b1 = ys.second[y];
    for (let x = 0; x < dw; x++) {
      const x0 = xs.offset[x],
        x1 = Math.min(sw - 1, x0 + 1);
      const a0 = xs.first[x],
        a1 = xs.second[x];
      const r0 = f32(f32(src[y0 * sw + x0] * a0) + f32(src[y0 * sw + x1] * a1));
      const r1 = f32(f32(src[y1 * sw + x0] * a0) + f32(src[y1 * sw + x1] * a1));
      out[y * dw + x] = f32(f32(r0 * b0) + f32(r1 * b1));
    }
  }
  return out;
}

/** cv::resize INTER_NEAREST with `cn` interleaved channels. */
export function resizeNearest<T extends Uint8Array | Float32Array>(
  src: T,
  sw: number,
  sh: number,
  cn: number,
  dw: number,
  dh: number,
): T {
  const out = new (src.constructor as new (n: number) => T)(dw * dh * cn);
  const ifx = 1 / (dw / sw),
    ify = 1 / (dh / sh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(Math.floor(y * ify), sh - 1);
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(Math.floor(x * ifx), sw - 1);
      for (let c = 0; c < cn; c++) out[(y * dw + x) * cn + c] = src[(sy * sw + sx) * cn + c];
    }
  }
  return out;
}

/** OpenCV's fixed binomial kernels for small sizes when no sigma is given. */
const SMALL_KERNELS: Readonly<Record<number, readonly number[]>> = {
  3: [0.25, 0.5, 0.25],
  5: [0.0625, 0.25, 0.375, 0.25, 0.0625],
  7: [0.03125, 0.109375, 0.21875, 0.28125, 0.21875, 0.109375, 0.03125],
  9: [4, 13, 30, 51, 60, 51, 30, 13, 4].map((v) => v / 256),
};
/** cv::getGaussianKernel as float32. */
function gaussianKernel(size: number, sigma: number): Float32Array {
  if (sigma <= 0 && SMALL_KERNELS[size]) return Float32Array.from(SMALL_KERNELS[size]);
  const s = sigma > 0 ? sigma : size * 0.15 + 0.35;
  const scale = -0.125 / (s * s);
  const half = (size - 1) >> 1;
  const values: number[] = [];
  let sum = 0;
  for (let i = 0, x = 1 - size; i < half; i++, x += 2) {
    const t = Math.exp(x * x * scale);
    values.push(t);
    sum += t;
  }
  sum = sum * 2 + 1;
  const mul = 1 / sum;
  const kernel = new Float32Array(size);
  for (let i = 0; i < half; i++) kernel[i] = kernel[size - 1 - i] = values[i] * mul;
  kernel[half] = mul;
  return kernel;
}
/** Kernel size OpenCV derives from sigma for float images. */
export const gaussianSize = (sigma: number) => cvRound(sigma * 4 * 2 + 1) | 1;

/** BORDER_REFLECT_101 index. */
function reflect101(i: number, n: number): number {
  if (n === 1) return 0;
  while (i < 0 || i >= n) i = i < 0 ? -i : 2 * n - 2 - i;
  return i;
}

/** cv::GaussianBlur of a one-channel float32 image (separable, REFLECT_101, FMA accumulation). */
export function gaussianBlur32(
  src: Float32Array,
  w: number,
  h: number,
  size: number,
  sigma: number,
): Float32Array {
  const k = gaussianKernel(w === 1 ? 1 : size, sigma);
  const r = (size - 1) >> 1;
  const rows = new Float32Array(w * h);
  const padded = new Float32Array(w + 2 * r);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let i = -r; i < w + r; i++) padded[i + r] = src[base + reflect101(i, w)];
    for (let x = 0; x < w; x++) {
      let s: number;
      if (size <= 5) {
        // SymmRowSmallVec_32f: ((left + right) * k1, then centre, then the outer pair) fused.
        const c = x + r;
        s = fma32(padded[c], k[r], f32(f32(padded[c - 1] + padded[c + 1]) * k[r + 1]));
        if (size === 5) s = fma32(f32(padded[c + 2] + padded[c - 2]), k[r + 2], s);
      } else {
        s = 0;
        for (let i = 0; i < size; i++) s = Math.fround(padded[x + i] * k[i] + s);
      }
      rows[base + x] = s;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) out[o + x] = f32(rows[o + x] * k[r]);
    for (let i = 1; i <= r; i++) {
      const up = reflect101(y - i, h) * w,
        down = reflect101(y + i, h) * w;
      const weight = k[r + i];
      for (let x = 0; x < w; x++)
        out[o + x] = Math.fround(rows[down + x] + rows[up + x]) * weight + out[o + x];
    }
  }
  return out;
}

/** 3x3 rectangle or cross structuring element. */
export enum MorphShape {
  Rect = "rect",
  Cross = "cross",
}
/**
 * cv::erode / cv::dilate of an interleaved 8-bit image with a 3x3 element, `iterations` times.
 * Pixels outside the image are ignored, as with OpenCV's default border value.
 */
export function morph8(
  src: Uint8Array,
  w: number,
  h: number,
  cn: number,
  shape: MorphShape,
  erode: boolean,
  iterations: number,
): Uint8Array {
  const pick = erode
    ? (a: number, b: number) => (a < b ? a : b)
    : (a: number, b: number) => (a > b ? a : b);
  const stride = w * cn;
  // Clamping a neighbour index to the image repeats a pixel already in the window, which is the
  // same as ignoring pixels outside the image.
  let cur = src;
  const across = new Uint8Array(src.length);
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < h; y++) {
      const row = y * stride;
      for (let x = 0; x < w; x++) {
        const left = row + Math.max(0, x - 1) * cn,
          here = row + x * cn,
          right = row + Math.min(w - 1, x + 1) * cn;
        for (let c = 0; c < cn; c++)
          across[here + c] = pick(pick(cur[left + c], cur[here + c]), cur[right + c]);
      }
    }
    const next = new Uint8Array(src.length);
    // Rect: the horizontal result of the rows above and below; cross: only their centre pixel.
    const vertical = shape === MorphShape.Rect ? across : cur;
    for (let y = 0; y < h; y++) {
      const up = Math.max(0, y - 1) * stride,
        here = y * stride,
        down = Math.min(h - 1, y + 1) * stride;
      for (let i = 0; i < stride; i++)
        next[here + i] = pick(pick(vertical[up + i], across[here + i]), vertical[down + i]);
    }
    cur = next;
  }
  return cur;
}

const PAIRWISE_BLOCK = 128;
/** NumPy's float32 pairwise summation (np.add.reduce over a contiguous array). */
export function pairwiseSum32(a: ArrayLike<number>, start = 0, n = a.length): number {
  if (n < 8) {
    let r = 0;
    for (let i = 0; i < n; i++) r = f32(r + a[start + i]);
    return r;
  }
  if (n <= PAIRWISE_BLOCK) {
    const r = new Float32Array(8);
    for (let j = 0; j < 8; j++) r[j] = a[start + j];
    let i = 8;
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] = r[j] + a[start + i + j];
    let res = f32(
      f32(f32(r[0] + r[1]) + f32(r[2] + r[3])) + f32(f32(r[4] + r[5]) + f32(r[6] + r[7])),
    );
    for (; i < n; i++) res = f32(res + a[start + i]);
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return f32(pairwiseSum32(a, start, n2) + pairwiseSum32(a, start + n2, n - n2));
}

/** cv::GaussianBlur's bit-exact 8-bit kernel: 8 fraction bits, rounded with error diffusion. */
function fixedKernel8(size: number): Int32Array {
  const k = Float64Array.from(SMALL_KERNELS[size] ?? gaussianKernel64(size, size * 0.15 + 0.35));
  const out = new Int32Array(size);
  const half = size >> 1;
  let err = 0,
    sum = 0;
  for (let i = 0; i < half; i++) {
    const adjusted = k[i] * 256 + err;
    const v = cvRound(adjusted);
    err = adjusted - v;
    out[i] = out[size - 1 - i] = v;
    sum += v;
  }
  out[half] = 256 - 2 * sum;
  return out;
}
function gaussianKernel64(size: number, sigma: number): Float64Array {
  const scale = -0.125 / (sigma * sigma);
  const half = (size - 1) >> 1;
  const values: number[] = [];
  let sum = 0;
  for (let i = 0, x = 1 - size; i < half; i++, x += 2) {
    const t = Math.exp(x * x * scale);
    values.push(t);
    sum += t;
  }
  const mul = 1 / (sum * 2 + 1);
  const kernel = new Float64Array(size);
  for (let i = 0; i < half; i++) kernel[i] = kernel[size - 1 - i] = values[i] * mul;
  kernel[half] = mul;
  return kernel;
}

/** cv::GaussianBlur of a one-channel 8-bit image with sigma 0 (OpenCV's bit-exact fixed point). */
export function gaussianBlur8(src: Uint8Array, w: number, h: number, size: number): Uint8Array {
  const k = fixedKernel8(size);
  const r = size >> 1;
  const rows = new Uint32Array(w * h);
  const padded = new Uint8Array(w + 2 * r);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let i = -r; i < w + r; i++) padded[i + r] = src[base + reflect101(i, w)];
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = 0; i < size; i++) s += k[i] * padded[x + i];
      rows[base + x] = s > 0xffff ? 0xffff : s;
    }
  }
  const out = new Uint8Array(w * h);
  const sums = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    sums.fill(0);
    for (let i = -r; i <= r; i++) {
      const source = reflect101(y + i, h) * w,
        weight = k[i + r];
      for (let x = 0; x < w; x++) sums[x] += weight * rows[source + x];
    }
    const o = y * w;
    for (let x = 0; x < w; x++) out[o + x] = Math.min(255, (sums[x] + (1 << 15)) >>> 16);
  }
  return out;
}
