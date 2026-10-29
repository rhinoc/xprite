/** sRGB <-> CIE L*a*b* (D65), channels 0-255 in and out. */
const WHITE = [0.95047, 1, 1.08883] as const;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
/** 8-bit sRGB to linear light, tabulated: the pow() per channel dominated whole-image conversions. */
const LINEAR = Float64Array.from({ length: 256 }, (_, v) => toLinear(v));
const fromLinear = (c: number) =>
  Math.round(
    255 * Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)),
  );
const forward = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const inverse = (f: number) => (f ** 3 > EPSILON ? f ** 3 : (116 * f - 16) / KAPPA);

export type Lab = [l: number, a: number, b: number];

export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = LINEAR[r] ?? toLinear(r),
    lg = LINEAR[g] ?? toLinear(g),
    lb = LINEAR[b] ?? toLinear(b);
  const x = forward((0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / WHITE[0]);
  const y = forward(0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb);
  const z = forward((0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / WHITE[2]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function labToRgb(l: number, a: number, b: number): [number, number, number] {
  const fy = (l + 16) / 116;
  const x = inverse(fy + a / 500) * WHITE[0];
  const y = inverse(fy);
  const z = inverse(fy - b / 200) * WHITE[2];
  return [
    fromLinear(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    fromLinear(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    fromLinear(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

/**
 * CIEDE2000 color difference (ΔE₀₀) between two Lab colors.
 * Returns perceptual distance; lower is more similar.
 */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const [l1, a1, b1] = lab1;
  const [l2, a2, b2] = lab2;
  const dL = l2 - l1;
  const lBar = (l1 + l2) / 2;
  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 6103515625))); // 25^7 = 6103515625
  const a1p = a1 * (1 + g);
  const a2p = a2 * (1 + g);
  const c1p = Math.sqrt(a1p * a1p + b1 * b1);
  const c2p = Math.sqrt(a2p * a2p + b2 * b2);
  const cBarP = (c1p + c2p) / 2;
  const dCp = c2p - c1p;
  let h1p = 0,
    h2p = 0;
  if (c1p !== 0) h1p = (Math.atan2(b1, a1p) * 180) / Math.PI;
  if (h1p < 0) h1p += 360;
  if (c2p !== 0) h2p = (Math.atan2(b2, a2p) * 180) / Math.PI;
  if (h2p < 0) h2p += 360;
  const dhp =
    c1p === 0 || c2p === 0
      ? 0
      : Math.abs(h2p - h1p) <= 180
        ? h2p - h1p
        : h2p <= h1p
          ? h2p - h1p + 360
          : h2p - h1p - 360;
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp * Math.PI) / 360);
  const hBarP =
    c1p === 0 || c2p === 0
      ? h1p + h2p
      : Math.abs(h2p - h1p) <= 180
        ? (h1p + h2p) / 2
        : h1p + h2p < 360
          ? (h1p + h2p + 360) / 2
          : (h1p + h2p - 360) / 2;
  const t =
    1 -
    0.17 * Math.cos(((hBarP - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hBarP * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hBarP + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hBarP - 63) * Math.PI) / 180);
  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + 6103515625));
  const rT = -rC * Math.sin((2 * dTheta * Math.PI) / 180);
  const kL = 1,
    kC = 1,
    kH = 1;
  return Math.sqrt(
    (dL / (kL * sL)) ** 2 +
      (dCp / (kC * sC)) ** 2 +
      (dHp / (kH * sH)) ** 2 +
      rT * (dCp / (kC * sC)) * (dHp / (kH * sH)),
  );
}
