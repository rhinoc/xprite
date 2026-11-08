import { UINT8_MAX } from "$/base";

export type Lab = readonly [number, number, number];
const SRGB_LINEAR = Float64Array.from({ length: UINT8_MAX + 1 }, (_, value) => {
  const channel = value / UINT8_MAX;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});
const D65 = [0.95047, 1, 1.08883] as const;
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;
const labPivot = (value: number) =>
  value > LAB_EPSILON ? Math.cbrt(value) : (LAB_KAPPA * value + 16) / 116;

/** Convert sRGB bytes to CIELAB using a D65 white point. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = SRGB_LINEAR[r],
    lg = SRGB_LINEAR[g],
    lb = SRGB_LINEAR[b];
  const x = labPivot((lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / D65[0]);
  const y = labPivot((lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) / D65[1]);
  const z = labPivot((lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / D65[2]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
