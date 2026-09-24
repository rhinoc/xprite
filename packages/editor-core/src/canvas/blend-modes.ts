import { UINT8_MAX } from "$/base/numeric-constants";
/** Port of MIT-licensed doc/blend_funcs.cpp (Igara Studio/David Capello).
 * Keep integer rounding and the default new-blend two-stage merge exact. */
export const BLEND_MODES = [
  "Normal",
  "Multiply",
  "Screen",
  "Overlay",
  "Darken",
  "Lighten",
  "Color Dodge",
  "Color Burn",
  "Hard Light",
  "Soft Light",
  "Difference",
  "Exclusion",
  "Hue",
  "Saturation",
  "Color",
  "Luminosity",
  "Addition",
  "Subtract",
  "Divide",
] as const;
export const mulUn8 = (a: number, b: number) => {
  const t = a * b + 128;
  return ((t >> 8) + t) >> 8;
};
const divUn8 = (a: number, b: number) => Math.trunc((a * UINT8_MAX + (b >> 1)) / b);
const hard = (b: number, s: number) =>
  s < 128 ? mulUn8(b, s * 2) : b + s * 2 - UINT8_MAX - mulUn8(b, s * 2 - UINT8_MAX);
function channel(b: number, s: number, mode: number): number {
  switch (mode) {
    case 1:
      return mulUn8(b, s);
    case 2:
      return b + s - mulUn8(b, s);
    case 3:
      return hard(s, b);
    case 4:
      return Math.min(b, s);
    case 5:
      return Math.max(b, s);
    case 6:
      return b === 0 ? 0 : b >= UINT8_MAX - s ? UINT8_MAX : divUn8(b, UINT8_MAX - s);
    case 7:
      return b === UINT8_MAX
        ? UINT8_MAX
        : UINT8_MAX - b >= s
          ? 0
          : UINT8_MAX - divUn8(UINT8_MAX - b, s);
    case 8:
      return hard(b, s);
    case 9: {
      const B = b / UINT8_MAX,
        S = s / UINT8_MAX,
        d = B <= 0.25 ? ((16 * B - 12) * B + 4) * B : Math.sqrt(B);
      return Math.floor(
        (S <= 0.5 ? B - (1 - 2 * S) * B * (1 - B) : B + (2 * S - 1) * (d - B)) * UINT8_MAX + 0.5,
      );
    }
    case 10:
      return Math.abs(b - s);
    case 11:
      return b + s - 2 * mulUn8(b, s);
    case 16:
      return Math.min(UINT8_MAX, b + s);
    case 17:
      return Math.max(0, b - s);
    case 18:
      return b === 0 ? 0 : b >= s ? UINT8_MAX : divUn8(b, s);
    default:
      return s;
  }
}
const lum = (v: number[]) => 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2];
const sat = (v: number[]) => Math.max(...v) - Math.min(...v);
function setSat(v: number[], s: number) {
  const n = Math.min(...v),
    r = Math.max(...v) - n;
  return v.map((x) => (r > 0 ? ((x - n) * s) / r : 0));
}
function setLum(v: number[], l: number) {
  const d = l - lum(v);
  v = v.map((x) => x + d);
  const n = Math.min(...v),
    x = Math.max(...v);
  if (n < 0) v = v.map((c) => l + ((c - l) * l) / (l - n));
  if (x > 1) v = v.map((c) => l + ((c - l) * (1 - l)) / (x - l));
  return v;
}
export function blendNormalAt(
  d: Uint8ClampedArray,
  at: number,
  s: Uint8ClampedArray,
  from: number,
  opacity: number,
) {
  const ba = d[at + 3],
    sa = mulUn8(s[from + 3], opacity);
  if (!ba || sa === UINT8_MAX) {
    d[at] = s[from];
    d[at + 1] = s[from + 1];
    d[at + 2] = s[from + 2];
    d[at + 3] = sa;
    return;
  }
  if (!s[from + 3]) return;
  const a = sa + ba - mulUn8(ba, sa);
  for (let c = 0; c < 3; c++) d[at + c] += Math.trunc(((s[from + c] - d[at + c]) * sa) / a);
  d[at + 3] = a;
}
export function blendAt(
  d: Uint8ClampedArray,
  at: number,
  s: Uint8ClampedArray,
  from: number,
  opacity: number,
  mode = 0,
) {
  const ba = d[at + 3],
    sourceAlpha = s[from + 3];
  if (mode === 0 || !ba) {
    blendNormalAt(d, at, s, from, opacity);
    return;
  }
  if (!sourceAlpha) return;
  const sa = mulUn8(sourceAlpha, opacity),
    alpha = sa + ba - mulUn8(ba, sa),
    compositeAlpha = mulUn8(ba, sa);
  let hsl: number[] | undefined;
  if (mode >= 12 && mode <= 15) {
    const b = [d[at] / UINT8_MAX, d[at + 1] / UINT8_MAX, d[at + 2] / UINT8_MAX],
      v = [s[from] / UINT8_MAX, s[from + 1] / UINT8_MAX, s[from + 2] / UINT8_MAX];
    if (mode === 12) hsl = setLum(setSat(v, sat(b)), lum(b));
    else if (mode === 13) hsl = setLum(setSat(b, sat(v)), lum(b));
    else if (mode === 14) hsl = setLum(v, lum(b));
    else hsl = setLum(b, lum(v));
  }
  // Aseprite new-blend merges share the same alpha. Evaluating their channels
  // directly avoids allocating six tiny typed arrays for every display pixel.
  for (let c = 0; c < 3; c++) {
    const back = d[at + c],
      src = s[from + c],
      mixed = hsl
        ? Math.max(0, Math.min(UINT8_MAX, Math.trunc(hsl[c] * UINT8_MAX)))
        : channel(back, src, mode);
    const normal = back + Math.trunc(((src - back) * sa) / alpha),
      blended = back + Math.trunc(((mixed - back) * sa) / alpha);
    const first = normal + mulUn8(blended - normal, ba);
    d[at + c] = first + mulUn8(blended - first, compositeAlpha);
  }
  d[at + 3] = alpha;
}
/** doc::BlenderHelper skips the image mask value (packed RGBA0) before
 * invoking the blend function. Hidden nonzero RGB at alpha0 is still data. */
export function blendImageAt(
  d: Uint8ClampedArray,
  at: number,
  s: Uint8ClampedArray,
  from: number,
  opacity: number,
  mode = 0,
) {
  if (s[from] || s[from + 1] || s[from + 2] || s[from + 3]) blendAt(d, at, s, from, opacity, mode);
}
