import { useMemo } from "react";

import { themeGlyphAssets } from "$/base/theme/theme-assets";
import { useTheme, type UiStyleDefinition } from "$/base/theme/theme-context";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import type { PixelFont } from "$/components/text/types";

const { defaultGlyphMetrics: defaultGlyphData, miniGlyphMetrics: miniGlyphData } = themeGlyphAssets;

export const glyphSets = {
  default: defaultGlyphData as Record<string, number[]>,
  mini: miniGlyphData as Record<string, number[]>,
};
/** CJK uses the same em/advance as the selected Aseprite atlas at this scale. */
function cjkFallbackAdvance(font: PixelFont, scale = 2) {
  return themeFontHeight(font, scale);
}
export function isCjkGlyph(codepoint: number) {
  return (
    (codepoint >= 0x2e80 && codepoint <= 0x2fff) ||
    (codepoint >= 0x3000 && codepoint <= 0x30ff) ||
    (codepoint >= 0x3100 && codepoint <= 0x31ff) ||
    (codepoint >= 0x3400 && codepoint <= 0x4dbf) ||
    (codepoint >= 0x4e00 && codepoint <= 0x9fff) ||
    (codepoint >= 0xac00 && codepoint <= 0xd7ff) ||
    (codepoint >= 0xf900 && codepoint <= 0xfaff) ||
    (codepoint >= 0xfe30 && codepoint <= 0xfe4f) ||
    (codepoint >= 0xff00 && codepoint <= 0xffef) ||
    (codepoint >= 0x20000 && codepoint <= 0x323af)
  );
}
export function measureThemeText(
  text: string,
  font: PixelFont = "default",
  scale = 2,
  typography?: UiStyleDefinition["typography"],
) {
  const metrics = typography?.[font];
  if (metrics)
    return [...text].reduce(
      (width, char) =>
        width +
        ((metrics.advances[String(char.codePointAt(0))] ??
          (isCjkGlyph(char.codePointAt(0)!)
            ? (metrics.cjkAdvance ?? metrics.fontSize)
            : metrics.fontSize)) *
          scale) /
          RASTER_SCALE,
      0,
    );
  return [...text].reduce((width, char) => {
    const codepoint = char.codePointAt(0)!;
    const glyph = glyphSets[font][String(codepoint)];
    return (
      width +
      (glyph
        ? glyph[2] * scale
        : isCjkGlyph(codepoint)
          ? cjkFallbackAdvance(font, scale)
          : (glyphSets[font]["63"]?.[2] ?? 4) * scale)
    );
  }, 0);
}
export function centerThemePixel(position: number, size: number, itemSize: number, scale = 2) {
  return (
    (Math.trunc(position / scale) +
      Math.trunc(Math.trunc(size / scale) / 2) -
      Math.trunc(Math.trunc(itemSize / scale) / 2)) *
    scale
  );
}
export function themeFontHeight(
  font: PixelFont = "default",
  scale = 2,
  typography?: UiStyleDefinition["typography"],
) {
  const metrics = typography?.[font];
  if (metrics) return (metrics.lineHeight * scale) / RASTER_SCALE;
  return (glyphSets[font]["32"]?.[3] ?? 7) * scale;
}

/** Text measurements follow the same font as the active skin, including portals. */
export function useThemeText() {
  const { definition } = useTheme();
  return useMemo(
    () => ({
      centerThemePixel: (position: number, size: number, itemSize: number) =>
        centerThemePixel(position, size, itemSize, definition.typography ? 1 : RASTER_SCALE),
      measureThemeText: (text: string, font: PixelFont = "default", scale = RASTER_SCALE) =>
        measureThemeText(text, font, scale, definition.typography),
      themeFontHeight: (font: PixelFont = "default", scale = RASTER_SCALE) =>
        themeFontHeight(font, scale, definition.typography),
    }),
    [definition],
  );
}
