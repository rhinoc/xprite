import { hsvaToRgba } from "@xprite/editor-core";
import type { Rgba } from "@xprite/editor-core";
import { UINT8_MAX } from "@xprite/editor-core";

/** ColorSelector::getColorByPosition / ColorTintShadeTone color formulas. */
export function asepriteColorHoverSample(
  area: "main" | "hue" | "alpha",
  current: Rgba,
  hue: number,
  saturation: number,
  value: number,
  u: number,
  v: number,
  width: number,
  height: number,
): Rgba {
  const axis = Math.max(0, Math.min(1, u / Math.max(1, width - 1)));
  if (area === "alpha") return [current[0], current[1], current[2], Math.trunc(UINT8_MAX * axis)];
  if (area === "hue") return hsvaToRgba([360 * axis, saturation, value, current[3]]);
  const brightness = 1 - Math.max(0, Math.min(1, v / Math.max(1, height - 1)));
  return hsvaToRgba([360 * hue, axis, brightness, current[3]]);
}

export function asepriteColorHoverDescription(
  area: "main" | "hue" | "alpha",
  color: Rgba,
  hue: number,
  saturation: number,
  value: number,
  u: number,
  v: number,
  width: number,
  height: number,
): string | undefined {
  if (area === "alpha") return undefined;
  const axis = Math.max(0, Math.min(1, u / Math.max(1, width - 1))),
    h = area === "hue" ? 360 * axis : 360 * hue,
    s = area === "main" ? axis : saturation,
    brightness =
      area === "main" ? 1 - Math.max(0, Math.min(1, v / Math.max(1, height - 1))) : value;
  return `HSV ${Math.trunc(h)}° ${Math.trunc(s * 100)}% ${Math.trunc(brightness * 100)}% (RGB ${color[0]} ${color[1]} ${color[2]})`;
}
