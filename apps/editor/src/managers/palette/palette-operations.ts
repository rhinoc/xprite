import { formatEditorColor } from "$/managers/tools/color-control";
import {
  extractPalette,
  resizePaletteColors,
  UINT8_MAX,
  type PixelBuffer,
  type Rgba,
} from "@xprite/editor-core";

export type PaletteColor = Rgba;
export const PALETTE_COLOR_CHANNEL_MAX = UINT8_MAX;

export function formatPaletteEntry(color: readonly number[]): string {
  return formatEditorColor([
    color[0] ?? 0,
    color[1] ?? 0,
    color[2] ?? 0,
    color[3] ?? PALETTE_COLOR_CHANNEL_MAX,
  ]);
}

export function normalizeEditorPalette(colors: readonly (readonly number[])[]): PaletteColor[] {
  return colors.map((color) => [
    color[0] ?? 0,
    color[1] ?? 0,
    color[2] ?? 0,
    color[3] ?? PALETTE_COLOR_CHANNEL_MAX,
  ]);
}

export function resizeEditorPalette(
  colors: readonly (readonly number[])[],
  count: number,
): PaletteColor[] {
  return resizePaletteColors(normalizeEditorPalette(colors), count);
}

export function createPaletteFromSprite(image: PixelBuffer, maxColors: number): PaletteColor[] {
  return extractPalette(image, { maxColors: Math.trunc(maxColors) }).map((entry) => entry.color);
}
