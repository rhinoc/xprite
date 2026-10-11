import {
  FontRole,
  UiFontRenderer,
  type UiTypography,
  type UiGlyphMap,
} from "$/base/theme/theme-types";
import defaultGlyphMetrics from "$assets/fonts/aseprite/aseprite-glyphs.json";
import defaultGlyphAtlasUrl from "$assets/fonts/aseprite/aseprite-glyphs.webp";
import miniGlyphMetrics from "$assets/fonts/aseprite/aseprite-mini-glyphs.json";
import miniGlyphAtlasUrl from "$assets/fonts/aseprite/aseprite-mini-glyphs.webp";

function bitmapFont(glyphs: UiGlyphMap, url: string, width: number, height: number, mini: boolean) {
  const lineHeight = glyphs["32"][3] * 2;
  return {
    renderer: UiFontRenderer.Bitmap as const,
    fontFamily: "Aseprite",
    fontSize: mini ? 12 : 14,
    lineHeight,
    // Primary Chinese uses the 10px face at the 14px English line.
    // Mini bitmap glyphs are 5px tall at 2x, so compact Chinese fills a 10px line.
    cjkFontFamily: "FusionPixel10",
    cjkFontSize: mini ? 10 : 14,
    cjkAdvance: mini ? 10 : 14,
    fallbackFontFamily: "sans-serif",
    fallbackAdvance: glyphs["63"][2] * 2,
    advances: Object.fromEntries(
      Object.entries(glyphs).map(([code, glyph]) => [code, glyph[2] * 2]),
    ),
    atlas: { url, width, height, glyphs },
    atlasInDom: mini,
  };
}

export const asepriteTypography = {
  [FontRole.Primary]: bitmapFont(defaultGlyphMetrics, defaultGlyphAtlasUrl, 177, 793, false),
  [FontRole.Compact]: bitmapFont(miniGlyphMetrics, miniGlyphAtlasUrl, 177, 154, true),
  alignmentScale: 2,
} satisfies UiTypography;
