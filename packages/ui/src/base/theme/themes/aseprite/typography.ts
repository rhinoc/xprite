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
    // Primary Chinese uses the 10px face at the 14px English line, shifted onto
    // Aseprite's baseline (10 of 14). Mini bitmap glyphs are 5px tall at 2x, so
    // compact Chinese uses the 8px face (same pixel grid as the 5px Latin Mini at 2x)
    // enlarged 1.25x to a 10px-equivalent em, so its strokes match the English Mini.
    // Its native baseline sits 8.75 of 10 at that size, which rounds to 9.
    cjkFontFamily: mini ? "FusionPixel8" : "FusionPixel10Aseprite",
    cjkFontSize: mini ? 10 : 14,
    cjkAdvance: mini ? 10 : 14,
    // Below half so thin strokes survive; 1.25x of an 8px grid binarises heavier than 1.4x of the
    // 10px grid at 64, so compact keeps a slightly higher cut-off to avoid blobbed strokes.
    ...(mini ? { cjkCoverageThreshold: 112 } : {}),
    fallbackFontFamily: "sans-serif",
    fallbackAdvance: glyphs["63"][2] * 2,
    advances: Object.fromEntries(
      Object.entries(glyphs).map(([code, glyph]) => [code, glyph[2] * 2]),
    ),
    cjkBaseline: mini ? 9 : 10,
    atlas: { url, width, height, glyphs },
    atlasInDom: mini,
  };
}

export const asepriteTypography = {
  [FontRole.Primary]: bitmapFont(defaultGlyphMetrics, defaultGlyphAtlasUrl, 177, 793, false),
  [FontRole.Compact]: bitmapFont(miniGlyphMetrics, miniGlyphAtlasUrl, 177, 154, true),
  alignmentScale: 2,
  // Aseprite already seats CJK on the Latin baseline per font (`cjkBaseline`, FusionPixel10Aseprite).
  cjkTextOffsetY: 0,
} satisfies UiTypography;
