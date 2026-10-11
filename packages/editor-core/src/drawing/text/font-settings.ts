export enum TextFontFamily {
  Aseprite = "Aseprite",
  AsepriteMini = "Aseprite Mini",
  FusionPixel = "Fusion Pixel",
}

export enum FusionPixelFontSize {
  Px8 = 8,
  Px10 = 10,
  Px12 = 12,
}

export const DEFAULT_TEXT_FONT_SIZE = 7;
export const MINI_TEXT_FONT_SIZE = 5;
export const FUSION_PIXEL_FONT_SIZE = FusionPixelFontSize.Px12;
export const MAX_TEXT_FONT_SIZE = 448;
export const MAX_TEXT_SCALE = 64;

const FUSION_PIXEL_FONT_SIZES = [
  FusionPixelFontSize.Px8,
  FusionPixelFontSize.Px10,
  FusionPixelFontSize.Px12,
] as const;

export function bitmapTextFontSizes(family: string): readonly number[] {
  switch (family.trim().toLowerCase()) {
    case TextFontFamily.Aseprite.toLowerCase():
      return [DEFAULT_TEXT_FONT_SIZE];
    case TextFontFamily.AsepriteMini.toLowerCase():
      return [MINI_TEXT_FONT_SIZE];
    case TextFontFamily.FusionPixel.toLowerCase():
      return FUSION_PIXEL_FONT_SIZES;
    default:
      return [];
  }
}

/** Prefer the largest rendered grid within the requested size, then the larger native face. */
export function fusionPixelFontSize(size: number): FusionPixelFontSize {
  const requestedSize = normalizeTextFontSize(size);
  let selected: FusionPixelFontSize = FusionPixelFontSize.Px8;
  let renderedSize: number = selected;
  for (const nativeSize of FUSION_PIXEL_FONT_SIZES) {
    const candidateSize = nativeSize * Math.floor(requestedSize / nativeSize);
    if (candidateSize >= renderedSize) {
      selected = nativeSize;
      renderedSize = candidateSize;
    }
  }
  return selected;
}

export function bitmapTextFontSize(
  family: string,
  size: number = FUSION_PIXEL_FONT_SIZE,
): number | null {
  if (family.trim().toLowerCase() === TextFontFamily.FusionPixel.toLowerCase())
    return fusionPixelFontSize(size);
  return bitmapTextFontSizes(family)[0] ?? null;
}

export function normalizeTextFontSize(size: number): number {
  return Math.max(1, Math.min(MAX_TEXT_FONT_SIZE, Math.floor(size) || DEFAULT_TEXT_FONT_SIZE));
}

export function textFontScale(family: string, size: number): number {
  const baseSize = bitmapTextFontSize(family, size);
  return baseSize ? Math.max(1, Math.min(MAX_TEXT_SCALE, Math.floor(size / baseSize))) : 1;
}
