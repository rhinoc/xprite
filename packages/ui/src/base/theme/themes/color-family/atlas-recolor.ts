import { hexToRgb, oklchToHex, rgbToOklch } from "$/base/theme/oklch";
import type { UiColorScheme, UiPartDefinition } from "$/base/theme/theme-types";
import { rotateColor, type ColorFamily } from "$/base/theme/themes/color-family/families";

/** Parts whose colors carry meaning of their own: cursors, color-mode icons and the mascot. */
const FIXED_PART = /^(cursor_|icon_rgb$|icon_indexed$|aseprite_face|warning_box$)/;

export interface AtlasPixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

function partSize(part: UiPartDefinition): [number, number] {
  return [
    part.w ?? (part.w1 ?? 0) + (part.w2 ?? 0) + (part.w3 ?? 0),
    part.h ?? (part.h1 ?? 0) + (part.h2 ?? 0) + (part.h3 ?? 0),
  ];
}

function fixedPixels(
  pixels: AtlasPixels,
  parts: Readonly<Record<string, UiPartDefinition>>,
): Uint8Array {
  const fixed = new Uint8Array(pixels.width * pixels.height);
  for (const [name, part] of Object.entries(parts)) {
    if (!FIXED_PART.test(name)) continue;
    const [width, height] = partSize(part);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) fixed[(part.y + y) * pixels.width + part.x + x] = 1;
  }
  return fixed;
}

/**
 * Turn the Aseprite atlas to the family hue with the same rule as the color keys.
 * A pixel drawn in a key's classic color takes that key's final color, so artwork and
 * interface colors stay identical after contrast fitting.
 */
export function recolorAtlas(
  pixels: AtlasPixels,
  parts: Readonly<Record<string, UiPartDefinition>>,
  classicColors: Readonly<Record<string, string>>,
  familyColors: Readonly<Record<string, string>>,
  family: ColorFamily,
  colorScheme: UiColorScheme,
) {
  const keyed = new Map<string, string>();
  for (const [key, value] of Object.entries(classicColors))
    if (familyColors[key] && !keyed.has(value.toLowerCase()))
      keyed.set(value.toLowerCase(), familyColors[key]);
  const fixed = fixedPixels(pixels, parts);
  const cache = new Map<number, readonly [number, number, number]>();
  const { data } = pixels;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (!data[offset + 3] || fixed[offset / 4]) continue;
    const key = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
    let rgb = cache.get(key);
    if (!rgb) {
      const source = `#${key.toString(16).padStart(6, "0")}`;
      const target =
        keyed.get(source) ??
        oklchToHex(
          rotateColor(
            rgbToOklch([data[offset], data[offset + 1], data[offset + 2]]),
            family,
            colorScheme,
          ),
        );
      rgb = hexToRgb(target);
      cache.set(key, rgb);
    }
    data[offset] = rgb[0];
    data[offset + 1] = rgb[1];
    data[offset + 2] = rgb[2];
  }
}
