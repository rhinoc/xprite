import { UINT8_MAX } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import { MAX_PALETTE_COLORS } from "$/color/palette-resize";

/** Palette::findExactMatch compares all four channels, including transparent RGB. */
export function paletteColorIndex(palette: readonly (readonly number[])[], color: Rgba): number {
  return palette.findIndex(
    (entry) =>
      entry[0] === color[0] &&
      entry[1] === color[1] &&
      entry[2] === color[2] &&
      (entry[3] ?? UINT8_MAX) === color[3],
  );
}
/** AddColor uses the same allocation limit as palette resize and replacement. */
export function appendMissingPaletteColor(
  palette: readonly (readonly number[])[],
  color: Rgba,
  maximum = MAX_PALETTE_COLORS,
): { palette: readonly (readonly number[])[]; index: number; added: boolean } {
  const index = paletteColorIndex(palette, color);
  if (index >= 0) return { palette, index, added: false };
  if (palette.length >= maximum) return { palette, index: -1, added: false };
  return { palette: [...palette, [...color]], index: palette.length, added: true };
}
