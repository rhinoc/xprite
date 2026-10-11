import type { UiFontDefinition } from "$/base/theme/theme-types";

export function themeCjkFontFamily(metrics: UiFontDefinition): string {
  return metrics.cjkFontFamily;
}

export function themeFontFamily(metrics: UiFontDefinition): string {
  return `${metrics.fontFamily}, ${metrics.cjkFontFamily}, monospace`;
}
