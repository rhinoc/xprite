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
    const values = new Float64Array(area);
    for (let y = 0; y < dh; y++)
      for (let x = 0; x < dw; x++)
        for (let c = 0; c < cn; c++) {
          if (ix === 2 && iy === 2) {
            const a = (2 * y * sw + 2 * x) * cn + c;
            const s = src[a] + src[a + cn] + src[a + sw * cn] + src[a + sw * cn + cn];
            out[(y * dw + x) * cn + c] = round ? (s + 2) >> 2 : f32(f32(s) * 0.25);
            continue;
          }
          let n = 0;
          for (let sy = 0; sy < iy; sy++)
            for (let sx = 0; sx < ix; sx++)
              values[n++] = src[((y * iy + sy) * sw + x * ix + sx) * cn + c];
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
  // The column taps as flat tables (destination and source element offsets, weight).
  const into = Int32Array.from(xt, (tap) => tap.d * cn);
  const from = Int32Array.from(xt, (tap) => tap.s * cn);
  const weights = Float64Array.from(xt, (tap) => tap.alpha);
  let prev = yt[0]?.d ?? 0;
  for (const { d: dy, s: sy, alpha: beta } of yt) {
    buf.fill(0);
    const base = sy * sw * cn;
    if (cn === 3)
      for (let t = 0; t < into.length; t++) {
        const d = into[t],
          s = base + from[t],
          alpha = weights[t];
        // Float32 stores round each sum, as f32(buf + f32(src * alpha)).
        buf[d] = buf[d] + f32(src[s] * alpha);
        buf[d + 1] = buf[d + 1] + f32(src[s + 1] * alpha);
        buf[d + 2] = buf[d + 2] + f32(src[s + 2] * alpha);
      }
    else
      for (let t = 0; t < into.length; t++) {
        const d = into[t],
          s = base + from[t],
          alpha = weights[t];
        for (let c = 0; c < cn; c++) buf[d + c] = f32(buf[d + c] + f32(src[s + c] * alpha));
      }
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
/** Source index of every position of a row padded by `r` on each side (BORDER_REFLECT_101). */
function reflectedIndices(n: number, r: number): Int32Array {
  const indices = new Int32Array(n + 2 * r);
  for (let i = -r; i < n + r; i++) indices[i + r] = reflect101(i, n);
  return indices;
}

/**
 * One row of the float32 horizontal pass: `out[x]` is `fround(p * k + s)` chained over the taps in
 * order from s = 0. Eight pixels run side by side so their chains overlap; each keeps its own order.
 */
function fmaRow32(
  padded: Float32Array,
  k: Float32Array,
  out: Float32Array,
  base: number,
  w: number,
) {
  const size = k.length;
  let x = 0;
  for (; x + 7 < w; x += 8) {
    let s0 = 0,
      s1 = 0,
      s2 = 0,
      s3 = 0,
      s4 = 0,
      s5 = 0,
      s6 = 0,
      s7 = 0;
    for (let i = 0; i < size; i++) {
      const q = k[i],
        p = x + i;
      s0 = f32(padded[p] * q + s0);
      s1 = f32(padded[p + 1] * q + s1);
      s2 = f32(padded[p + 2] * q + s2);
      s3 = f32(padded[p + 3] * q + s3);
      s4 = f32(padded[p + 4] * q + s4);
      s5 = f32(padded[p + 5] * q + s5);
      s6 = f32(padded[p + 6] * q + s6);
      s7 = f32(padded[p + 7] * q + s7);
    }
    const o = base + x;
    out[o] = s0;
    out[o + 1] = s1;
    out[o + 2] = s2;
    out[o + 3] = s3;
    out[o + 4] = s4;
    out[o + 5] = s5;
    out[o + 6] = s6;
    out[o + 7] = s7;
  }
  for (; x < w; x++) {
    let s = 0;
    for (let i = 0; i < size; i++) s = f32(padded[x + i] * k[i] + s);
    out[base + x] = s;
  }
}
/**
 * One row of the float32 vertical pass: the centre row times `k[r]`, then for each distance the
 * rounded sum of the rows above and below, fused in, nearest first. Eight pixels side by side.
 */
function symmetricColumn32(
  rows: Float32Array,
  k: Float32Array,
  r: number,
  ups: Int32Array,
  downs: Int32Array,
  out: Float32Array,
  o: number,
  w: number,
) {
  const centre = k[r];
  let x = 0;
  for (; x + 7 < w; x += 8) {
    const c = o + x;
    let s0 = f32(rows[c] * centre),
      s1 = f32(rows[c + 1] * centre),
      s2 = f32(rows[c + 2] * centre),
      s3 = f32(rows[c + 3] * centre),
      s4 = f32(rows[c + 4] * centre),
      s5 = f32(rows[c + 5] * centre),
      s6 = f32(rows[c + 6] * centre),
      s7 = f32(rows[c + 7] * centre);
    for (let i = 1; i <= r; i++) {
      const q = k[r + i],
        u = ups[i] + x,
        d = downs[i] + x;
      s0 = f32(f32(rows[d] + rows[u]) * q + s0);
      s1 = f32(f32(rows[d + 1] + rows[u + 1]) * q + s1);
      s2 = f32(f32(rows[d + 2] + rows[u + 2]) * q + s2);
      s3 = f32(f32(rows[d + 3] + rows[u + 3]) * q + s3);
      s4 = f32(f32(rows[d + 4] + rows[u + 4]) * q + s4);
      s5 = f32(f32(rows[d + 5] + rows[u + 5]) * q + s5);
      s6 = f32(f32(rows[d + 6] + rows[u + 6]) * q + s6);
      s7 = f32(f32(rows[d + 7] + rows[u + 7]) * q + s7);
    }
    out[c] = s0;
    out[c + 1] = s1;
    out[c + 2] = s2;
    out[c + 3] = s3;
    out[c + 4] = s4;
    out[c + 5] = s5;
    out[c + 6] = s6;
    out[c + 7] = s7;
  }
  for (; x < w; x++) {
    let s = f32(rows[o + x] * centre);
    for (let i = 1; i <= r; i++) s = f32(f32(rows[downs[i] + x] + rows[ups[i] + x]) * k[r + i] + s);
    out[o + x] = s;
  }
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
  // A one-pixel-wide image has a one-tap kernel but still reads `size` taps (as undefined).
  const taps = k.length === size ? k : Float32Array.from({ length: size }, (_, i) => k[i] ?? NaN);
  const rows = new Float32Array(w * h);
  const padded = new Float32Array(w + 2 * r);
  const columns = reflectedIndices(w, r);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let i = 0; i < padded.length; i++) padded[i] = src[base + columns[i]];
    if (size > 5) {
      fmaRow32(padded, taps, rows, base, w);
      continue;
    }
    // SymmRowSmallVec_32f: ((left + right) * k1, then centre, then the outer pair) fused.
    const k0 = taps[r],
      k1 = taps[r + 1],
      k2 = taps[r + 2];
    for (let x = 0; x < w; x++) {
      const c = x + r;
      let s = fma32(padded[c], k0, f32(f32(padded[c - 1] + padded[c + 1]) * k1));
      if (size === 5) s = fma32(f32(padded[c + 2] + padded[c - 2]), k2, s);
      rows[base + x] = s;
    }
  }
  const out = new Float32Array(w * h);
  const lines = reflectedIndices(h, r);
  const ups = new Int32Array(r + 1),
    downs = new Int32Array(r + 1);
  for (let y = 0; y < h; y++) {
    for (let i = 1; i <= r; i++) {
      ups[i] = lines[y - i + r] * w;
      downs[i] = lines[y + i + r] * w;
    }
    symmetricColumn32(rows, taps, r, ups, downs, out, y * w, w);
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
  // A dilation is the erosion of the inverted image, inverted back: max(a, b) = 255 - min(255 - a, 255 - b).
  if (!erode) return invert8(erode8(invert8(src), w, h, cn, shape, iterations));
  return erode8(src, w, h, cn, shape, iterations);
}
function invert8(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = 255 - src[i];
  return out;
}
/** Minimum of an element and its left and right neighbours that lie inside the row. */
function rowEdgeMin(cur: Uint8Array, i: number, row: number, end: number, cn: number): number {
  let v = cur[i];
  if (i - cn >= row && cur[i - cn] < v) v = cur[i - cn];
  if (i + cn < end && cur[i + cn] < v) v = cur[i + cn];
  return v;
}
function erode8(
  src: Uint8Array,
  w: number,
  h: number,
  cn: number,
  shape: MorphShape,
  iterations: number,
): Uint8Array {
  const stride = w * cn;
  // Clamping a neighbour index to the image repeats a pixel already in the window, which is the
  // same as ignoring pixels outside the image.
  let cur = src;
  const across = new Uint8Array(src.length);
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < h; y++) {
      const row = y * stride,
        end = row + stride;
      // The first and last pixel of a row have one neighbour; the rest two.
      const head = Math.min(end, row + cn),
        tail = Math.max(head, end - cn);
      for (let i = row; i < head; i++) across[i] = rowEdgeMin(cur, i, row, end, cn);
      for (let i = head; i < tail; i++) {
        let v = cur[i - cn];
        if (cur[i] < v) v = cur[i];
        if (cur[i + cn] < v) v = cur[i + cn];
        across[i] = v;
      }
      for (let i = tail; i < end; i++) across[i] = rowEdgeMin(cur, i, row, end, cn);
    }
    const next = new Uint8Array(src.length);
    // Rect: the horizontal result of the rows above and below; cross: only their centre pixel.
    const vertical = shape === MorphShape.Rect ? across : cur;
    for (let y = 0; y < h; y++) {
      const up = Math.max(0, y - 1) * stride - y * stride,
        down = Math.min(h - 1, y + 1) * stride - y * stride;
      for (let i = y * stride, end = i + stride; i < end; i++) {
        let v = across[i];
        if (vertical[i + up] < v) v = vertical[i + up];
        if (vertical[i + down] < v) v = vertical[i + down];
        next[i] = v;
      }
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
    // Eight float32 lanes, as NumPy's unrolled loop.
    let r0 = f32(a[start]),
      r1 = f32(a[start + 1]),
      r2 = f32(a[start + 2]),
      r3 = f32(a[start + 3]),
      r4 = f32(a[start + 4]),
      r5 = f32(a[start + 5]),
      r6 = f32(a[start + 6]),
      r7 = f32(a[start + 7]);
    let i = 8;
    for (; i < n - (n % 8); i += 8) {
      const at = start + i;
      r0 = f32(r0 + a[at]);
      r1 = f32(r1 + a[at + 1]);
      r2 = f32(r2 + a[at + 2]);
      r3 = f32(r3 + a[at + 3]);
      r4 = f32(r4 + a[at + 4]);
      r5 = f32(r5 + a[at + 5]);
      r6 = f32(r6 + a[at + 6]);
      r7 = f32(r7 + a[at + 7]);
    }
    let res = f32(f32(f32(r0 + r1) + f32(r2 + r3)) + f32(f32(r4 + r5) + f32(r6 + r7)));
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

/**
 * Integer sums `k[r] * src[c] + k[r + i] * (src[c + lefts[i]] + src[c + rights[i]])` for the `w`
 * pixels c = centre + x, eight side by side. Integer sums are exact in any order, so mirrored taps
 * (the kernel is symmetric) share a multiply and zero taps are skipped.
 */
function symmetricSums(
  src: Int32Array,
  k: Int32Array,
  r: number,
  centre: number,
  lefts: Int32Array,
  rights: Int32Array,
  out: Int32Array,
  w: number,
) {
  const middle = k[r];
  let x = 0;
  for (; x + 7 < w; x += 8) {
    const c = centre + x;
    let s0 = middle * src[c],
      s1 = middle * src[c + 1],
      s2 = middle * src[c + 2],
      s3 = middle * src[c + 3],
      s4 = middle * src[c + 4],
      s5 = middle * src[c + 5],
      s6 = middle * src[c + 6],
      s7 = middle * src[c + 7];
    for (let i = 1; i <= r; i++) {
      const q = k[r + i];
      if (!q) continue;
      const a = c + lefts[i],
        b = c + rights[i];
      s0 += q * (src[a] + src[b]);
      s1 += q * (src[a + 1] + src[b + 1]);
      s2 += q * (src[a + 2] + src[b + 2]);
      s3 += q * (src[a + 3] + src[b + 3]);
      s4 += q * (src[a + 4] + src[b + 4]);
      s5 += q * (src[a + 5] + src[b + 5]);
      s6 += q * (src[a + 6] + src[b + 6]);
      s7 += q * (src[a + 7] + src[b + 7]);
    }
    out[x] = s0;
    out[x + 1] = s1;
    out[x + 2] = s2;
    out[x + 3] = s3;
    out[x + 4] = s4;
    out[x + 5] = s5;
    out[x + 6] = s6;
    out[x + 7] = s7;
  }
  for (; x < w; x++) {
    const c = centre + x;
    let sum = middle * src[c];
    for (let i = 1; i <= r; i++) sum += k[r + i] * (src[c + lefts[i]] + src[c + rights[i]]);
    out[x] = sum;
  }
}

/** cv::GaussianBlur of a one-channel 8-bit image with sigma 0 (OpenCV's bit-exact fixed point). */
export function gaussianBlur8(src: Uint8Array, w: number, h: number, size: number): Uint8Array {
  const k = fixedKernel8(size);
  const r = size >> 1;
  const rows = new Int32Array(w * h);
  const padded = new Int32Array(w + 2 * r);
  const columns = reflectedIndices(w, r);
  const sums = new Int32Array(w);
  const lefts = new Int32Array(r + 1),
    rights = new Int32Array(r + 1);
  for (let i = 1; i <= r; i++) {
    lefts[i] = -i;
    rights[i] = i;
  }
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let i = 0; i < padded.length; i++) padded[i] = src[base + columns[i]];
    symmetricSums(padded, k, r, r, lefts, rights, sums, w);
    for (let x = 0; x < w; x++) rows[base + x] = sums[x] > 0xffff ? 0xffff : sums[x];
  }
  const out = new Uint8Array(w * h);
  const lines = reflectedIndices(h, r);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let i = 1; i <= r; i++) {
      lefts[i] = lines[y - i + r] * w - o;
      rights[i] = lines[y + i + r] * w - o;
    }
    symmetricSums(rows, k, r, o, lefts, rights, sums, w);
    for (let x = 0; x < w; x++) out[o + x] = Math.min(255, (sums[x] + (1 << 15)) >>> 16);
  }
  return out;
}
