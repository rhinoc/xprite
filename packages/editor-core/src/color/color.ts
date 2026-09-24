import { UINT8_MAX } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";

export function rgbaToHex(value: readonly number[]): string {
  const [r, g, b, a = UINT8_MAX] = value;
  return (
    "#" +
    [r, g, b, ...(a < UINT8_MAX ? [a] : [])]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
export function hexToRgba(value: string): Rgba {
  const hex = value.replace(/^#/, "");
  if (!/^(?:[\da-f]{6}|[\da-f]{8})$/i.test(hex))
    throw new Error("Expected RGB or RGBA hexadecimal color");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
    hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : UINT8_MAX,
  ];
}

/** HSV stores hue in degrees and saturation/value in the 0..1 range. */
export type Hsva = readonly [number, number, number, number];
/** HSL stores hue in degrees and saturation/lightness in the 0..1 range. */
export type Hsla = readonly [number, number, number, number];
export function rgbaToHsva([red, green, blue, alpha = UINT8_MAX]: readonly number[]): Hsva {
  const r = red / UINT8_MAX,
    g = green / UINT8_MAX,
    b = blue / UINT8_MAX;
  const high = Math.max(r, g, b),
    low = Math.min(r, g, b),
    delta = high - low;
  const sector = !delta
    ? 0
    : high === r
      ? (g - b) / delta
      : high === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return [(((sector * 60) % 360) + 360) % 360, high ? delta / high : 0, high, alpha];
}
export function hsvaToRgba([hue, saturation, value, alpha = UINT8_MAX]: readonly number[]): Rgba {
  const h = (((hue % 360) + 360) % 360) / 60;
  const s = Math.max(0, Math.min(1, saturation)),
    v = Math.max(0, Math.min(1, value));
  const component = (n: number) => {
    const k = (n + h) % 6;
    return Math.round(UINT8_MAX * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [
    component(5),
    component(3),
    component(1),
    Math.round(Math.max(0, Math.min(UINT8_MAX, alpha))),
  ];
}
export function rgbaToHsla([red, green, blue, alpha = UINT8_MAX]: readonly number[]): Hsla {
  const r = red / UINT8_MAX,
    g = green / UINT8_MAX,
    b = blue / UINT8_MAX;
  const high = Math.max(r, g, b),
    low = Math.min(r, g, b),
    delta = high - low,
    lightness = (high + low) / 2;
  const sector = !delta
    ? 0
    : high === r
      ? (g - b) / delta
      : high === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return [
    (((sector * 60) % 360) + 360) % 360,
    delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0,
    lightness,
    alpha,
  ];
}
export function hslaToRgba([
  hue,
  saturation,
  lightness,
  alpha = UINT8_MAX,
]: readonly number[]): Rgba {
  const h = (((hue % 360) + 360) % 360) / 60;
  const s = Math.max(0, Math.min(1, saturation)),
    l = Math.max(0, Math.min(1, lightness));
  const chroma = (1 - Math.abs(2 * l - 1)) * s,
    x = chroma * (1 - Math.abs((h % 2) - 1)),
    m = l - chroma / 2;
  const [r, g, b] =
    h < 1
      ? [chroma, x, 0]
      : h < 2
        ? [x, chroma, 0]
        : h < 3
          ? [0, chroma, x]
          : h < 4
            ? [0, x, chroma]
            : h < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return [
    Math.round(UINT8_MAX * (r + m)),
    Math.round(UINT8_MAX * (g + m)),
    Math.round(UINT8_MAX * (b + m)),
    Math.round(Math.max(0, Math.min(UINT8_MAX, alpha))),
  ];
}
export enum ColorChannel {
  Red = "r",
  Green = "g",
  Blue = "b",
  Hue = "h",
  Saturation = "s",
  Value = "v",
  Lightness = "l",
  Gray = "gray",
  Alpha = "a",
}
export function colorChannelValue(
  color: Rgba,
  channel: ColorChannel,
  rememberedHue?: number,
): number {
  if (channel === ColorChannel.Red) return color[0];
  if (channel === ColorChannel.Green) return color[1];
  if (channel === ColorChannel.Blue) return color[2];
  if (channel === ColorChannel.Alpha) return color[3];
  if (channel === ColorChannel.Gray) return Math.max(color[0], color[1], color[2]);
  const hsv = rgbaToHsva(color);
  if (channel === ColorChannel.Hue) return hsv[1] === 0 ? (rememberedHue ?? hsv[0]) : hsv[0];
  if (channel === ColorChannel.Lightness) return rgbaToHsla(color)[2] * 100;
  return (channel === ColorChannel.Saturation ? hsv[1] : hsv[2]) * 100;
}
export function setColorChannel(
  color: Rgba,
  channel: ColorChannel,
  value: number,
  rememberedHue?: number,
): Rgba {
  const max =
    channel === ColorChannel.Hue
      ? 360
      : channel === ColorChannel.Saturation ||
          channel === ColorChannel.Value ||
          channel === ColorChannel.Lightness
        ? 100
        : UINT8_MAX;
  value = Math.max(0, Math.min(max, value));
  if (channel === ColorChannel.Gray) {
    const result = [...color] as [number, number, number, number];
    result[0] = result[1] = result[2] = Math.round(value);
    return result;
  }
  const rgbIndex = { r: 0, g: 1, b: 2, a: 3 }[
    channel as ColorChannel.Red | ColorChannel.Green | ColorChannel.Blue | ColorChannel.Alpha
  ];
  if (rgbIndex !== undefined) {
    const result = [...color] as [number, number, number, number];
    result[rgbIndex] = Math.round(value);
    return result;
  }
  if (channel === ColorChannel.Lightness) {
    const hsl = [...rgbaToHsla(color)] as [number, number, number, number];
    hsl[2] = value / 100;
    return hslaToRgba(hsl);
  }
  const hsv = [...rgbaToHsva(color)];
  if (hsv[1] === 0 && rememberedHue !== undefined) hsv[0] = rememberedHue;
  hsv[channel === ColorChannel.Hue ? 0 : channel === ColorChannel.Saturation ? 1 : 2] =
    channel === ColorChannel.Hue ? value : value / 100;
  return hsvaToRgba(hsv);
}

export function setHslaChannel(
  color: Hsla,
  channel: ColorChannel.Hue | ColorChannel.Saturation | ColorChannel.Lightness | ColorChannel.Alpha,
  value: number,
): Hsla {
  const next = [...color] as [number, number, number, number];
  const index = { h: 0, s: 1, l: 2, a: 3 }[channel];
  const max = channel === ColorChannel.Hue ? 360 : channel === ColorChannel.Alpha ? UINT8_MAX : 100;
  next[index] =
    Math.max(0, Math.min(max, value)) /
    (channel === ColorChannel.Saturation || channel === ColorChannel.Lightness ? 100 : 1);
  return next;
}

export function setHsvaChannel(
  color: Hsva,
  channel: ColorChannel.Hue | ColorChannel.Saturation | ColorChannel.Value | ColorChannel.Alpha,
  value: number,
): Hsva {
  const next = [...color] as [number, number, number, number];
  const index = { h: 0, s: 1, v: 2, a: 3 }[channel];
  const max = channel === ColorChannel.Hue ? 360 : channel === ColorChannel.Alpha ? UINT8_MAX : 100;
  next[index] =
    Math.max(0, Math.min(max, value)) /
    (channel === ColorChannel.Saturation || channel === ColorChannel.Value ? 100 : 1);
  return next;
}
