import { UINT8_MAX } from "$/base/numeric-constants";
import type { BitmapFont, PixelBuffer, Point, RasterResult } from "$/base/primitives";
import { mulUn8, normalBlend, pixelWriter, samplePixel } from "$/canvas/raster";
import type { RasterOptions } from "$/canvas/raster/types";

/** Basic atlas mode deliberately excludes platform-dependent system fallback fonts. */
export function validateBitmapText(text: string, font: BitmapFont): string | null {
  for (const char of text) {
    const codepoint = char.codePointAt(0)!;
    if (codepoint === 0) break;
    if (codepoint >= 10 && codepoint <= 20) continue;
    if (!font.glyphs[char])
      return `The bundled font does not contain U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}.`;
  }
  return null;
}

function assertBitmapText(text: string, font: BitmapFont): void {
  const error = validateBitmapText(text, font);
  if (error) throw new RangeError(error);
}

/** Bitmap font raster, integer scale and explicit glyph metrics; no browser font APIs. */
export function paintText(
  image: PixelBuffer,
  point: Point,
  text: string,
  font: BitmapFont,
  scale: number,
  options: RasterOptions,
): RasterResult {
  assertBitmapText(text, font);
  scale = Math.max(1, Math.min(64, Math.floor(scale)));
  let x = Math.floor(point.x);
  const y = Math.floor(point.y);
  const writer = pixelWriter(image, options);
  for (const char of text) {
    // SpriteTextBlob::MakeWithShaper renders a single run: NUL ends it,
    // and code points 10..20 are ignored rather than advancing a line.
    const codepoint = char.codePointAt(0)!;
    if (codepoint === 0) break;
    if (codepoint >= 10 && codepoint <= 20) continue;
    const glyph = font.glyphs[char];
    if (!glyph) continue;
    for (let gy = 0; gy < glyph.height; gy++)
      for (let gx = 0; gx < glyph.width; gx++) {
        const alpha = mulUn8(options.color[3], glyph.alpha[gy * glyph.width + gx]);
        if (!alpha) continue;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const px = x + gx * scale + dx,
              py = y + gy * scale + dy;
            writer.write(
              px,
              py,
              normalBlend(
                samplePixel(image, { x: px, y: py }),
                [options.color[0], options.color[1], options.color[2], alpha],
                options.opacity ?? UINT8_MAX,
              ),
            );
          }
      }
    x += glyph.advance * scale;
  }
  return writer.result();
}

/** Conservative source single-run bitmap bounds; no browser font metrics. */
export function measureBitmapText(
  text: string,
  font: BitmapFont,
  scale: number,
): { width: number; height: number } {
  assertBitmapText(text, font);
  scale = Math.max(1, Math.min(64, Math.floor(scale)));
  let x = 0,
    width = 0,
    height = font.height * scale;
  for (const char of text) {
    const codepoint = char.codePointAt(0)!;
    if (codepoint === 0) break;
    if (codepoint >= 10 && codepoint <= 20) continue;
    const glyph = font.glyphs[char];
    if (!glyph) continue;
    width = Math.max(width, x + glyph.width * scale);
    height = Math.max(height, glyph.height * scale);
    x += glyph.advance * scale;
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}
