import { desktopPatternTokens } from "$/base/theme/desktop-pattern-tokens";
import { noteTokens } from "$/base/theme/note-tokens";
import { pixelFrameImage } from "$/base/theme/pixel-frame";
import { semanticPresentationTokens } from "$/base/theme/semantic-presentation-tokens";
import type { UiAppearance } from "$/base/theme/theme-types";
import { macintoshBalloonImage } from "$/base/theme/themes/macintosh/balloon-frame";
import { panelWindowKindTokens } from "$/base/theme/window-chrome-tokens";

type Palette = {
  ink: string;
  paper: string;
  wash: string;
  muted: string;
  line: string;
  desktop: string;
};

const SURFACE_TONES = {
  light: {
    accent: "#c8c3e6",
    informative: "#cee5f1",
    positive: "#d4ede2",
    warning: "#f4edba",
  },
  dark: {
    accent: "#48405b",
    informative: "#334855",
    positive: "#3c4c33",
    warning: "#47452d",
  },
} as const;

/** Tokens shared by native controls and static public-page first paint. */
export function macintoshPublicSurfaceTokens(palette: Palette, appearance: UiAppearance = "light") {
  const tones = SURFACE_TONES[appearance];
  return {
    ...semanticPresentationTokens({
      primaryFont: "ChiKareGo2, FusionPixelZhHans, monospace",
      compactFont: "FindersKeepers, FusionPixelZhHans, monospace",
      ink: palette.ink,
      mutedInk: palette.muted,
      paper: palette.paper,
      line: palette.line,
      desktop: palette.desktop,
      chrome: palette.wash,
      border: palette.ink,
      canvas: palette.wash,
      link: palette.ink,
    }),
    ...noteTokens("var(--ui-font-family-compact)"),
    ...desktopPatternTokens(),
    ...panelWindowKindTokens,
    "--ui-panel-utility-title-height": "10px",
    "--ui-panel-utility-title-inset": "1px",
    "--ui-panel-utility-title-gap": "2px",
    "--ui-panel-utility-font-size": "16px",
    "--ui-panel-utility-line-height": "8px",
    "--ui-panel-utility-stripe-height": "7px",
    "--ui-menu-underline-height": "1px",
    "--ui-text-default-size": "16px",
    "--ui-text-compact-size": "16px",
    "--ui-font-size-control": "16px",
    "--ui-button-surface-font-size": "16px",
    "--ui-button-surface-line-height": "12px",
    "--ui-button-content-line-height": "12px",
    "--ui-color-checker-light-token": palette.paper,
    "--ui-color-checker-dark-token": palette.wash,
    "--ui-button-quiet-min-height": "20px",
    "--ui-button-quiet-font-size": "16px",
    "--ui-button-quiet-line-height": "20px",
    "--ui-button-quiet-ink": palette.ink,
    "--ui-button-quiet-active-ink": palette.ink,
    "--ui-button-quiet-active-face": palette.wash,
    "--ui-surface-neutral-face": palette.paper,
    "--ui-surface-neutral-ink": palette.ink,
    ...Object.fromEntries(
      Object.entries(tones).flatMap(([tone, face]) => [
        [`--ui-surface-${tone}-face`, face],
        [`--ui-surface-${tone}-ink`, palette.ink],
      ]),
    ),
    "--ui-panel-window-emphasized-frame-width": "1px",
    "--ui-panel-window-emphasized-shadow-offset": "1px",
    "--ui-panel-window-emphasized-title-face": palette.paper,
    "--ui-panel-window-footer-height": "24px",
    "--ui-panel-window-footer-gap": "8px",
    "--ui-panel-window-footer-padding": "3px 10px",
    "--ui-panel-window-footer-font-size": "16px",
    "--ui-panel-window-footer-line-height": "18px",
    "--ui-panel-window-footer-font": "var(--ui-font-family-compact)",
    "--ui-panel-window-title-height": "18px",
    "--ui-panel-window-title-gap": "7px",
    "--ui-panel-window-title-inset": "3px",
    "--ui-panel-window-title-font-size": "16px",
    "--ui-panel-window-title-line-height": "12px",
    "--ui-panel-window-title-font": "var(--xse-font, var(--ui-font-family, monospace))",
    "--ui-panel-window-stripe-height": "12px",
    "--ui-panel-window-stripe-width": "1px",
    "--ui-panel-window-stripe-step": "2px",
    "--ui-panel-window-stripe-offset": "0.5px",
    "--ui-desktop-icon-font-family": "var(--ui-font-family-compact)",
    "--ui-navigation-list-font-family": "var(--ui-font-family)",
    "--ui-navigation-list-face": palette.paper,
    "--ui-navigation-list-ink": palette.ink,
    "--ui-navigation-list-selected-face": palette.ink,
    "--ui-navigation-list-selected-ink": palette.paper,
    "--ui-navigation-list-row-height": "24px",
    "--ui-navigation-list-font-size": "16px",
    "--ui-menu-navigation-height": "20px",
    "--ui-menu-navigation-font-size": "16px",
    "--ui-menu-navigation-face": palette.paper,
    "--ui-menu-navigation-ink": palette.ink,
    "--ui-menu-navigation-highlight-face": palette.ink,
    "--ui-menu-navigation-highlight-ink": palette.paper,
    "--ui-static-button-frame-image": pixelFrameImage(palette.ink, palette.paper),
    "--ui-static-button-hot-image": pixelFrameImage(palette.ink, palette.wash),
    "--ui-static-button-pressed-image": pixelFrameImage(palette.ink, palette.ink),
    "--ui-card-frame-image": macintoshBalloonImage(palette.ink, palette.paper),
  };
}
