import type { PixelBuffer } from "$/base/primitives";
import { LineGuideMode } from "$/import-export/image/import/types";

/**
 * PixelOE pre-pass (Apache-2.0, KohakuBlueleaf/PixelOE, `torch/outline.py` + `torch/color.py`), ported:
 * contrast-aware outline expansion (erode/dilate blend weighted by local brightness polarity, then an
 * erode-dilate-erode clean-up) followed by colour matching (global Lab mean/std transfer + 5-level
 * wavelet low-frequency swap from the source). It is a standalone image -> image step: the cell colour
 * picker and the grid stay independent of it.
 * Deliberate faithful quirks: zero padding in unfold-style windows, lower median, Lab stats over all
 * three channels together, kornia's Lab constants. Not replicated: replicate-padding to a multiple of
 * the pixel size, fp16 Gaussian kernel, unclamped intermediates (output is 8-bit), alpha (kept as is).
 */
const PIXELOE_THICKNESS = 3;
const WAVELET_LEVELS = 5;

type Plane = Float32Array;

function circleKernel(realR: number): Float64Array {
  const r = Math.trunc(realR);
  const n = 2 * r + 1;
  const k = new Float64Array(n * n);
  const offs = [
    [-0.5, -0.5],
    [-0.5, 0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [0, 0.5],
    [0, -0.5],
    [0.5, 0],
    [-0.5, 0],
  ];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let mx = -Infinity,
        mn = Infinity;
      for (const [a, b] of offs) {
        const d = Math.hypot(i + a - r, j + b - r);
        mx = Math.max(mx, d);
        mn = Math.min(mn, d);
      }
      if (mx <= realR) k[i * n + j] = 1;
      else if (mn <= realR) k[i * n + j] = (realR - mn) / (mx - mn);
    }
  return k;
}
/** KERNELS[3] = circle(2)[1:4,1:4]; KERNELS[2] = circle(1.5); both 3x3. */
function kernelFor(iters: number): { k: Float64Array; n: number } {
  if (iters === 2) return { k: circleKernel(1.5), n: 3 };
  if (iters === 3) {
    const c = circleKernel(2);
    const k = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) k[i * 3 + j] = c[(i + 1) * 5 + j + 1];
    return { k, n: 3 };
  }
  throw new RangeError("Unsupported outline thickness.");
}

// kornia sRGB <-> Lab (D65), floats, no input clamp.
const lin = (v: number) => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92);
/** Channels read from 8-bit pixels are one of 256 float32 values; their `lin` is looked up. */
const BYTE_LEVELS = Float32Array.from({ length: 256 }, (_, i) => i / 255);
const BYTE_LIN = Float64Array.from(BYTE_LEVELS, lin);
function linear(v: number): number {
  const level = Math.round(v * 255);
  return level >= 0 && level <= 255 && BYTE_LEVELS[level] === v ? BYTE_LIN[level] : lin(v);
}
const unlin = (v: number) =>
  v > 0.0031308 ? 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055 : v * 12.92;
const f = (t: number) => (t > 0.008856 ? Math.cbrt(Math.max(t, 0.008856)) : 7.787 * t + 4 / 29);
function toLab(r: Plane, g: Plane, b: Plane): [Plane, Plane, Plane] {
  const n = r.length;
  const L = new Float32Array(n),
    A = new Float32Array(n),
    B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lr = linear(r[i]),
      lg = linear(g[i]),
      lb = linear(b[i]);
    const x = f((0.412453 * lr + 0.35758 * lg + 0.180423 * lb) / 0.95047);
    const y = f(0.212671 * lr + 0.71516 * lg + 0.072169 * lb);
    const z = f((0.019334 * lr + 0.119193 * lg + 0.950227 * lb) / 1.08883);
    L[i] = 116 * y - 16;
    A[i] = 500 * (x - y);
    B[i] = 200 * (y - z);
  }
  return [L, A, B];
}
function fromLab(L: Plane, A: Plane, B: Plane): [Plane, Plane, Plane] {
  const n = L.length;
  const R = new Float32Array(n),
    G = new Float32Array(n),
    Bl = new Float32Array(n);
  const inv = (v: number) => (v > 0.2068966 ? v ** 3 : (v - 4 / 29) / 7.787);
  for (let i = 0; i < n; i++) {
    const fy = (L[i] + 16) / 116;
    const fx = A[i] / 500 + fy;
    const fz = Math.max(0, fy - B[i] / 200);
    const x = inv(fx) * 0.95047,
      y = inv(fy),
      z = inv(fz) * 1.08883;
    const cl = (v: number) => Math.min(1, Math.max(0, v));
    R[i] = cl(unlin(3.2404813432 * x - 1.5371515163 * y - 0.4985363262 * z));
    G[i] = cl(unlin(-0.96925495 * x + 1.8759900015 * y + 0.0415559266 * z));
    Bl[i] = cl(unlin(0.0556466391 * x - 0.2040413384 * y + 1.0573110696 * z));
  }
  return [R, G, Bl];
}

/** k-th smallest (0-based) by quickselect; reorders `a`. */
function selectNth(a: Float32Array, k: number): number {
  let lo = 0,
    hi = a.length - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo,
      j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
}

/** torch unfold(k, stride, pad k//2) -> per-patch stat -> fold, averaged by coverage. Zero padding included. */
function localStat(
  src: Plane,
  w: number,
  h: number,
  kernel: number,
  stride: number,
  stat: "median" | "min" | "max",
): Plane {
  const pad = kernel >> 1;
  const nx = Math.floor((w + 2 * pad - kernel) / stride) + 1;
  const ny = Math.floor((h + 2 * pad - kernel) / stride) + 1;
  const out = new Float32Array(w * h);
  const div = new Float32Array(w * h);
  const buf = new Float32Array(kernel * kernel);
  for (let py = 0; py < ny; py++)
    for (let px = 0; px < nx; px++) {
      const x0 = px * stride - pad,
        y0 = py * stride - pad;
      let m = 0;
      let lo = Infinity,
        hi = -Infinity;
      for (let y = y0; y < y0 + kernel; y++)
        for (let x = x0; x < x0 + kernel; x++) {
          const v = x >= 0 && y >= 0 && x < w && y < h ? src[y * w + x] : 0;
          if (stat === "median") buf[m++] = v;
          else if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      let value: number;
      if (stat === "median") {
        value = selectNth(buf, (buf.length - 1) >> 1);
      } else value = stat === "min" ? lo : hi;
      const xa = Math.max(0, x0),
        xb = Math.min(w, x0 + kernel),
        ya = Math.max(0, y0),
        yb = Math.min(h, y0 + kernel);
      for (let y = ya; y < yb; y++)
        for (let x = xa; x < xb; x++) {
          out[y * w + x] += value;
          div[y * w + x] += 1;
        }
    }
  for (let i = 0; i < out.length; i++) out[i] /= div[i] + 1e-8;
  return out;
}

function expansionWeight(L: Plane, w: number, h: number, k: number): Plane {
  const stride = k >> 1;
  const lum = L.map((v) => v / 100);
  const med = localStat(lum, w, h, k * 2, stride, "median");
  const mn = localStat(lum, w, h, k, stride, "min");
  const mx = localStat(lum, w, h, k, stride, "max");
  const out = new Float32Array(w * h);
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < out.length; i++) {
    const bright = mx[i] - med[i];
    const dark = med[i] - mn[i];
    const s = (med[i] - 0.5) * 10 + (dark - bright) * 3;
    const v = 1 / (1 + Math.exp(-s));
    out[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo + 1e-8);
  return out;
}

/** Continuous erode/dilate with zero padding, as unfold-based torch ops. */
function morph(
  src: Plane,
  w: number,
  h: number,
  kern: { k: Float64Array; n: number },
  erode: boolean,
  iterations: number,
): Plane {
  let cur = src;
  for (let it = 0; it < iterations; it++) {
    const out = new Float32Array(w * h);
    if (kern.n === 3 && w > 2 && h > 2) {
      morphInterior3(cur, out, w, h, kern.k, erode);
      morphBorder(cur, out, w, h, kern, erode, true);
    } else morphBorder(cur, out, w, h, kern, erode, false);
    cur = out;
  }
  return cur;
}
/** One 3x3 pass over the pixels whose window lies inside the image. */
function morphInterior3(
  cur: Plane,
  out: Plane,
  w: number,
  h: number,
  k: Float64Array,
  erode: boolean,
) {
  // Per tap, the value added to the neighbour: erode takes min(v - k + 1), dilate max(v + k - 1).
  const offsets = [-w - 1, -w, -w + 1, -1, 0, 1, w - 1, w, w + 1];
  const [o0, o1, o2, o3, o4, o5, o6, o7, o8] = offsets;
  const [k0, k1, k2, k3, k4, k5, k6, k7, k8] = k;
  for (let y = 1; y < h - 1; y++) {
    const end = y * w + w - 1;
    if (erode)
      for (let o = y * w + 1; o < end; o++) {
        let best = Infinity,
          c: number;
        if ((c = cur[o + o0] - k0 + 1) < best) best = c;
        if ((c = cur[o + o1] - k1 + 1) < best) best = c;
        if ((c = cur[o + o2] - k2 + 1) < best) best = c;
        if ((c = cur[o + o3] - k3 + 1) < best) best = c;
        if ((c = cur[o + o4] - k4 + 1) < best) best = c;
        if ((c = cur[o + o5] - k5 + 1) < best) best = c;
        if ((c = cur[o + o6] - k6 + 1) < best) best = c;
        if ((c = cur[o + o7] - k7 + 1) < best) best = c;
        if ((c = cur[o + o8] - k8 + 1) < best) best = c;
        out[o] = best;
      }
    else
      for (let o = y * w + 1; o < end; o++) {
        let best = -Infinity,
          c: number;
        if ((c = cur[o + o0] + k0 - 1) > best) best = c;
        if ((c = cur[o + o1] + k1 - 1) > best) best = c;
        if ((c = cur[o + o2] + k2 - 1) > best) best = c;
        if ((c = cur[o + o3] + k3 - 1) > best) best = c;
        if ((c = cur[o + o4] + k4 - 1) > best) best = c;
        if ((c = cur[o + o5] + k5 - 1) > best) best = c;
        if ((c = cur[o + o6] + k6 - 1) > best) best = c;
        if ((c = cur[o + o7] + k7 - 1) > best) best = c;
        if ((c = cur[o + o8] + k8 - 1) > best) best = c;
        out[o] = Math.min(1, Math.max(0, best));
      }
  }
}
/** The generic window pass, over the border pixels only when the interior is done already. */
function morphBorder(
  cur: Plane,
  out: Plane,
  w: number,
  h: number,
  kern: { k: Float64Array; n: number },
  erode: boolean,
  borderOnly: boolean,
) {
  const p = kern.n >> 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (borderOnly && y > 0 && y < h - 1 && x > 0 && x < w - 1) {
        x = w - 2;
        continue;
      }
      let best = erode ? Infinity : -Infinity;
      for (let j = 0; j < kern.n; j++)
        for (let i = 0; i < kern.n; i++) {
          const xx = x + i - p,
            yy = y + j - p;
          const v = xx >= 0 && yy >= 0 && xx < w && yy < h ? cur[yy * w + xx] : 0;
          const kv = kern.k[j * kern.n + i];
          const c = erode ? v - kv + 1 : v + kv - 1;
          if (erode ? c < best : c > best) best = c;
        }
      out[y * w + x] = erode ? best : Math.min(1, Math.max(0, best));
    }
}

/**
 * Symmetric taps along a row: `out[base + x]` (a float32 store) is `taps[0] * row[x + radius]` plus
 * `taps[t] * (row[x + radius - t] + row[x + radius + t])` for t = 1..radius, summed in doubles in
 * that order. Eight pixels run side by side.
 */
function blurRow(row: Plane, taps: Plane, radius: number, out: Plane, base: number, w: number) {
  const centre = taps[0];
  let x = 0;
  for (; x + 7 < w; x += 8) {
    const c = x + radius;
    let s0 = centre * row[c],
      s1 = centre * row[c + 1],
      s2 = centre * row[c + 2],
      s3 = centre * row[c + 3],
      s4 = centre * row[c + 4],
      s5 = centre * row[c + 5],
      s6 = centre * row[c + 6],
      s7 = centre * row[c + 7];
    for (let t = 1; t <= radius; t++) {
      const wt = taps[t],
        l = c - t,
        r = c + t;
      s0 += wt * (row[l] + row[r]);
      s1 += wt * (row[l + 1] + row[r + 1]);
      s2 += wt * (row[l + 2] + row[r + 2]);
      s3 += wt * (row[l + 3] + row[r + 3]);
      s4 += wt * (row[l + 4] + row[r + 4]);
      s5 += wt * (row[l + 5] + row[r + 5]);
      s6 += wt * (row[l + 6] + row[r + 6]);
      s7 += wt * (row[l + 7] + row[r + 7]);
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
    const c = x + radius;
    let acc = centre * row[c];
    for (let t = 1; t <= radius; t++) acc += taps[t] * (row[c - t] + row[c + t]);
    out[base + x] = acc;
  }
}
/**
 * Symmetric taps down a column: the centre row times `taps[0]`, then each pair of rows added in,
 * rounding to float32 after every step (as accumulating in a float32 image). Eight pixels at once.
 */
function blurColumn(
  tmp: Plane,
  taps: Plane,
  radius: number,
  ups: Int32Array,
  downs: Int32Array,
  out: Plane,
  dst: number,
  w: number,
) {
  const f32 = Math.fround;
  const centre = taps[0];
  let x = 0;
  for (; x + 7 < w; x += 8) {
    const c = dst + x;
    let s0 = f32(centre * tmp[c]),
      s1 = f32(centre * tmp[c + 1]),
      s2 = f32(centre * tmp[c + 2]),
      s3 = f32(centre * tmp[c + 3]),
      s4 = f32(centre * tmp[c + 4]),
      s5 = f32(centre * tmp[c + 5]),
      s6 = f32(centre * tmp[c + 6]),
      s7 = f32(centre * tmp[c + 7]);
    for (let t = 1; t <= radius; t++) {
      const wt = taps[t],
        u = ups[t] + x,
        d = downs[t] + x;
      s0 = f32(s0 + wt * (tmp[u] + tmp[d]));
      s1 = f32(s1 + wt * (tmp[u + 1] + tmp[d + 1]));
      s2 = f32(s2 + wt * (tmp[u + 2] + tmp[d + 2]));
      s3 = f32(s3 + wt * (tmp[u + 3] + tmp[d + 3]));
      s4 = f32(s4 + wt * (tmp[u + 4] + tmp[d + 4]));
      s5 = f32(s5 + wt * (tmp[u + 5] + tmp[d + 5]));
      s6 = f32(s6 + wt * (tmp[u + 6] + tmp[d + 6]));
      s7 = f32(s7 + wt * (tmp[u + 7] + tmp[d + 7]));
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
    let s = f32(centre * tmp[dst + x]);
    for (let t = 1; t <= radius; t++) s = f32(s + taps[t] * (tmp[ups[t] + x] + tmp[downs[t] + x]));
    out[dst + x] = s;
  }
}
function gaussianBlur(src: Plane, w: number, h: number, radius: number): Plane {
  const taps = new Float32Array(radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += Math.exp(-(i * i) / (2 * radius * radius));
  for (let i = 0; i <= radius; i++) taps[i] = Math.exp(-(i * i) / (2 * radius * radius)) / sum;
  const reflectOk = h > radius && w > radius;
  const indices = (n: number) => {
    const table = new Int32Array(n + 2 * radius);
    for (let i = -radius; i < n + radius; i++) {
      let v = i;
      if (reflectOk) {
        if (v < 0) v = -v;
        if (v >= n) v = 2 * (n - 1) - v;
      }
      table[i + radius] = Math.min(n - 1, Math.max(0, v));
    }
    return table;
  };
  // Horizontal pass on a reflect-padded row, symmetric taps.
  const columns = indices(w);
  const row = new Float32Array(w + 2 * radius);
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let i = 0; i < row.length; i++) row[i] = src[base + columns[i]];
    blurRow(row, taps, radius, tmp, base, w);
  }
  // Vertical pass.
  const lines = indices(h);
  const out = new Float32Array(w * h);
  const ups = new Int32Array(radius + 1),
    downs = new Int32Array(radius + 1);
  for (let y = 0; y < h; y++) {
    for (let t = 1; t <= radius; t++) {
      ups[t] = lines[y - t + radius] * w;
      downs[t] = lines[y + t + radius] * w;
    }
    blurColumn(tmp, taps, radius, ups, downs, out, y * w, w);
  }
  return out;
}

/** Box-reduce by `f`, then blur there and bilinearly enlarge: used for the widest (smoothest) wavelet levels. */
function blurReduced(src: Plane, w: number, h: number, radius: number, f: number): Plane {
  const dw = Math.ceil(w / f),
    dh = Math.ceil(h / f);
  const small = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      let sum = 0,
        n = 0;
      for (let yy = y * f; yy < Math.min(h, y * f + f); yy++)
        for (let xx = x * f; xx < Math.min(w, x * f + f); xx++) {
          sum += src[yy * w + xx];
          n++;
        }
      small[y * dw + x] = sum / n;
    }
  const blurred = gaussianBlur(small, dw, dh, radius / f);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(dh - 1, Math.max(0, (y + 0.5) / f - 0.5));
    const y0 = Math.floor(fy),
      y1 = Math.min(dh - 1, y0 + 1),
      ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(dw - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const x0 = Math.floor(fx),
        x1 = Math.min(dw - 1, x0 + 1),
        tx = fx - x0;
      out[y * w + x] =
        (blurred[y0 * dw + x0] * (1 - tx) + blurred[y0 * dw + x1] * tx) * (1 - ty) +
        (blurred[y1 * dw + x0] * (1 - tx) + blurred[y1 * dw + x1] * tx) * ty;
    }
  }
  return out;
}
const blurLevel = (src: Plane, w: number, h: number, radius: number) =>
  radius >= 16 && Math.min(w, h) >= 128
    ? blurReduced(src, w, h, radius, 4)
    : gaussianBlur(src, w, h, radius);

function waveletColorFix(inp: Plane, target: Plane, w: number, h: number): Plane {
  const high = new Float32Array(inp.length);
  let x = inp;
  let t = target;
  for (let i = 1; i <= WAVELET_LEVELS; i++) {
    const low = blurLevel(x, w, h, 2 ** i);
    for (let j = 0; j < high.length; j++) high[j] += x[j] - low[j];
    x = low;
    t = blurLevel(t, w, h, 2 ** i);
  }
  for (let j = 0; j < high.length; j++) high[j] += t[j];
  return high;
}

/** Outline expansion only. */
function outlineExpansion(
  planes: [Plane, Plane, Plane],
  w: number,
  h: number,
  pixelSize: number,
  guide?: PrepassGuide,
  thickness = PIXELOE_THICKNESS,
): [Plane, Plane, Plane] {
  // PixelOE + lines: dark spreads along the drawn lines too (union) or only there (replace). Lines
  // only replaces the contrast weight outright, so it is not computed at all then.
  let weight: Plane;
  if (guide?.mode === LineGuideMode.Replace) weight = guide.mask;
  else {
    weight = expansionWeight(toLab(...planes)[0], w, h, pixelSize);
    if (guide)
      for (let i = 0; i < weight.length; i++) weight[i] = Math.max(weight[i], guide.mask[i]);
  }
  const kt = kernelFor(thickness);
  const kc = kernelFor(2);
  return planes.map((p) => {
    const e = morph(p, w, h, kt, true, 1);
    const d = morph(p, w, h, kt, false, 1);
    const mixed = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) mixed[i] = e[i] * weight[i] + d[i] * (1 - weight[i]);
    return morph(morph(morph(mixed, w, h, kc, true, 1), w, h, kc, false, 2), w, h, kc, true, 1);
  }) as [Plane, Plane, Plane];
}

/** Colour match of `source` to `target` (global Lab statistics, then wavelet low-frequency swap). */
function colorMatch(
  source: [Plane, Plane, Plane],
  target: [Plane, Plane, Plane],
  w: number,
  h: number,
): [Plane, Plane, Plane] {
  const sl = toLab(...source);
  const tl = toLab(...target);
  const stats = (lab: Plane[]) => {
    const n = lab[0].length * 3;
    let mean = 0;
    for (const c of lab) for (let i = 0; i < c.length; i++) mean += c[i];
    mean /= n;
    let v = 0;
    for (const c of lab) for (let i = 0; i < c.length; i++) v += (c[i] - mean) ** 2;
    return { mean, std: Math.sqrt(v / (n - 1)) };
  };
  const s = stats(sl),
    t = stats(tl);
  const shifted = sl.map((c) => {
    const plane = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) plane[i] = ((c[i] - s.mean) / s.std) * t.std + t.mean;
    return plane;
  });
  const rgb = fromLab(shifted[0], shifted[1], shifted[2]);
  return rgb.map((p, i) => waveletColorFix(p, target[i], w, h)) as [Plane, Plane, Plane];
}

/** A line mask at the image size (1 = line) and how it changes the expansion weight. */
export interface PrepassGuide {
  mask: Float32Array;
  mode: LineGuideMode;
}

/**
 * Full pre-pass: outline expansion, then colour match to the original. `pixelSize` is the cell size
 * in source pixels. Without `guide` this is the original pre-pass, unchanged.
 */
export function pixeloePrepass(
  image: PixelBuffer,
  pixelSize: number,
  guide?: PrepassGuide,
): PixelBuffer {
  const size = Math.round(pixelSize);
  if (size < 2 || image.width < 2 || image.height < 2) return image;
  const { width: w, height: h, data } = image;
  const planes: [Plane, Plane, Plane] = [
    new Float32Array(w * h),
    new Float32Array(w * h),
    new Float32Array(w * h),
  ];
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) planes[c][i] = data[i * 4 + c] / 255;
  const expanded = outlineExpansion(planes, w, h, size, guide);
  const matched = colorMatch(expanded, planes, w, h);
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < w * h; i++)
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(matched[c][i] * 255);
  return { width: w, height: h, data: out };
}
