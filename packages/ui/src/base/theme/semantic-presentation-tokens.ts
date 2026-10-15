import { themeCjkFontFamily, themeFontFamily } from "$/base/theme/font-families";
import type { UiThemeTokens } from "$/base/theme/theme-definition";
import type { UiStyleDefinition } from "$/base/theme/theme-types";
import { readingTypographyTokens } from "$/base/theme/typography-tokens";
import { panelWindowTokens } from "$/base/theme/window-chrome-tokens";

/** Resolve both roles from this skin, without importing any other skin's fonts. */
export function semanticFontFamilies(typography: UiStyleDefinition["typography"]) {
  return {
    primary: themeFontFamily(typography.primary),
    compact: themeFontFamily(typography.compact),
    cjk: themeCjkFontFamily(typography.primary),
  };
}

interface SemanticPresentationPalette {
  primaryFont: string;
  compactFont: string;
  cjkFont: string;
  /** Theme-wide CJK vertical offset in CSS px at scale 2; see UiTypography.cjkTextOffsetY. */
  cjkTextOffsetY?: number;
  ink: string;
  mutedInk: string;
  paper: string;
  line: string;
  desktop: string;
  chrome: string;
  border: string;
  canvas: string;
  link: string;
}

/** Pure semantic defaults shared by hydrated controls and static first paint. */
export function semanticPresentationTokens({
  primaryFont,
  compactFont,
  cjkFont,
  cjkTextOffsetY = 0,
  ink,
  mutedInk,
  paper,
  line,
  desktop,
  chrome,
  border,
  canvas,
  link,
}: SemanticPresentationPalette): UiThemeTokens {
  return {
    ...panelWindowTokens,
    ...readingTypographyTokens,
    "--ui-font-family": primaryFont,
    "--ui-font-family-compact": compactFont,
    "--ui-font-family-cjk": `${cjkFont}, monospace`,
    "--ui-cjk-text-offset-y": `${cjkTextOffsetY}px`,
    "--ui-color-ink": ink,
    "--ui-color-muted-ink": mutedInk,
    "--ui-color-paper": paper,
    "--ui-color-line": line,
    "--ui-color-border": border,
    "--ui-color-canvas": canvas,
    "--ui-color-link": link,
    "--ui-color-desktop": desktop,
    "--ui-color-chrome": chrome,
    "--ui-font-weight-normal": "400",
    "--ui-color-error-ink": "#a11",
    "--ui-color-danger-muted-ink": "#8b1c1c",
    "--ui-chrome-face": chrome,
    "--ui-theme-font-size": "9.566px",
    "--ui-color-white": "#fff",
    "--ui-color-checker-light": "var(--ui-color-checker-light-token)",
    "--ui-color-checker-dark": "var(--ui-color-checker-dark-token)",
    "--ui-overlay-backdrop": "rgba(0, 0, 0, 0.25)",
    "--ui-menu-underline-height": "2px",
    "--ui-text-flow-line-height": "1.35",
    "--ui-group-box-title-height": "16px",
    "--ui-text-primary-size": "14px",
    "--ui-text-compact-size": "12px",
    "--ui-text-mini-size": "12px",
    "--ui-text-mini-cjk-size": "10px",
    "--ui-text-mini-line": "10px",
    "--ui-field-font": "var(--ui-font-family)",
    "--ui-field-font-size": "var(--ui-text-size, var(--ui-text-primary-size))",
    "--ui-field-line-height": "1.5",
    "--ui-textarea-code-line-height": "1.35",
    "--ui-textarea-code-padding": "6px",
    "--ui-meta-font-size": "12px",
    "--ui-font-size-control": "11px",
    "--ui-button-font": "var(--ui-font-size-control) / 1 var(--ui-font-family)",
    "--ui-button-surface-font-size": "14px",
    "--ui-button-surface-line-height": "1.2",
    "--ui-button-quiet-font-size": "16px",
    "--ui-button-quiet-line-height": "1.3",
    "--ui-button-quiet-font": "var(--ui-font-family)",
    "--ui-button-content-line-height": "1",
    "--ui-menu-navigation-line-height": "12px",
    "--ui-desktop-icon-font-size": "16px",
    "--ui-desktop-icon-line-height": "18px",
    "--ui-desktop-icon-font-family": "var(--ui-font-family-compact)",
    "--ui-navigation-list-line-height": "18px",
    "--ui-color-checker-light-token": "#c0c0c0",
    "--ui-color-checker-dark-token": "#808080",
  };
}
