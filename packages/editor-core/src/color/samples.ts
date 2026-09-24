import type { AsepriteImageSamples } from "$/base/image";
import { UINT8_MAX, UINT16_VALUE_COUNT, BITS_PER_BYTE } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import type { AsepritePalette } from "$/import-export/aseprite/model";

export type { AsepriteImageSamples } from "$/base/image";
export const paletteForColors = (colors: readonly Rgba[] | undefined): AsepritePalette => ({
  entries: (colors ?? []).map(([red, green, blue, alpha]) => ({ red, green, blue, alpha })),
});
const MISSING_PALETTE_COLOR: Rgba = [0, 0, 0, 0];
const INDEXED_PALETTE_SIZE = UINT8_MAX + 1;

/** Indexed samples can address only the first 256 entries of a larger color bank. */
export function indexedPaletteColorIndex(
  color: Rgba,
  palette: readonly Rgba[],
  preferredIndex?: number,
  maskIndex = 0,
): number {
  const size = Math.min(INDEXED_PALETTE_SIZE, palette.length);
  if (
    preferredIndex !== undefined &&
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < size
  )
    return preferredIndex;
  for (let index = 0; index < size; index++)
    if (palette[index].every((value, channel) => value === color[channel])) return index;
  return asepriteBestFit(...color, paletteForColors(palette), maskIndex);
}
/** Preserve unchanged Aseprite palette indices even when colors are duplicated. */
export function encodeAsepriteSamples(
  pixels: PixelBuffer,
  depth: 8 | 16,
  palette: AsepritePalette,
  maskIndex: number,
  previous?: AsepriteImageSamples,
): AsepriteImageSamples {
  const compatible =
    previous?.depth === depth &&
    previous.width === pixels.width &&
    previous.height === pixels.height;
  let data = compatible
      ? previous!.data
      : new Uint8Array(pixels.width * pixels.height * (depth / BITS_PER_BYTE)),
    changed = !compatible;
  const own = () => {
    if (compatible && data === previous!.data) data = data.slice();
  };
  for (let i = 0; i < pixels.width * pixels.height; i++) {
    const at = i * 4,
      d = pixels.data;
    if (compatible) {
      if (depth === 16) {
        const v = previous!.data[i * 2];
        if (
          d[at] === v &&
          d[at + 1] === v &&
          d[at + 2] === v &&
          d[at + 3] === previous!.data[i * 2 + 1]
        )
          continue;
      } else {
        const index = previous!.data[i],
          c = palette.entries[index];
        if (index === maskIndex) {
          if (d[at] === 0 && d[at + 1] === 0 && d[at + 2] === 0 && d[at + 3] === 0) continue;
        } else if (
          d[at] === (c?.red ?? 0) &&
          d[at + 1] === (c?.green ?? 0) &&
          d[at + 2] === (c?.blue ?? 0) &&
          d[at + 3] === (c?.alpha ?? 0)
        )
          continue;
      }
    }
    if (depth === 8) {
      const index = asepriteRgbMap(d[at], d[at + 1], d[at + 2], d[at + 3], palette, maskIndex);
      if (data[i] !== index) {
        own();
        changed = true;
        data[i] = index;
      }
    } else {
      const gray = asepriteLuminance(d[at], d[at + 1], d[at + 2]);
      if (data[i * 2] !== gray || data[i * 2 + 1] !== d[at + 3]) {
        own();
        changed = true;
        data[i * 2] = gray;
        data[i * 2 + 1] = d[at + 3];
      }
    }
  }
  return !changed && previous
    ? previous
    : { depth, width: pixels.width, height: pixels.height, data };
}
export function asepriteBackgroundSample(
  depth: 8 | 16,
  color: Rgba,
  palette: AsepritePalette,
  preferredIndex?: number,
): number[] {
  if (depth === 16)
    return [
      Math.trunc((Math.max(...color.slice(0, 3)) + Math.min(...color.slice(0, 3))) / 2),
      UINT8_MAX,
    ];
  const exact = palette.entries.findIndex(
    (c, index) =>
      index < INDEXED_PALETTE_SIZE &&
      c.red === color[0] &&
      c.green === color[1] &&
      c.blue === color[2] &&
      c.alpha === color[3],
  );
  return [
    preferredIndex !== undefined &&
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < Math.min(INDEXED_PALETTE_SIZE, palette.entries.length)
      ? preferredIndex
      : exact >= 0
        ? exact
        : asepriteBestFit(...color, palette, 0),
  ];
}

/** Aseprite sample bytes are independent of an indexed frame's display palette. */
export function expandAsepriteSamples(
  image: AsepriteImageSamples,
  palette: AsepritePalette | undefined,
  maskIndex = -1,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(image.width * image.height * 4);
  for (let i = 0; i < image.width * image.height; i++) {
    if (image.depth === 16) {
      const v = image.data[i * 2];
      out.set([v, v, v, image.data[i * 2 + 1]], i * 4);
    } else {
      const index = image.data[i],
        c = palette?.entries[index];
      if (index === maskIndex) {
        out.set([0, 0, 0, 0], i * 4);
        continue;
      }
      // A shorter palette leaves the image's sample bytes intact. Aseprite's
      // Palette::entry and indexed compositor use transparent black for missing entries.
      out.set(c ? [c.red, c.green, c.blue, c.alpha] : MISSING_PALETTE_COLOR, i * 4);
    }
  }
  return out;
}
/** doc::Palette::findBestfit integer RGB5 distance, including transparent mask. */
export function asepriteBestFit(
  r: number,
  g: number,
  b: number,
  a: number,
  palette: AsepritePalette,
  maskIndex = -1,
): number {
  r >>= 3;
  g >>= 3;
  b >>= 3;
  a >>= 3;
  if (a === 0 && maskIndex >= 0) return maskIndex;
  let best = 0,
    lowest = 2147483647;
  for (let i = 0; i < Math.min(256, palette.entries.length); i++) {
    if (i === maskIndex) continue;
    const c = palette.entries[i],
      dr = (c.red >> 3) - r,
      dg = (c.green >> 3) - g,
      db = (c.blue >> 3) - b,
      da = (c.alpha >> 3) - a,
      delta = dr * dr * 900 + dg * dg * 3481 + db * db * 121 + da * da * 64;
    if (delta < lowest) {
      best = i;
      lowest = delta;
      if (delta === 0) return i;
    }
  }
  return best;
}
export const asepriteLuminance = (r: number, g: number, b: number) =>
  Math.trunc((r * 2126 + g * 7152 + b * 722) / 10000);
const rgbMaps = new WeakMap<AsepritePalette, Map<number, Map<number, number>>>();
/** doc::OctreeMap's exact-color leaves use the last palette entry; misses use
 * default Palette::findBestfit. This differs from Color::getIndex first-match. */
export function asepriteRgbMap(
  r: number,
  g: number,
  b: number,
  a: number,
  palette: AsepritePalette,
  maskIndex = -1,
): number {
  let masks = rgbMaps.get(palette);
  if (!masks) {
    masks = new Map();
    rgbMaps.set(palette, masks);
  }
  let map = masks.get(maskIndex);
  const key = (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
  if (!map) {
    map = new Map();
    for (let i = 0; i < Math.min(256, palette.entries.length); i++) {
      const c = palette.entries[i],
        at = (c.red | (c.green << 8) | (c.blue << 16) | (c.alpha << 24)) >>> 0;
      map.set(
        at,
        i === maskIndex ? asepriteBestFit(c.red, c.green, c.blue, c.alpha, palette, maskIndex) : i,
      );
    }
    masks.set(maskIndex, map);
  }
  const exact = map.get(key);
  if (exact !== undefined) return exact;
  const result = asepriteBestFit(r, g, b, a, palette, maskIndex);
  if (map.size < UINT16_VALUE_COUNT) map.set(key, result);
  return result;
}

/** Linked frames with the same effective palette share one RGBA projection. */
export function asepriteProjectionCache() {
  const images = new Map<
    AsepriteImageSamples,
    Map<readonly Rgba[] | undefined, Map<number, PixelBuffer>>
  >();
  return (
    image: AsepriteImageSamples,
    colors: readonly Rgba[] | undefined,
    maskIndex: number,
  ): PixelBuffer => {
    let palettes = images.get(image);
    if (!palettes) {
      palettes = new Map();
      images.set(image, palettes);
    }
    const key = image.depth === 16 ? undefined : colors;
    let masks = palettes.get(key);
    if (!masks) {
      masks = new Map();
      palettes.set(key, masks);
    }
    let pixels = masks.get(maskIndex);
    if (!pixels) {
      pixels = {
        width: image.width,
        height: image.height,
        data: expandAsepriteSamples(
          image,
          {
            entries: (colors ?? []).map(([red, green, blue, alpha]) => ({
              red,
              green,
              blue,
              alpha,
            })),
          },
          maskIndex,
        ),
      };
      masks.set(maskIndex, pixels);
    }
    return pixels;
  };
}
