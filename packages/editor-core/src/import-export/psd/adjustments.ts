import { UINT8_MAX, type PixelBuffer } from "$/base";
import { mulUn8 } from "$/canvas";
import { sampleGradientColor } from "$/import-export/psd/fills";
import type {
  PsdAdjustment,
  PsdCurvePoint,
  PsdLevelsChannel,
  PsdSelectiveColorChannel,
} from "$/import-export/psd/model";

const RGBA_CHANNELS = 4;

// Reusable scratch slots to avoid allocating [r, g, b] / [h, s, l] tuples per pixel.
let hslH = 0;
let hslS = 0;
let hslL = 0;
let outRByte = 0;
let outGByte = 0;
let outBByte = 0;

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

function rgbToHslIntoScratch(r: number, g: number, b: number): void {
  const rn = r / UINT8_MAX;
  const gn = g / UINT8_MAX;
  const bn = b / UINT8_MAX;
  const max = rn >= gn ? (rn >= bn ? rn : bn) : gn >= bn ? gn : bn;
  const min = rn <= gn ? (rn <= bn ? rn : bn) : gn <= bn ? gn : bn;
  const l = (max + min) * 0.5;
  hslL = l;
  if (max === min) {
    hslH = 0;
    hslS = 0;
    return;
  }
  const d = max - min;
  hslS = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  hslH = h * 60;
}

function hslToRgbIntoScratch(h: number, s: number, l: number): void {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp01(s);
  const ll = clamp01(l);
  if (ss === 0) {
    const v = clampByte(ll * UINT8_MAX);
    outRByte = v;
    outGByte = v;
    outBByte = v;
    return;
  }
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c * 0.5;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 60) {
    r1 = c;
    g1 = x;
  } else if (hh < 120) {
    r1 = x;
    g1 = c;
  } else if (hh < 180) {
    g1 = c;
    b1 = x;
  } else if (hh < 240) {
    g1 = x;
    b1 = c;
  } else if (hh < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  outRByte = clampByte((r1 + m) * UINT8_MAX);
  outGByte = clampByte((g1 + m) * UINT8_MAX);
  outBByte = clampByte((b1 + m) * UINT8_MAX);
}

function buildLevelsLut(channel: PsdLevelsChannel | undefined): Uint8Array | null {
  if (!channel) return null;
  const lut = new Uint8Array(256);
  const inSpan = Math.max(1, channel.inputCeiling - channel.inputFloor);
  const outSpan = channel.outputCeiling - channel.outputFloor;
  const invGamma = 1 / Math.max(0.01, channel.gamma || 1);
  for (let i = 0; i < 256; i++) {
    const norm = clamp01((i - channel.inputFloor) / inSpan);
    const gammaed = Math.pow(norm, invGamma);
    lut[i] = clampByte(channel.outputFloor + gammaed * outSpan);
  }
  return lut;
}

function buildCurvesLut(points: readonly PsdCurvePoint[] | undefined): Uint8Array | null {
  if (!points || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.input - b.input);
  const n = sorted.length;
  const xs = sorted.map((p) => p.input);
  const ys = sorted.map((p) => p.output);

  // Monotone cubic Hermite (Fritsch-Carlson) for smooth, overshoot-free Photoshop curves.
  const m = new Float64Array(n);
  const d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = Math.max(1e-6, xs[i + 1] - xs[i]);
    d[i] = (ys[i + 1] - ys[i]) / dx;
  }
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) * 0.5;
  }

  const lut = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]) {
      lut[x] = clampByte(ys[0]);
      continue;
    }
    if (x >= xs[n - 1]) {
      lut[x] = clampByte(ys[n - 1]);
      continue;
    }
    let idx = 0;
    while (idx < n - 2 && x > xs[idx + 1]) idx++;
    const h = Math.max(1e-6, xs[idx + 1] - xs[idx]);
    const t = (x - xs[idx]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const val =
      (2 * t3 - 3 * t2 + 1) * ys[idx] +
      (t3 - 2 * t2 + t) * h * m[idx] +
      (-2 * t3 + 3 * t2) * ys[idx + 1] +
      (t3 - t2) * h * m[idx + 1];
    lut[x] = clampByte(val);
  }
  return lut;
}

function composeLuts(first: Uint8Array | null, second: Uint8Array | null): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i;
    if (first) v = first[v];
    if (second) v = second[v];
    lut[i] = v;
  }
  return lut;
}

function buildSingleChannelLut(adjustment: PsdAdjustment): Uint8Array | null {
  if (adjustment.type === "invert") {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) lut[i] = UINT8_MAX - i;
    return lut;
  }
  if (adjustment.type === "posterize") {
    const levels = Math.max(2, Math.min(255, Math.round(adjustment.levels)));
    const step = UINT8_MAX / (levels - 1);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      lut[i] = clampByte(Math.round((i / UINT8_MAX) * (levels - 1)) * step);
    }
    return lut;
  }
  if (adjustment.type === "brightness/contrast") {
    const lut = new Uint8Array(256);
    const br = adjustment.brightness;
    const ct = adjustment.contrast;
    if (adjustment.useLegacy) {
      const slope = ct >= 0 ? 1 / Math.max(0.01, 1 - ct / 100) : 1 + ct / 100;
      for (let i = 0; i < 256; i++) {
        lut[i] = clampByte((i + br - 127.5) * slope + 127.5);
      }
      return lut;
    }
    const bNorm = br / 150;
    const cNorm = ct / 100;
    const factor = 1 + cNorm * 0.5;
    for (let i = 0; i < 256; i++) {
      let x = i / UINT8_MAX;
      if (bNorm > 0) x = x + bNorm * x * (1 - x) * 1.4 + bNorm * 0.25 * (1 - x);
      else if (bNorm < 0) x = x + bNorm * x * (1 - x) * 1.4 + bNorm * 0.25 * x;
      x = clamp01(x);
      if (cNorm !== 0) x = clamp01((x - 0.5) * factor + 0.5);
      lut[i] = clampByte(x * UINT8_MAX);
    }
    return lut;
  }
  if (adjustment.type === "exposure") {
    const gain = Math.pow(2, adjustment.exposure);
    const invGamma = 1 / Math.max(0.01, adjustment.gamma || 1);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const c = i / UINT8_MAX;
      const lin = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      const adj = Math.pow(clamp01(lin * gain + adjustment.offset), invGamma);
      const srgb = adj <= 0.0031308 ? 12.92 * adj : 1.055 * Math.pow(adj, 1 / 2.4) - 0.055;
      lut[i] = clampByte(srgb * UINT8_MAX);
    }
    return lut;
  }
  return null;
}

function rangeWeight(hue: number, a: number, b: number, c: number, d: number): number {
  const spanAD = (((d - a) % 360) + 360) % 360;
  const pos = (((hue - a) % 360) + 360) % 360;
  if (pos >= spanAD) return 0;
  const spanAB = (((b - a) % 360) + 360) % 360;
  const spanAC = (((c - a) % 360) + 360) % 360;
  if (pos < spanAB) return spanAB > 0 ? pos / spanAB : 1;
  if (pos <= spanAC) return 1;
  const spanCD = Math.max(1e-6, spanAD - spanAC);
  return 1 - (pos - spanAC) / spanCD;
}

function adjustSelectiveComp(
  val: number,
  inkDelta: number,
  kDelta: number,
  isRelative: boolean,
): number {
  const c = 1 - val;
  const next = isRelative
    ? c + (inkDelta / 100) * (1 - c) + (kDelta / 100) * (1 - c)
    : c + inkDelta / 100 + kDelta / 100;
  return clamp01(1 - clamp01(next));
}

export function isSupportedAdjustment(adjustment: PsdAdjustment | undefined): boolean {
  return Boolean(adjustment && adjustment.type !== "unsupported");
}

/**
 * Applies a Photoshop adjustment layer to `pixels` at document offset `(originX, originY)`,
 * modulated by `opacity` (0..255) and an optional `maskIntensityAt(docX, docY)` callback.
 */
export function applyAdjustmentToPixels(
  pixels: PixelBuffer,
  originX: number,
  originY: number,
  adjustment: PsdAdjustment,
  opacity: number,
  maskIntensityAt?: (docX: number, docY: number) => number,
): PixelBuffer {
  if (adjustment.type === "unsupported" || opacity <= 0) return pixels;

  const out = new Uint8ClampedArray(pixels.data);
  const { width, height } = pixels;
  const fullOpacityNoMask = opacity === UINT8_MAX && !maskIntensityAt;

  // Fast path 1: Per-channel 256-entry LUT (Invert, Posterize, Brightness/Contrast, Exposure, Levels, Curves).
  let lutR: Uint8Array | null = buildSingleChannelLut(adjustment);
  let lutG: Uint8Array | null = lutR;
  let lutB: Uint8Array | null = lutR;

  if (!lutR && (adjustment.type === "levels" || adjustment.type === "curves")) {
    const rgbLut =
      adjustment.type === "levels"
        ? buildLevelsLut(adjustment.rgb)
        : buildCurvesLut(adjustment.rgb);
    const rLut =
      adjustment.type === "levels"
        ? buildLevelsLut(adjustment.red)
        : buildCurvesLut(adjustment.red);
    const gLut =
      adjustment.type === "levels"
        ? buildLevelsLut(adjustment.green)
        : buildCurvesLut(adjustment.green);
    const bLut =
      adjustment.type === "levels"
        ? buildLevelsLut(adjustment.blue)
        : buildCurvesLut(adjustment.blue);
    lutR = composeLuts(rLut, rgbLut);
    lutG = composeLuts(gLut, rgbLut);
    lutB = composeLuts(bLut, rgbLut);
  }

  if (lutR && lutG && lutB) {
    if (fullOpacityNoMask) {
      for (let at = 0; at < out.length; at += RGBA_CHANNELS) {
        if (out[at + 3] === 0) continue;
        out[at] = lutR[out[at]];
        out[at + 1] = lutG[out[at + 1]];
        out[at + 2] = lutB[out[at + 2]];
      }
      return { width, height, data: out };
    }
    for (let y = 0; y < height; y++) {
      const docY = originY + y;
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * RGBA_CHANNELS;
        if (out[at + 3] === 0) continue;
        const weight = maskIntensityAt
          ? mulUn8(opacity, maskIntensityAt(originX + x, docY))
          : opacity;
        if (weight === 0) continue;
        const r = out[at];
        const g = out[at + 1];
        const b = out[at + 2];
        const nr = lutR[r];
        const ng = lutG[g];
        const nb = lutB[b];
        if (weight === UINT8_MAX) {
          out[at] = nr;
          out[at + 1] = ng;
          out[at + 2] = nb;
        } else {
          const t = weight / UINT8_MAX;
          out[at] = clampByte(r + (nr - r) * t);
          out[at + 1] = clampByte(g + (ng - g) * t);
          out[at + 2] = clampByte(b + (nb - b) * t);
        }
      }
    }
    return { width, height, data: out };
  }

  // Fast path 2: Gradient Map 256×3 luminance LUT.
  if (adjustment.type === "gradient map") {
    const sorted = [...adjustment.colorStops].sort((a, b) => a.location - b.location);
    const mapR = new Uint8Array(256);
    const mapG = new Uint8Array(256);
    const mapB = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const lum = adjustment.reverse ? 1 - i / UINT8_MAX : i / UINT8_MAX;
      const [mr, mg, mb] = sampleGradientColor(sorted, lum);
      mapR[i] = mr;
      mapG[i] = mg;
      mapB[i] = mb;
    }
    for (let y = 0; y < height; y++) {
      const docY = originY + y;
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * RGBA_CHANNELS;
        if (out[at + 3] === 0) continue;
        const weight = maskIntensityAt
          ? mulUn8(opacity, maskIntensityAt(originX + x, docY))
          : opacity;
        if (weight === 0) continue;
        const r = out[at];
        const g = out[at + 1];
        const b = out[at + 2];
        const lumIdx = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const nr = mapR[lumIdx];
        const ng = mapG[lumIdx];
        const nb = mapB[lumIdx];
        if (weight === UINT8_MAX) {
          out[at] = nr;
          out[at + 1] = ng;
          out[at + 2] = nb;
        } else {
          const t = weight / UINT8_MAX;
          out[at] = clampByte(r + (nr - r) * t);
          out[at + 1] = clampByte(g + (ng - g) * t);
          out[at + 2] = clampByte(b + (nb - b) * t);
        }
      }
    }
    return { width, height, data: out };
  }

  // Fast path 3: Hoisted per-adjustment setup + zero-allocation pixel loop for multi-channel adjustments.
  const activeHueRanges =
    adjustment.type === "hue/saturation"
      ? (adjustment.ranges ?? []).filter(
          (range) => range.hue !== 0 || range.saturation !== 0 || range.lightness !== 0,
        )
      : undefined;
  let bwTintH = 0;
  let bwTintS = 0;
  const bwWeights =
    adjustment.type === "black & white"
      ? [
          adjustment.reds,
          adjustment.yellows,
          adjustment.greens,
          adjustment.cyans,
          adjustment.blues,
          adjustment.magentas,
        ]
      : undefined;
  if (adjustment.type === "black & white" && adjustment.useTint && adjustment.tintColor) {
    rgbToHslIntoScratch(adjustment.tintColor[0], adjustment.tintColor[1], adjustment.tintColor[2]);
    bwTintH = hslH;
    bwTintS = hslS;
  }
  const hasSelectiveActive =
    adjustment.type === "selective color"
      ? [
          adjustment.reds,
          adjustment.yellows,
          adjustment.greens,
          adjustment.cyans,
          adjustment.blues,
          adjustment.magentas,
          adjustment.whites,
          adjustment.neutrals,
          adjustment.blacks,
        ].some(
          (ch) => ch && (ch.cyan !== 0 || ch.magenta !== 0 || ch.yellow !== 0 || ch.black !== 0),
        )
      : false;
  if (adjustment.type === "selective color" && !hasSelectiveActive) {
    return { width, height, data: out };
  }

  const scSlots: (PsdSelectiveColorChannel | undefined)[] =
    adjustment.type === "selective color"
      ? [
          adjustment.reds,
          adjustment.yellows,
          adjustment.greens,
          adjustment.cyans,
          adjustment.blues,
          adjustment.magentas,
          adjustment.whites,
          adjustment.neutrals,
          adjustment.blacks,
        ]
      : [];
  const scWeights = new Float64Array(9);

  for (let y = 0; y < height; y++) {
    const docY = originY + y;
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * RGBA_CHANNELS;
      if (out[at + 3] === 0) continue;
      const weight = maskIntensityAt
        ? mulUn8(opacity, maskIntensityAt(originX + x, docY))
        : opacity;
      if (weight === 0) continue;
      const r = out[at];
      const g = out[at + 1];
      const b = out[at + 2];

      switch (adjustment.type) {
        case "threshold": {
          const v =
            Math.round(0.299 * r + 0.587 * g + 0.114 * b) >= adjustment.level ? UINT8_MAX : 0;
          outRByte = v;
          outGByte = v;
          outBByte = v;
          break;
        }
        case "hue/saturation": {
          if (adjustment.colorize) {
            const col = adjustment.colorization ?? adjustment.master;
            rgbToHslIntoScratch(r, g, b);
            const nl =
              col.lightness >= 0
                ? hslL + (1 - hslL) * (col.lightness / 100)
                : hslL * (1 + col.lightness / 100);
            hslToRgbIntoScratch(col.hue, col.saturation / 100, nl);
          } else {
            rgbToHslIntoScratch(r, g, b);
            let dH = adjustment.master.hue;
            let dS = adjustment.master.saturation;
            let dL = adjustment.master.lightness;
            if (activeHueRanges && activeHueRanges.length > 0 && hslS > 0) {
              for (let i = 0; i < activeHueRanges.length; i++) {
                const range = activeHueRanges[i];
                const w = rangeWeight(hslH, range.a, range.b, range.c, range.d);
                if (w > 0) {
                  dH += range.hue * w;
                  dS += range.saturation * w;
                  dL += range.lightness * w;
                }
              }
            }
            const nh = (((hslH + dH) % 360) + 360) % 360;
            const ns = dS >= 0 ? hslS + (1 - hslS) * (dS / 100) : hslS * (1 + dS / 100);
            const nl = dL >= 0 ? hslL + (1 - hslL) * (dL / 100) : hslL * (1 + dL / 100);
            hslToRgbIntoScratch(nh, ns, nl);
          }
          break;
        }
        case "vibrance": {
          rgbToHslIntoScratch(r, g, b);
          const vib = (adjustment.vibrance / 100) * (1 - hslS);
          const sat = adjustment.saturation / 100;
          const nextS = clamp01(hslS + vib * 0.5 + (sat >= 0 ? (1 - hslS) * sat : hslS * sat));
          hslToRgbIntoScratch(hslH, nextS, hslL);
          break;
        }
        case "black & white": {
          const rn = r / UINT8_MAX;
          const gn = g / UINT8_MAX;
          const bn = b / UINT8_MAX;
          const max = rn >= gn ? (rn >= bn ? rn : bn) : gn >= bn ? gn : bn;
          const min = rn <= gn ? (rn <= bn ? rn : bn) : gn <= bn ? gn : bn;
          let gray = min;
          if (max > min && bwWeights) {
            rgbToHslIntoScratch(r, g, b);
            const sector = (((hslH % 360) + 360) % 360) / 60;
            const i0 = Math.floor(sector) % 6;
            const i1 = (i0 + 1) % 6;
            const frac = sector - Math.floor(sector);
            const w = (bwWeights[i0] * (1 - frac) + bwWeights[i1] * frac) / 100;
            gray = min + (max - min) * w;
          }
          if (adjustment.useTint && adjustment.tintColor) {
            hslToRgbIntoScratch(bwTintH, bwTintS, gray);
          } else {
            const gByte = clampByte(gray * UINT8_MAX);
            outRByte = gByte;
            outGByte = gByte;
            outBByte = gByte;
          }
          break;
        }
        case "color balance": {
          const rn = r / UINT8_MAX;
          const gn = g / UINT8_MAX;
          const bn = b / UINT8_MAX;
          const max = rn >= gn ? (rn >= bn ? rn : bn) : gn >= bn ? gn : bn;
          const min = rn <= gn ? (rn <= bn ? rn : bn) : gn <= bn ? gn : bn;
          const lum = (max + min) * 0.5;
          const sw = clamp01(1 - lum * 2);
          const hw = clamp01((lum - 0.5) * 2);
          const mw = 1 - Math.abs(lum - 0.5) * 2;
          const dCr =
            (adjustment.shadows.cyanRed * sw +
              adjustment.midtones.cyanRed * mw +
              adjustment.highlights.cyanRed * hw) /
            200;
          const dMg =
            (adjustment.shadows.magentaGreen * sw +
              adjustment.midtones.magentaGreen * mw +
              adjustment.highlights.magentaGreen * hw) /
            200;
          const dYb =
            (adjustment.shadows.yellowBlue * sw +
              adjustment.midtones.yellowBlue * mw +
              adjustment.highlights.yellowBlue * hw) /
            200;
          outRByte = clampByte((rn + dCr) * UINT8_MAX);
          outGByte = clampByte((gn + dMg) * UINT8_MAX);
          outBByte = clampByte((bn + dYb) * UINT8_MAX);
          if (adjustment.preserveLuminosity) {
            rgbToHslIntoScratch(outRByte, outGByte, outBByte);
            hslToRgbIntoScratch(hslH, hslS, lum);
          }
          break;
        }
        case "channel mixer": {
          if (adjustment.monochrome) {
            const gCh = adjustment.gray;
            const v = clampByte(
              (r * gCh.red + g * gCh.green + b * gCh.blue) / 100 + (gCh.constant / 100) * UINT8_MAX,
            );
            outRByte = v;
            outGByte = v;
            outBByte = v;
          } else {
            const rc = adjustment.red;
            const gc = adjustment.green;
            const bc = adjustment.blue;
            outRByte = clampByte(
              (r * rc.red + g * rc.green + b * rc.blue) / 100 + (rc.constant / 100) * UINT8_MAX,
            );
            outGByte = clampByte(
              (r * gc.red + g * gc.green + b * gc.blue) / 100 + (gc.constant / 100) * UINT8_MAX,
            );
            outBByte = clampByte(
              (r * bc.red + g * bc.green + b * bc.blue) / 100 + (bc.constant / 100) * UINT8_MAX,
            );
          }
          break;
        }
        case "photo filter": {
          const d = clamp01(adjustment.density);
          const [fr, fg, fb] = adjustment.color;
          outRByte = clampByte(r * (1 - d) + mulUn8(r, fr) * d);
          outGByte = clampByte(g * (1 - d) + mulUn8(g, fg) * d);
          outBByte = clampByte(b * (1 - d) + mulUn8(b, fb) * d);
          if (adjustment.preserveLuminosity) {
            rgbToHslIntoScratch(r, g, b);
            const origL = hslL;
            rgbToHslIntoScratch(outRByte, outGByte, outBByte);
            hslToRgbIntoScratch(hslH, hslS, origL);
          }
          break;
        }
        case "selective color": {
          const rn = r / UINT8_MAX;
          const gn = g / UINT8_MAX;
          const bn = b / UINT8_MAX;
          const max = rn >= gn ? (rn >= bn ? rn : bn) : gn >= bn ? gn : bn;
          const min = rn <= gn ? (rn <= bn ? rn : bn) : gn <= bn ? gn : bn;
          const mid = rn + gn + bn - max - min;
          scWeights[0] = rn === max ? max - mid : 0;
          scWeights[1] = bn === min ? mid - min : 0;
          scWeights[2] = gn === max ? max - mid : 0;
          scWeights[3] = rn === min ? mid - min : 0;
          scWeights[4] = bn === max ? max - mid : 0;
          scWeights[5] = gn === min ? mid - min : 0;
          scWeights[6] = min > 0.5 ? (min - 0.5) * 2 : 0;
          scWeights[7] = max > 0 && min < 1 ? 1 - Math.abs(max - 0.5) - Math.abs(min - 0.5) : 0;
          scWeights[8] = max < 0.5 ? (0.5 - max) * 2 : 0;

          let outR = rn;
          let outG = gn;
          let outB = bn;
          const isRelative = adjustment.mode === "relative";
          for (let i = 0; i < 9; i++) {
            const w = scWeights[i];
            const ch = scSlots[i];
            if (w <= 0 || !ch) continue;
            if (ch.cyan === 0 && ch.magenta === 0 && ch.yellow === 0 && ch.black === 0) continue;
            const nr = adjustSelectiveComp(outR, ch.cyan, ch.black, isRelative);
            const ng = adjustSelectiveComp(outG, ch.magenta, ch.black, isRelative);
            const nb = adjustSelectiveComp(outB, ch.yellow, ch.black, isRelative);
            outR += (nr - outR) * w;
            outG += (ng - outG) * w;
            outB += (nb - outB) * w;
          }
          outRByte = clampByte(outR * UINT8_MAX);
          outGByte = clampByte(outG * UINT8_MAX);
          outBByte = clampByte(outB * UINT8_MAX);
          break;
        }
        default:
          outRByte = r;
          outGByte = g;
          outBByte = b;
          break;
      }

      if (weight === UINT8_MAX) {
        out[at] = outRByte;
        out[at + 1] = outGByte;
        out[at + 2] = outBByte;
      } else {
        const t = weight / UINT8_MAX;
        out[at] = clampByte(r + (outRByte - r) * t);
        out[at + 1] = clampByte(g + (outGByte - g) * t);
        out[at + 2] = clampByte(b + (outBByte - b) * t);
      }
    }
  }
  return { width, height, data: out };
}
