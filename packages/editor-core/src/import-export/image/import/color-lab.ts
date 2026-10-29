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
