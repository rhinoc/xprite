import fontMetrics from "$/base/theme/themes/macintosh/font-metrics.json" with { type: "json" };

const CJK_FONT_FAMILY = "MacintoshCjkPixel";
const CJK_ADVANCE = 10;

/** Match the native ten-pixel Chinese grid to Macintosh's sixteen-pixel CSS em. */
export const macintoshTypography = {
  default: { ...fontMetrics.chikarego2, cjkFontFamily: CJK_FONT_FAMILY, cjkAdvance: CJK_ADVANCE },
  mini: { ...fontMetrics.finderskeepers, cjkFontFamily: CJK_FONT_FAMILY, cjkAdvance: CJK_ADVANCE },
};
