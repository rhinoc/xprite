export enum TextFontFamily {
  Aseprite = "Aseprite",
  AsepriteMini = "Aseprite Mini",
  FusionPixel = "Fusion Pixel",
}

export const DEFAULT_TEXT_FONT_SIZE = 7;
export const MINI_TEXT_FONT_SIZE = 5;
export const FUSION_PIXEL_FONT_SIZE = 10;
export const MAX_TEXT_FONT_SIZE = 448;
export const MAX_TEXT_SCALE = 64;

export function bitmapTextFontSize(family: string): number | null {
  switch (family.trim().toLowerCase()) {
    case TextFontFamily.Aseprite.toLowerCase():
      return DEFAULT_TEXT_FONT_SIZE;
    case TextFontFamily.AsepriteMini.toLowerCase():
      return MINI_TEXT_FONT_SIZE;
    case TextFontFamily.FusionPixel.toLowerCase():
      return FUSION_PIXEL_FONT_SIZE;
    default:
      return null;
  }
}

export function normalizeTextFontSize(size: number): number {
  return Math.max(1, Math.min(MAX_TEXT_FONT_SIZE, Math.floor(size) || DEFAULT_TEXT_FONT_SIZE));
}

export function textFontScale(family: string, size: number): number {
  const baseSize = bitmapTextFontSize(family);
  return baseSize ? Math.max(1, Math.min(MAX_TEXT_SCALE, Math.floor(size / baseSize))) : 1;
}
