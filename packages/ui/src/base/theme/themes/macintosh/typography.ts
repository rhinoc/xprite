import type { UiThemeTokens } from "$/base/theme/theme-definition";
import { FontRole, UiFontRenderer, type UiTypography } from "$/base/theme/theme-types";
import fontMetrics from "$/base/theme/themes/macintosh/font-metrics.json" with { type: "json" };

const CJK_CSS_SIZE = 16;

/** ChiKareGo2 uses the 12px Fusion Pixel grid. FindersKeepers uses the 10px grid. */
export const macintoshTypography = {
  [FontRole.Primary]: {
    ...fontMetrics.chikarego2,
    renderer: UiFontRenderer.Native,
    cjkFontFamily: "MacintoshCjkPixel",
    cjkFontSize: CJK_CSS_SIZE,
    cjkAdvance: 12,
    fallbackAdvance: 16,
    fallbackFontFamily: "sans-serif",
  },
  [FontRole.Compact]: {
    ...fontMetrics.finderskeepers,
    renderer: UiFontRenderer.Native,
    cjkFontFamily: "MacintoshCjkCompact",
    cjkFontSize: CJK_CSS_SIZE,
    cjkAdvance: 10,
    fallbackAdvance: 16,
    fallbackFontFamily: "sans-serif",
  },
  alignmentScale: 1,
} satisfies UiTypography;

/** Window text follows the native Macintosh title and footer metrics. */
export const macintoshWindowTypographyTokens = {
  "--ui-panel-utility-line-height": "8px",
  "--ui-panel-window-title-line-height": "12px",
  "--ui-panel-window-title-font": "var(--xse-font, var(--ui-font-family, monospace))",
} satisfies UiThemeTokens;
