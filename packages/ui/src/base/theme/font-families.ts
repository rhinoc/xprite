import type { UiStyleDefinition } from "$/base/theme/theme-types";

type FontMetrics = NonNullable<UiStyleDefinition["typography"]>["default"];
const BITMAP_FONT_FAMILY = "PixelArtBitmap";
const CJK_FONT_FAMILY = "FusionPixelZhHans";

export function themeCjkFontFamily(metrics?: FontMetrics): string {
  return metrics?.cjkFontFamily ?? CJK_FONT_FAMILY;
}

export function themeFontFamily(metrics?: FontMetrics): string {
  return `${metrics?.fontFamily ?? BITMAP_FONT_FAMILY}, ${themeCjkFontFamily(metrics)}, monospace`;
}
