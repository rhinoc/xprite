import { labToRgb8, rgbToLab8 } from "$/import-export/image/import/line-guided/cv-lab";
import {
  MorphShape,
  gaussianBlur32,
  gaussianBlur8,
  morph8,
  pairwiseSum32,
  resizeArea32,
  resizeLinear64,
  resizeLinear8,
  resizeNearest,
} from "$/import-export/image/import/line-guided/cv-ops";
import { LineGuideMode } from "$/import-export/image/import/types";

/**
 * PixelOE's legacy `pixelize()` (Apache-2.0, KohakuBlueleaf/PixelOE, `src/pixeloe/legacy`): resize
 * to target x patch size, contrast-aware outline expansion, colour match, contrast-based downscale.
 * Ported operation for operation from the OpenCV / NumPy / torch original with
 * mode="contrast", patch_size=6, avg_scale=9, dist_scale=4 and no colour quantisation, so it matches
 * the Python reference pixel for pixel. The expansion weight can be replaced by a line guide.
 */
const PIXELOE_PATCH_SIZE = 6;
const PIXELOE_DEFAULT_THICKNESS = 2;
const AVG_SCALE = 9;
const DIST_SCALE = 4;
const WEIGHT_STRIDE = Math.floor(PIXELOE_PATCH_SIZE / 4) * 2;
const COLOR_LEVELS = 5;
/** A guide mask cell counts as line when more than this share of it is line at working size. */
const MASK_COVERAGE = 0.2;
const ORIGINAL_MIX = 0.25;
const ORIGINAL_SLOPE = 5;
const f32 = Math.fround;

export interface LegacyPixeloeOptions {
  width: number;
  height: number;
  thickness?: number;
  /** Line image (one byte per pixel, 255 = paper), its size and its 0..1 line threshold. */
  guide?: LineGuide;
}

export interface LineGuide {
  lines: Uint8Array;
  width: number;
  height: number;
  /** Values below `threshold * 255` are line; null when the drawing has no lines at all. */
  threshold: number | null;
  mode: LineGuideMode;
}

export interface PixeloeSizes {
  work: [number, number];
  out: [number, number];
}
/** pixelize() sizes for one `target_size`: working image and contrast-downscale output. */
function pixeloeTargetSizes(w: number, h: number, target: number): PixeloeSizes {
  const ratio = w / h;
  const s = Math.sqrt((target ** 2 * PIXELOE_PATCH_SIZE ** 2) / ratio);
  const work: [number, number] = [Math.trunc(s * ratio), Math.trunc(s)];
  const r2 = work[0] / work[1];
  const t = Math.sqrt(target ** 2 / r2);
  return { work, out: [Math.trunc(t * r2), Math.trunc(t)] };
}
/**
 * Largest working image (pixels). Outputs above ~330 px a side would otherwise need several
 * hundred MB in a browser worker; they work at a smaller patch instead.
 */
const MAX_WORK_PIXELS = 2048 * 2048;
/**
 * Use PixelOE's own sizing when some `target_size` gives exactly the requested output (then the
 * result is the library's), otherwise work at the requested size x patch size.
 */
export function legacyPixeloeSizes(w: number, h: number, ow: number, oh: number): PixeloeSizes {
  const guess = Math.round(Math.sqrt(ow * oh));
  for (const target of [Math.max(ow, oh), guess, guess - 1, guess + 1, guess - 2, guess + 2]) {
    if (target < 1) continue;
    const sizes = pixeloeTargetSizes(w, h, target);
    const [ww, wh] = sizes.work;
    if (
      sizes.out[0] === ow &&
      sizes.out[1] === oh &&
      ww > 0 &&
      wh > 0 &&
      ww * wh <= MAX_WORK_PIXELS
    )
      return sizes;
  }
  const patch = Math.max(
    1,
    Math.min(PIXELOE_PATCH_SIZE, Math.floor(Math.sqrt(MAX_WORK_PIXELS / (ow * oh)))),
  );
  return { work: [ow * patch, oh * patch], out: [ow, oh] };
}

/**
 * utils.apply_chunk_torch: one statistic per `stride` block over an edge-padded `kernel` window.
 * Every plane PixelOE takes statistics of holds 8-bit values (Lab bytes, or them / 255), so the
 * window is gathered as bytes and the statistic reads a histogram instead of sorting.
 */
function chunkStat(
  data: Uint8Array,
  w: number,
  h: number,
  kernel: number,
  stride: number,
  stat: WindowStat,
): Uint8Array {
  const shift = Math.max(kernel - stride, 0);
  const pad = shift >> 1;
  const out = new Uint8Array(w * h);
  const values = new Uint8Array(kernel * kernel);
  const histogram = new Uint16Array(BYTE_VALUES);
  const bw = Math.floor(w / stride),
    bh = Math.floor(h / stride);
  const columns = new Int32Array(kernel);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      for (let i = 0; i < kernel; i++)
        columns[i] = Math.min(w - 1, Math.max(0, bx * stride - pad + i));
      let n = 0;
      for (let j = 0; j < kernel; j++) {
        const row = Math.min(h - 1, Math.max(0, by * stride - pad + j)) * w;
        for (let i = 0; i < kernel; i++) values[n++] = data[row + columns[i]];
      }
      const v = stat(values, histogram);
      for (let y = by * stride; y < by * stride + stride; y++)
        out.fill(v, y * w + bx * stride, y * w + bx * stride + stride);
    }
  return out;
}
const BYTE_VALUES = 256;
type WindowStat = (values: Uint8Array, histogram: Uint16Array) => number;
/** Counts `values` into `histogram`; `release` empties it again for the next window. */
function count(values: Uint8Array, histogram: Uint16Array) {
  for (let i = 0; i < values.length; i++) histogram[values[i]]++;
}
function release(values: Uint8Array, histogram: Uint16Array) {
  for (let i = 0; i < values.length; i++) histogram[values[i]] = 0;
}
/** The value at sorted position `rank` of the counted window. */
function ranked(histogram: Uint16Array, rank: number): number {
  let seen = 0;
  for (let v = 0; v < BYTE_VALUES; v++) {
    seen += histogram[v];
    if (seen > rank) return v;
  }
  return BYTE_VALUES - 1;
}
/** torch.median: the lower median. */
const lowerMedian: WindowStat = (values, histogram) => {
  count(values, histogram);
  const median = ranked(histogram, (values.length - 1) >> 1);
  release(values, histogram);
  return median;
};
const minimum: WindowStat = (values) => {
  let v = values[0];
  for (let i = 1; i < values.length; i++) if (values[i] < v) v = values[i];
  return v;
};
const maximum: WindowStat = (values) => {
  let v = values[0];
  for (let i = 1; i < values.length; i++) if (values[i] > v) v = values[i];
  return v;
};
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** outline.expansion_weight(img, k=patch, stride, 9, 4) on interleaved RGB. */
function expansionWeight(rgb: Uint8Array, w: number, h: number): Float64Array {
  const lab = rgbToLab8(rgb);
  const lum = new Uint8Array(w * h);
  for (let i = 0; i < lum.length; i++) lum[i] = lab[i * 3];
  const k = PIXELOE_PATCH_SIZE;
  // The reference takes these statistics of L / 255; the order statistics commute with it.
  const median = chunkStat(lum, w, h, k * 2, WEIGHT_STRIDE, lowerMedian);
  const high = chunkStat(lum, w, h, k, WEIGHT_STRIDE, maximum);
  const low = chunkStat(lum, w, h, k, WEIGHT_STRIDE, minimum);
  const raw = new Float64Array(w * h);
  for (let i = 0; i < raw.length; i++) {
    const avg = median[i] / 255,
      bright = high[i] / 255 - avg,
      dark = avg - low[i] / 255;
    raw[i] = sigmoid((avg - 0.5) * AVG_SCALE - (bright - dark) * DIST_SCALE);
  }
  const hw = Math.floor(w / WEIGHT_STRIDE),
    hh = Math.floor(h / WEIGHT_STRIDE);
  const weight = resizeLinear64(resizeLinear64(raw, w, h, hw, hh), hw, hh, w, h);
  let lo = Infinity,
    hi = -Infinity;
  for (const v of weight) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  for (let i = 0; i < weight.length; i++) weight[i] = (weight[i] - lo) / hi;
  return weight;
}

/** outline.outline_expansion with a given weight (erode = dilate = thickness). */
function outlineExpansion(
  rgb: Uint8Array,
  w: number,
  h: number,
  weight: ArrayLike<number>,
  thickness: number,
): Uint8Array {
  const eroded = morph8(rgb, w, h, 3, MorphShape.Rect, true, thickness);
  const dilated = morph8(rgb, w, h, 3, MorphShape.Rect, false, thickness);
  const mixed = new Uint8Array(rgb.length);
  for (let p = 0; p < w * h; p++) {
    const wt = weight[p];
    const orig = sigmoid((wt - 0.5) * ORIGINAL_SLOPE) * ORIGINAL_MIX;
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c;
      const v = eroded[i] * wt + dilated[i] * (1 - wt);
      mixed[i] = Math.trunc(v * (1 - orig) + rgb[i] * orig);
    }
  }
  const once = morph8(mixed, w, h, 3, MorphShape.Cross, true, thickness);
  const twice = morph8(once, w, h, 3, MorphShape.Cross, false, thickness * 2);
  return morph8(twice, w, h, 3, MorphShape.Cross, true, thickness);
}

function labStats(lab: Float32Array) {
  const n = lab.length;
  const mean = f32(pairwiseSum32(lab) / n);
  const sq = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = f32(lab[i] - mean);
    sq[i] = f32(d * d);
  }
  return { mean, std: f32(Math.sqrt(f32(pairwiseSum32(sq) / n))) };
}

/** color.match_color(source, target, level=5) on interleaved RGB. */
function matchColor(source: Uint8Array, target: Uint8Array, w: number, h: number) {
  const toFloat = (rgb: Uint8Array) => Float32Array.from(rgbToLab8(rgb), (v) => f32(v / 255));
  const s = toFloat(source),
    t = toFloat(target);
  const ss = labStats(s),
    ts = labStats(t);
  const shifted = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const v = f32(f32(f32(f32(s[i] - ss.mean) / ss.std) * ts.std) + ts.mean);
    shifted[i] = Math.trunc(Math.min(255, Math.max(0, f32(v * 255))));
  }
  const rgb = labToRgb8(shifted);
  const out = new Uint8Array(rgb.length);
  const n = w * h;
  for (let c = 0; c < 3; c++) {
    let inp: Float32Array = new Float32Array(n);
    let tgt: Uint8Array = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      inp[i] = rgb[i * 3 + c];
      tgt[i] = target[i * 3 + c];
    }
    const high = new Float32Array(n);
    for (let level = 1; level <= COLOR_LEVELS; level++) {
      const size = 2 * 2 ** level + 1;
      const low = gaussianBlur32(inp, w, h, size, 0);
      for (let i = 0; i < n; i++) high[i] = f32(high[i] + f32(inp[i] - low[i]));
      inp = low;
      tgt = gaussianBlur8(tgt, w, h, size);
    }
    for (let i = 0; i < n; i++)
      out[i * 3 + c] = Math.trunc(Math.min(255, Math.max(0, f32(high[i] + tgt[i]))));
  }
  return out;
}

/** downscale.contrast_based.find_pixel over one patch of L values. */
const contrastPick: WindowStat = (values, histogram) => {
  const mid = values[values.length >> 1];
  count(values, histogram);
  const med = ranked(histogram, (values.length - 1) >> 1);
  release(values, histogram);
  let sum = 0,
    mini = values[0],
    maxi = values[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    sum += v;
    if (v < mini) mini = v;
    if (v > maxi) maxi = v;
  }
  const mu = f32(sum / values.length);
  if (med < mu && maxi - med > med - mini) return mini;
  if (med > mu && maxi - med < med - mini) return maxi;
  return mid;
};

/** downscale.contrast_based.contrast_based_downscale to an exact output size. */
function contrastDownscale(
  rgb: Uint8Array,
  w: number,
  h: number,
  ow: number,
  oh: number,
): Uint8Array {
  const patch = Math.max(Math.floor(h / oh), Math.floor(w / ow));
  const lab = rgbToLab8(rgb);
  const planes = [0, 1, 2].map((c) => Uint8Array.from({ length: w * h }, (_, i) => lab[i * 3 + c]));
  const picked = [
    chunkStat(planes[0], w, h, patch, patch, contrastPick),
    chunkStat(planes[1], w, h, patch, patch, lowerMedian),
    chunkStat(planes[2], w, h, patch, patch, lowerMedian),
  ];
  const merged = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) merged[i * 3 + c] = picked[c][i];
  return resizeNearest(labToRgb8(merged), w, h, 3, ow, oh);
}

/** Line pixels (value below `threshold * 255`) as the guide mask at working size. */
function guideMask(
  lines: Uint8Array,
  threshold: number,
  w: number,
  h: number,
  ww: number,
  wh: number,
): Float32Array {
  // NumPy compares a float32 array with a Python float in float32 (NEP 50), so both bounds are too.
  const cut = f32(threshold),
    coverage = f32(MASK_COVERAGE);
  const binary = new Float32Array(lines.length);
  for (let i = 0; i < lines.length; i++) binary[i] = f32(lines[i] / 255) < cut ? 1 : 0;
  const area = resizeArea32(binary, w, h, ww, wh);
  return area.map((v) => (v > coverage ? 1 : 0));
}

/** Interleaved RGB at the source size to interleaved RGB at the requested output size. */
export function legacyPixeloe(
  rgb: Uint8Array,
  w: number,
  h: number,
  options: LegacyPixeloeOptions,
): { rgb: Uint8Array; width: number; height: number } {
  const thickness = options.thickness ?? PIXELOE_DEFAULT_THICKNESS;
  const {
    work: [ww, wh],
    out: [ow, oh],
  } = legacyPixeloeSizes(w, h, options.width, options.height);
  const work = resizeLinear8(rgb, w, h, 3, ww, wh);
  let expanded = work;
  if (thickness > 0) {
    let weight: ArrayLike<number> = expansionWeight(work, ww, wh);
    const guide = options.guide;
    if (guide) {
      const mask =
        guide.threshold === null
          ? new Float32Array(ww * wh)
          : guideMask(guide.lines, guide.threshold, guide.width, guide.height, ww, wh);
      weight =
        guide.mode === LineGuideMode.Replace
          ? mask
          : Float64Array.from(weight, (v, i) => Math.max(v, mask[i]));
    }
    expanded = outlineExpansion(work, ww, wh, weight, thickness);
  }
  const matched = matchColor(expanded, work, ww, wh);
  return { rgb: contrastDownscale(matched, ww, wh, ow, oh), width: ow, height: oh };
}
