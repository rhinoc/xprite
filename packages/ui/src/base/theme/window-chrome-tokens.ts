import { windowKindTypographyTokens, windowTypographyTokens } from "$/base/theme/typography-tokens";

/** Window-purpose metrics shared by themes; each theme can override individual tokens. */
export const panelWindowKindTokens = {
  ...windowKindTypographyTokens,
  "--ui-panel-utility-shadow-offset": "1px",
  "--ui-panel-utility-title-height": "22px",
  "--ui-panel-utility-title-inset": "4px",
  "--ui-panel-utility-title-gap": "6px",
  "--ui-panel-utility-stripe-height": "10px",
  "--ui-panel-utility-stripe-grid": "2px 2px",
  "--ui-panel-utility-stripe-leading-width": "8px",
  "--ui-panel-dialog-frame-width": "4px",
  "--ui-panel-dialog-shadow-offset": "2px",
  "--ui-panel-dialog-title-min-height": "32px",
  "--ui-panel-dialog-title-padding": "12px 16px 0",
} as const;

/** Every theme has usable window typography even when its artwork supplies no extra tokens. */
export const panelWindowTokens = {
  ...panelWindowKindTokens,
  ...windowTypographyTokens,
  "--ui-panel-window-title-height": "28px",
  "--ui-panel-window-title-gap": "10px",
  "--ui-panel-window-title-inset": "6px",
  "--ui-panel-window-stripe-height": "16px",
  "--ui-panel-window-stripe-width": "1px",
  "--ui-panel-window-stripe-step": "3px",
  "--ui-panel-window-emphasized-frame-width": "2px",
  "--ui-panel-window-emphasized-shadow-offset": "3px",
  "--ui-panel-window-emphasized-title-face": "var(--ui-color-paper)",
  "--ui-panel-window-footer-height": "24px",
  "--ui-panel-window-footer-gap": "8px",
  "--ui-panel-window-footer-padding": "3px 10px",
} as const;
