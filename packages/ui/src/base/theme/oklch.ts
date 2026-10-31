/** OKLCH conversion with sRGB gamut mapping by chroma reduction. */
export interface Oklch {
  /** Perceived lightness, 0–1. */
  readonly l: number;
  /** Chroma, 0 to about 0.37 for sRGB. */
  readonly c: number;
  /** Hue angle in degrees. */
  readonly h: number;
}

export type Rgb = readonly [number, number, number];

const ACHROMATIC_CHROMA = 1e-4;
const GAMUT_EPSILON = 1e-4;
const GAMUT_SEARCH_STEPS = 20;
const DEGREES = 180 / Math.PI;

const toLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const toGamma = (value: number) =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
const unit = (value: number) => Math.min(1, Math.max(0, value));

export function oklch(l: number, c: number, h: number): Oklch {
  return { l, c, h };
}

export function rgbToOklch([red, green, blue]: Rgb): Oklch {
  const r = toLinear(red / 255);
  const g = toLinear(green / 255);
  const b = toLinear(blue / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, bAxis);
  return {
    l: lightness,
    c: chroma,
    h: chroma < ACHROMATIC_CHROMA ? 0 : (Math.atan2(bAxis, a) * DEGREES + 360) % 360,
  };
}

function linearRgb({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos(h / DEGREES);
  const b = c * Math.sin(h / DEGREES);
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);

/** The highest chroma that sRGB can show at this lightness and hue. */
export function maxChroma(l: number, h: number): number {
  let low = 0;
  let high = 0.4;
  for (let step = 0; step < GAMUT_SEARCH_STEPS; step++) {
    const middle = (low + high) / 2;
    if (inGamut(linearRgb({ l, c: middle, h }))) low = middle;
    else high = middle;
  }
  return low;
}

/** Keep lightness and hue; reduce chroma until the color fits sRGB. */
function oklchToRgb(color: Oklch): Rgb {
  let mapped: Oklch = { l: unit(color.l), c: Math.max(0, color.c), h: color.h };
  if (!inGamut(linearRgb(mapped))) {
    let low = 0;
    let high = mapped.c;
    for (let step = 0; step < GAMUT_SEARCH_STEPS; step++) {
      const middle = (low + high) / 2;
      if (inGamut(linearRgb({ ...mapped, c: middle }))) low = middle;
      else high = middle;
    }
    mapped = { ...mapped, c: low };
  }
  const [r, g, b] = linearRgb(mapped);
  return [r, g, b].map((v) => Math.round(unit(toGamma(unit(v))) * 255)) as unknown as Rgb;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((digit) => digit + digit).join("") : value;
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as unknown as Rgb;
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export const hexToOklch = (hex: string) => rgbToOklch(hexToRgb(hex));
export const oklchToHex = (color: Oklch) => rgbToHex(oklchToRgb(color));

function relativeLuminance(rgb: Rgb) {
  const [r, g, b] = rgb.map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two colors after gamut mapping. */
export function contrastRatio(first: Oklch, second: Oklch): number {
  const a = relativeLuminance(oklchToRgb(first));
  const b = relativeLuminance(oklchToRgb(second));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function hueDistance(first: number, second: number): number {
  const distance = Math.abs(first - second) % 360;
  return Math.min(distance, 360 - distance);
}
