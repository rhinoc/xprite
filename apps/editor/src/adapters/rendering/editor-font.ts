import { bitmapFontFromAtlas } from "$/adapters/rendering/bitmap-font";
import type { EditorTextFontOptions } from "$/managers/ports/platform";
import {
  bitmapTextFontSize,
  DEFAULT_TEXT_FONT_SIZE,
  FusionPixelFontSize,
  fusionPixelFontSize,
  normalizeTextFontSize,
  textFontScale,
  TextFontFamily,
  UINT8_MAX,
  type BitmapFont,
  type BitmapGlyph,
} from "@xprite/editor-core";
import { asepriteTheme, FontRole, UiColorScheme, UiFontRenderer } from "@xprite/ui";
import { getUiAssets } from "@xprite/ui/assets";

const bundledFonts = new Map<TextFontFamily, BitmapFont>();
const ALIAS_COVERAGE_THRESHOLD = 128;
const DEFAULT_FONT_DESCENT = 2;
const MINI_FONT_DESCENT = 1;
const MAX_STROKE_WIDTH = 10;
const FUSION_PIXEL_12 = "FusionPixel12";
const FUSION_PIXEL_10 = "FusionPixel10";
const FUSION_PIXEL_8 = "FusionPixel8";
const FUSION_PIXEL_FAMILIES = {
  [FusionPixelFontSize.Px8]: FUSION_PIXEL_8,
  [FusionPixelFontSize.Px10]: FUSION_PIXEL_10,
  [FusionPixelFontSize.Px12]: FUSION_PIXEL_12,
};
const FUSION_PIXEL_COVERAGE_THRESHOLD = 64;
const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
]);

/** Read the bundled atlas without changing its pixel coverage. */
function prepareEditorTextFont(
  colorScheme: UiColorScheme,
  family = TextFontFamily.Aseprite,
): BitmapFont {
  const cached = bundledFonts.get(family);
  if (cached) return cached;
  const mini = family === TextFontFamily.AsepriteMini;
  const role = mini ? FontRole.Compact : FontRole.Primary;
  const assets = getUiAssets(colorScheme, asepriteTheme);
  const atlas = assets?.fontAtlases[role];
  const definition = asepriteTheme.typography[role];
  if (definition.renderer !== UiFontRenderer.Bitmap)
    throw new Error("Editor font requires a bitmap atlas");
  if (!(atlas instanceof HTMLCanvasElement)) throw new Error("Pixel UI text atlas is not ready");
  const context = atlas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Cannot read pixel UI text atlas");
  const font = bitmapFontFromAtlas(
    context.getImageData(0, 0, atlas.width, atlas.height),
    definition.atlas.glyphs,
  );
  bundledFonts.set(family, font);
  return font;
}

function textCharacters(text: string): string[] {
  const characters = new Set<string>();
  for (const char of text) {
    const codepoint = char.codePointAt(0)!;
    if (codepoint === 0) break;
    if (codepoint >= 10 && codepoint <= 20) continue;
    characters.add(char);
  }
  return [...characters];
}

/** Return final-size pixels; consumers must not scale a system font's 7px raster. */
export function rasterizeEditorTextFont(
  appearance: "light" | "dark",
  text: string,
  options: Partial<EditorTextFontOptions> = {},
): BitmapFont {
  const colorScheme = appearance === "dark" ? UiColorScheme.Dark : UiColorScheme.Light;
  const family = options.family?.trim() || TextFontFamily.Aseprite;
  const size = normalizeTextFontSize(options.size ?? DEFAULT_TEXT_FONT_SIZE);
  const characters = textCharacters(text);
  if (family.toLowerCase() === TextFontFamily.FusionPixel.toLowerCase())
    return rasterizeFusionFont(colorScheme, characters, fusionFace(size)).font;
  const baseSize = bitmapTextFontSize(family);
  if (!baseSize) return rasterizeSystemFont(characters, cssFontFamily(family), size, options).font;

  const mini = family.toLowerCase() === TextFontFamily.AsepriteMini.toLowerCase();
  const source = prepareEditorTextFont(
    colorScheme,
    mini ? TextFontFamily.AsepriteMini : TextFontFamily.Aseprite,
  );
  const scale = textFontScale(family, size);
  const fontHeight = source.height * scale;
  const sourceBaseline = fontHeight - (mini ? MINI_FONT_DESCENT : DEFAULT_FONT_DESCENT) * scale;
  const missing = characters.filter((char) => !source.glyphs[char]);
  // Keep supported glyphs from the selected sheet. Missing glyphs use the
  // Fusion Pixel face whose grid is nearest to this line.
  const fallback = missing.length
    ? rasterizeFusionFont(colorScheme, missing, fusionFace(fontHeight))
    : null;
  const baseline = Math.max(sourceBaseline, fallback?.baseline ?? 0);
  const glyphs: Record<string, BitmapGlyph> = {};
  for (const char of characters) {
    const original = source.glyphs[char];
    glyphs[char] = original
      ? scaleAndAlignGlyph(original, scale, baseline - sourceBaseline)
      : scaleAndAlignGlyph(fallback!.font.glyphs[char], 1, baseline - fallback!.baseline);
  }
  return {
    height: fontHeight,
    lineHeight: Math.max(
      fontHeight,
      fallback?.font.lineHeight ?? 0,
      ...Object.values(glyphs).map((glyph) => glyph.height),
    ),
    glyphs,
  };
}

function fusionFace(pixelHeight: number): { family: string; size: number; scale: number } {
  const size = fusionPixelFontSize(pixelHeight);
  return {
    family: FUSION_PIXEL_FAMILIES[size],
    size,
    scale: textFontScale(TextFontFamily.FusionPixel, pixelHeight),
  };
}

/** Rasterize one Fusion Pixel face at its design size, then enlarge that mask by whole pixels. */
function rasterizeFusionFont(
  colorScheme: UiColorScheme,
  characters: readonly string[],
  face: { family: string; size: number; scale: number },
): { font: BitmapFont; baseline: number } {
  if (!getUiAssets(colorScheme)?.cjkFontReady)
    throw new Error("The bundled Chinese pixel font is not ready");
  const source = rasterizeSystemFont(
    characters,
    cssFontFamily(face.family),
    face.size,
    { antialias: false },
    FUSION_PIXEL_COVERAGE_THRESHOLD,
  );
  const glyphs: Record<string, BitmapGlyph> = {};
  for (const char of characters)
    glyphs[char] = scaleAndAlignGlyph(source.font.glyphs[char], face.scale, 0);
  return {
    font: {
      height: face.size * face.scale,
      lineHeight: source.font.lineHeight * face.scale,
      glyphs,
    },
    baseline: source.baseline * face.scale,
  };
}

function scaleAndAlignGlyph(glyph: BitmapGlyph, scale: number, top: number): BitmapGlyph {
  const width = glyph.width * scale;
  const height = glyph.height * scale + top;
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < glyph.height; y++)
    for (let x = 0; x < glyph.width; x++)
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          alpha[(top + y * scale + dy) * width + x * scale + dx] = glyph.alpha[y * glyph.width + x];
  return { width, height, advance: glyph.advance * scale, alpha };
}

function cssFontFamily(family: string) {
  const primary = GENERIC_FONT_FAMILIES.has(family.toLowerCase())
    ? family
    : `"${family.replace(/[\\"]/g, "\\$&")}"`;
  return family === FUSION_PIXEL_12 || family === FUSION_PIXEL_10 || family === FUSION_PIXEL_8
    ? primary
    : `${primary}, "${FUSION_PIXEL_12}"`;
}

function rasterizeSystemFont(
  characters: readonly string[],
  family: string,
  size: number,
  options: Partial<EditorTextFontOptions>,
  coverageThreshold = ALIAS_COVERAGE_THRESHOLD,
): { font: BitmapFont; baseline: number } {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas text rasterization is unavailable");
  const strokeWidth = Math.max(0, Math.min(MAX_STROKE_WIDTH, options.strokeWidth ?? 0));
  const padding = Math.ceil(strokeWidth / 2);
  const cssFont = `${options.italic ? "italic" : "normal"} ${options.bold ? "bold" : "normal"} ${size}px ${family}`;
  const configure = () => {
    context.font = cssFont;
    context.textBaseline = "alphabetic";
    context.lineJoin = "miter";
    context.fillStyle = "white";
    context.strokeStyle = "white";
    context.lineWidth = strokeWidth;
    context.fontKerning = "none";
  };
  configure();
  const reference = context.measureText("Mg");
  const ascent = Math.max(
    1,
    Math.ceil(reference.fontBoundingBoxAscent || reference.actualBoundingBoxAscent || size),
  );
  const descent = Math.max(
    0,
    Math.ceil(reference.fontBoundingBoxDescent || reference.actualBoundingBoxDescent || 0),
  );
  const baseline = padding + ascent;
  const height = Math.max(1, ascent + descent + padding * 2);
  const glyphs: Record<string, BitmapGlyph> = {};
  for (const char of characters) {
    configure();
    const metrics = context.measureText(char);
    const left = Math.max(0, Math.ceil(metrics.actualBoundingBoxLeft || 0));
    const right = Math.max(0, Math.ceil(metrics.actualBoundingBoxRight || metrics.width));
    const width = Math.max(1, left + right, Math.ceil(metrics.width)) + padding * 2;
    canvas.width = width;
    canvas.height = height;
    configure();
    if (strokeWidth > 0) context.strokeText(char, padding + left, baseline);
    if (options.fill !== false) context.fillText(char, padding + left, baseline);
    // Canvas 2D has no aliased glyph mode. Preserve coverage when AA is enabled,
    // otherwise quantize it; this cannot reproduce Skia's native hinting.
    const data = context.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < alpha.length; i++) {
      const coverage = data[i * 4 + 3];
      alpha[i] = options.antialias ? coverage : coverage >= coverageThreshold ? UINT8_MAX : 0;
    }
    glyphs[char] = { width, height, advance: Math.max(0, Math.round(metrics.width)), alpha };
  }
  return { font: { height: size, lineHeight: height, glyphs }, baseline };
}
