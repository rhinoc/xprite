import { useMemo } from "react";

import { defaultUiTheme } from "$/base/theme/default-theme";
import { useTheme, type UiStyleDefinition } from "$/base/theme/theme-context";
import { FontRole } from "$/base/theme/theme-types";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";

export function themeFontKey(font: FontRole): FontRole {
  return font;
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
/** Cyrillic is missing from the compact Aseprite atlas; draw it from the Fusion Pixel face. */
export function isCyrillicGlyph(codepoint: number) {
  return codepoint >= 0x400 && codepoint <= 0x52f;
}
/** Glyphs absent from a bitmap atlas that are drawn from the bundled pixel face instead of "?". */
export function isPixelFallbackGlyph(codepoint: number) {
  return isCjkGlyph(codepoint) || isCyrillicGlyph(codepoint);
}
/** Cyrillic fallback glyphs are half the full-width CJK cell. */
export function pixelFallbackAdvance(codepoint: number, cjkAdvance: number) {
  return isCyrillicGlyph(codepoint) ? Math.ceil(cjkAdvance / 2) : cjkAdvance;
}
export function measureThemeText(
  text: string,
  font: FontRole = FontRole.Primary,
  scale = 2,
  typography: UiStyleDefinition["typography"] = defaultUiTheme.typography,
  cjkAdvance?: number,
) {
  const metrics = typography[themeFontKey(font)];
  return [...text].reduce((width, char) => {
    const codepoint = char.codePointAt(0)!;
    const advance =
      metrics.advances[String(codepoint)] ??
      (isCjkGlyph(codepoint)
        ? (cjkAdvance ?? metrics.cjkAdvance)
        : isCyrillicGlyph(codepoint)
          ? pixelFallbackAdvance(codepoint, metrics.cjkAdvance)
          : metrics.fallbackAdvance);
    return width + (advance * scale) / RASTER_SCALE;
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
  font: FontRole = FontRole.Primary,
  scale = 2,
  typography: UiStyleDefinition["typography"] = defaultUiTheme.typography,
) {
  return (typography[themeFontKey(font)].lineHeight * scale) / RASTER_SCALE;
}

/** Text measurements follow the same font as the active skin, including portals. */
export function useThemeText() {
  const { definition } = useTheme();
  return useMemo(
    () => ({
      centerThemePixel: (position: number, size: number, itemSize: number) =>
        centerThemePixel(position, size, itemSize, definition.typography.alignmentScale),
      measureThemeText: (
        text: string,
        font: FontRole = FontRole.Primary,
        scale = RASTER_SCALE,
        cjkAdvance?: number,
      ) => measureThemeText(text, font, scale, definition.typography, cjkAdvance),
      themeFontHeight: (font: FontRole = FontRole.Primary, scale = RASTER_SCALE) =>
        themeFontHeight(font, scale, definition.typography),
    }),
    [definition],
  );
}
