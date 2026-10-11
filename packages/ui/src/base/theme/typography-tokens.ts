import type { UiThemeTokens } from "$/base/theme/theme-definition";

const CODE_FONT_FAMILY = '"Pixel Code", var(--ui-font-family-cjk), ui-monospace, monospace';

/** Reading roles keep family, size and line height independently adjustable. */
export const readingTypographyTokens = {
  "--ui-reading-body-font": "var(--ui-font-family)",
  "--ui-reading-body-size": "16px",
  "--ui-reading-line-height": "1.5",
  "--ui-reading-caption-font": "var(--ui-font-family)",
  "--ui-reading-caption-size": "14px",
  "--ui-reading-caption-line-height": "var(--ui-reading-line-height)",
  "--ui-reading-heading-font": "var(--ui-font-family)",
  "--ui-reading-heading-size": "24px",
  "--ui-reading-heading-line-height": "1.5",
  "--ui-reading-title-font": "var(--ui-font-family)",
  "--ui-reading-title-size": "32px",
  "--ui-reading-title-line-height": "1.5",
  "--ui-code-font": CODE_FONT_FAMILY,
  "--ui-code-size": "12px",
  "--ui-code-line-height": "1.5",
  "--ui-code-tab-size": "2",
} satisfies UiThemeTokens;

/** Utility windows and compact dialog captions use the active theme's compact font. */
export const windowKindTypographyTokens = {
  "--ui-panel-utility-font-size": "16px",
  "--ui-panel-utility-line-height": "16px",
  "--ui-panel-utility-font": "var(--ui-font-family-compact)",
  "--ui-panel-dialog-compact-font-size": "16px",
  "--ui-panel-dialog-compact-line-height": "20px",
  "--ui-panel-dialog-compact-font": "var(--ui-font-family-compact)",
} satisfies UiThemeTokens;

/** Document titles and footers have their own roles, separate from content headings. */
export const windowTypographyTokens = {
  "--ui-panel-window-title-font-size": "16px",
  "--ui-panel-window-title-line-height": "16px",
  "--ui-panel-window-title-font": "var(--ui-font-family)",
  "--ui-panel-window-footer-font-size": "16px",
  "--ui-panel-window-footer-line-height": "18px",
  "--ui-panel-window-footer-font": "var(--ui-font-family-compact)",
} satisfies UiThemeTokens;
