import type { UiThemeTokens } from "$/base/theme/theme-definition";
import { FontRole, UiFontRenderer, type UiTypography } from "$/base/theme/theme-types";
import fontMetrics from "$/base/theme/themes/macintosh/font-metrics.json" with { type: "json" };

const CJK_CSS_SIZE = 16;
/**
 * The one hand-tuned CJK vertical offset (CSS px, scale 2) for Macintosh: Fusion Pixel's ink sits
 * this far from ChiKareGo2/FindersKeepers Latin in the same line box. Tuned by measurement with
 * scripts/visual-audit/text-alignment.mjs.
 */
const MACINTOSH_CJK_TEXT_OFFSET_Y = 0;

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
  cjkTextOffsetY: MACINTOSH_CJK_TEXT_OFFSET_Y,
} satisfies UiTypography;

/** Window text follows the native Macintosh title and footer metrics. */
export const macintoshWindowTypographyTokens = {
  "--ui-panel-utility-line-height": "8px",
  "--ui-panel-window-title-line-height": "16px",
  "--ui-panel-window-title-font": "var(--xse-font, var(--ui-font-family, monospace))",
} satisfies UiThemeTokens;
