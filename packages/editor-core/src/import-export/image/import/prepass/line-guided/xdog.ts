import {
  gaussianBlur32,
  gaussianSize,
  rgbToGray8,
} from "$/import-export/image/import/prepass/line-guided/cv-ops";

/**
 * XDoG line drawing (Winnemöller 2012) with the parameters of the reference: sigma 0.8, k 1.6,
 * p 20, eps 0, phi 10, on the 8-bit grey image. White (255) is paper, darker values are lines.
 */
const XDOG_SIGMA = 0.8;
const XDOG_K = 1.6;
const XDOG_P = 20;
const XDOG_PHI = 10;
const f32 = Math.fround;

/** One byte per pixel: 255 = no line, lower = line. */
export function xdogLines(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const gray = rgbToGray8(rgb);
  const g = new Float32Array(gray.length);
  for (let i = 0; i < g.length; i++) g[i] = f32(gray[i] / 255);
  const sigmaB = XDOG_SIGMA * XDOG_K;
  const a = gaussianBlur32(g, width, height, gaussianSize(XDOG_SIGMA), XDOG_SIGMA);
  const b = gaussianBlur32(g, width, height, gaussianSize(sigmaB), sigmaB);
  const out = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) {
    const d = f32(f32((1 + XDOG_P) * a[i]) - f32(XDOG_P * b[i]));
    const v = d >= 0 ? 1 : f32(1 + f32(Math.tanh(f32(XDOG_PHI * d))));
    out[i] = Math.trunc(f32(Math.min(1, Math.max(0, v)) * 255));
  }
  return out;
}

/**
 * skimage `threshold_otsu` of `line / 255` (256 bins over the value range), as a 0..1 threshold.
 * Returns null when the image has a single value.
 */
export function otsuThreshold(line: Uint8Array): number | null {
  let lo = 255,
    hi = 0;
  for (const v of line) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === hi) return null;
  const bins = 256;
  const first = lo / 255,
    last = hi / 255;
  const counts = new Float64Array(bins);
  const norm = bins / (last - first);
  for (const v of line) {
    const x = v / 255;
    let i = Math.floor((x - first) * norm);
    if (i === bins) i--;
    counts[i]++;
  }
  const width = (last - first) / bins;
  const centres = new Float64Array(bins);
  for (let i = 0; i < bins; i++) {
    const left = first + i * width,
      right = i === bins - 1 ? last : first + (i + 1) * width;
    centres[i] = (left + right) / 2;
  }
  const w1 = new Float64Array(bins),
    m1 = new Float64Array(bins),
    w2 = new Float64Array(bins),
    m2 = new Float64Array(bins);
  let cw = 0,
    cs = 0;
  for (let i = 0; i < bins; i++) {
    cw += counts[i];
    cs += counts[i] * centres[i];
    w1[i] = cw;
    m1[i] = cs / cw;
  }
  cw = 0;
  cs = 0;
  for (let i = bins - 1; i >= 0; i--) {
    cw += counts[i];
    cs += counts[i] * centres[i];
    w2[i] = cw;
    m2[i] = cs / cw;
  }
  let best = -1,
    index = 0;
  for (let i = 0; i < bins - 1; i++) {
    const v = w1[i] * w2[i + 1] * (m1[i] - m2[i + 1]) ** 2;
    if (v > best) {
      best = v;
      index = i;
    }
  }
  return centres[index];
}
