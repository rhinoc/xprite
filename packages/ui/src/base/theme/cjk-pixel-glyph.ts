import { UiFontRenderer, type UiFontDefinition } from "$/base/theme/theme-types";
import { UINT8_MAX } from "$/base/utils/numeric-constants";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";

const cjkPixelGlyphCache = new Map<string, HTMLCanvasElement>();
const CJK_PIXEL_GLYPH_CACHE_LIMIT = 512;
const CJK_PIXEL_COVERAGE_THRESHOLD = 64;
/**
 * Draw the CJK face at its own pixel size on the typography's CJK baseline, so
 * every glyph keeps its designed vertical position next to the Latin atlas.
 * Center the ink horizontally in the fixed advance, discard faint edge coverage
 * and snap retained pixels to solid opacity.
 */
export function cjkPixelGlyph(
  char: string,
  metrics: Extract<UiFontDefinition, { renderer: UiFontRenderer.Bitmap }>,
  scale: number,
  color: string,
  usePixelFont: boolean,
  advanceUnits = metrics.cjkAdvance,
) {
  const line = Math.max(1, Math.round((metrics.lineHeight * scale) / RASTER_SCALE));
  const fontSize = Math.max(1, Math.round((metrics.cjkFontSize * scale) / RASTER_SCALE));
  const advance = Math.max(1, Math.round((advanceUnits * scale) / RASTER_SCALE));
  const baseline = Math.round((metrics.cjkBaseline * scale) / RASTER_SCALE);
  const family = usePixelFont ? metrics.cjkFontFamily : metrics.fallbackFontFamily;
  const threshold = metrics.cjkCoverageThreshold ?? CJK_PIXEL_COVERAGE_THRESHOLD;
  const key = `${threshold}:${family}:${fontSize}:${line}:${baseline}:${advance}:${color}:${char}`;
  const cached = cjkPixelGlyphCache.get(key);
  if (cached) {
    cjkPixelGlyphCache.delete(key);
    cjkPixelGlyphCache.set(key, cached);
    return cached;
  }
  if (typeof document === "undefined") return null;
  const probe = Math.max(line, fontSize) * 3;
  const mask = document.createElement("canvas");
  mask.width = probe;
  mask.height = probe;
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  if (!maskContext) return null;
  maskContext.font = `${fontSize}px ${family}`;
  maskContext.textAlign = "left";
  maskContext.textBaseline = "alphabetic";
  maskContext.fillStyle = "#fff";
  const probeBaseline = Math.round(probe / 2);
  maskContext.fillText(char, 0, probeBaseline);
  const probed = maskContext.getImageData(0, 0, probe, probe);
  let minX = probe;
  let minY = probe;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < probe; y++) {
    for (let x = 0; x < probe; x++) {
      if (probed.data[(y * probe + x) * 4 + 3] < threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const glyph = document.createElement("canvas");
  glyph.width = advance;
  glyph.height = line;
  const glyphContext = glyph.getContext("2d");
  if (!glyphContext) return null;
  if (maxX >= minX && maxY >= minY) {
    const inkWidth = maxX - minX + 1;
    const inkHeight = maxY - minY + 1;
    const destX = Math.round((advance - inkWidth) / 2);
    const destY = baseline - (probeBaseline - minY);
    const ink = maskContext.getImageData(minX, minY, inkWidth, inkHeight);
    for (let index = 0; index < ink.data.length; index += 4) {
      const covered = ink.data[index + 3] >= threshold;
      ink.data[index] = UINT8_MAX;
      ink.data[index + 1] = UINT8_MAX;
      ink.data[index + 2] = UINT8_MAX;
      ink.data[index + 3] = covered ? UINT8_MAX : 0;
    }
    const inkCanvas = document.createElement("canvas");
    inkCanvas.width = inkWidth;
    inkCanvas.height = inkHeight;
    inkCanvas.getContext("2d")?.putImageData(ink, 0, 0);
    glyphContext.drawImage(inkCanvas, destX, destY);
  }
  glyphContext.globalCompositeOperation = "source-in";
  glyphContext.fillStyle = color;
  glyphContext.fillRect(0, 0, advance, line);
  cjkPixelGlyphCache.set(key, glyph);
  while (cjkPixelGlyphCache.size > CJK_PIXEL_GLYPH_CACHE_LIMIT) {
    cjkPixelGlyphCache.delete(cjkPixelGlyphCache.keys().next().value!);
  }
  return glyph;
}

export interface CjkPixelGlyphMask {
  url: string;
  width: number;
  height: number;
}

const cjkPixelMaskCache = new Map<string, CjkPixelGlyphMask | null>();

/**
 * The same binarised glyph as `cjkPixelGlyph`, as a colour-independent alpha mask for DOM text:
 * DOM cannot threshold its own antialiasing, so a scaled pixel face (Fusion Pixel 8 at 1.25x)
 * would otherwise show grey edges. Width and height are CSS pixels at `scale`.
 */
export function cjkPixelGlyphMask(
  char: string,
  metrics: Extract<UiFontDefinition, { renderer: UiFontRenderer.Bitmap }>,
  scale: number,
  advanceUnits = metrics.cjkAdvance,
): CjkPixelGlyphMask | null {
  const key = `${metrics.cjkCoverageThreshold}:${metrics.cjkFontFamily}:${metrics.cjkFontSize}:${metrics.cjkBaseline}:${metrics.lineHeight}:${scale}:${advanceUnits}:${char}`;
  const cached = cjkPixelMaskCache.get(key);
  if (cached !== undefined) return cached;
  const glyph = cjkPixelGlyph(char, metrics, scale, "#000", true, advanceUnits);
  const mask = glyph
    ? {
        url: glyph.toDataURL("image/png"),
        width: glyph.width,
        height: glyph.height,
      }
    : null;
  cjkPixelMaskCache.set(key, mask);
  while (cjkPixelMaskCache.size > CJK_PIXEL_GLYPH_CACHE_LIMIT) {
    cjkPixelMaskCache.delete(cjkPixelMaskCache.keys().next().value!);
  }
  return mask;
}
