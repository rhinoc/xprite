import type { Rgba } from "$/base/primitives";
import { paletteColorIndex } from "$/color/palette-warning";

/** RGBA palette lookup follows the MIT-licensed doc/palette.cpp and
 * .refs/libresprite/src/app/color.cpp: exact match, then palette best-fit.
 * Best-fit uses five-bit channels and squared 59/30/11/8 weights;
 * index zero is the mask candidate and is excluded for nontransparent fits. */
export function asepritePaletteColorIndex(palette: readonly Rgba[], color: Rgba): number {
  const exact = paletteColorIndex(palette, color);
  if (exact >= 0) return exact;
  if (color[3] >> 3 === 0) return 0;
  let best = 0,
    lowest = Infinity;
  for (let index = 1; index < Math.min(256, palette.length); index++) {
    const entry = palette[index];
    const r = (entry[0] >> 3) - (color[0] >> 3),
      g = (entry[1] >> 3) - (color[1] >> 3),
      b = (entry[2] >> 3) - (color[2] >> 3),
      a = (entry[3] >> 3) - (color[3] >> 3);
    const distance = g * g * 59 * 59 + r * r * 30 * 30 + b * b * 11 * 11 + a * a * 8 * 8;
    if (distance < lowest) {
      best = index;
      lowest = distance;
      if (distance === 0) break;
    }
  }
  return best;
}
export function stepAsepritePaletteIndex(index: number, step: number, size: number): number | null {
  if (size < 1 || !Number.isFinite(step)) return null;
  return (((index + Math.trunc(step)) % size) + size) % size;
}
