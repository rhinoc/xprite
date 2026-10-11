import type { UiTheme } from "$/base/theme/theme-definition";
import { FontRole, UiColorScheme } from "$/base/theme/theme-types";
import { asepriteCursors } from "$/base/theme/themes/aseprite/cursors";
import { asepriteTypography } from "$/base/theme/themes/aseprite/typography";
import { toastTokens } from "$/base/theme/toast-tokens";
import { panelWindowKindTokens } from "$/base/theme/window-chrome-tokens";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";

export const asepriteTheme: UiTheme = {
  id: "aseprite",
  label: "Aseprite",
  cursors: asepriteCursors,
  typography: asepriteTypography,
  async load(colorScheme) {
    await import("$assets/fonts/aseprite/fonts.css");
    const { themeDefinition, ...artwork } = await (colorScheme === UiColorScheme.Dark
      ? import("$/base/theme/generated/themes/aseprite-dark")
      : import("$/base/theme/generated/themes/aseprite-light"));
    return {
      ...artwork,
      definition: {
        ...themeDefinition,
        typography: asepriteTypography,
        controlParts: {
          button: {
            font: FontRole.Compact,
            // The bitmap button frame reserves its final row for the shadow.
            frameIconOffset: { x: 0, y: -RASTER_SCALE / 2 },
          },
        },
      },
      tokens: {
        ...toastTokens(colorScheme),
        ...panelWindowKindTokens,
        "--ui-panel-window-title-height": "28px",
        "--ui-panel-window-title-gap": "10px",
        "--ui-panel-window-title-inset": "6px",
        "--ui-panel-window-title-font": "var(--xse-font, var(--ui-font-family, monospace))",
        "--ui-panel-window-stripe-height": "16px",
        "--ui-panel-window-stripe-width": "1px",
        "--ui-panel-window-stripe-step": "3px",
        "--ui-panel-window-emphasized-frame-width": "2px",
        "--ui-panel-window-emphasized-shadow-offset": "3px",
        "--ui-panel-window-emphasized-title-face": themeDefinition.colors.window_face,
        "--ui-panel-window-footer-height": "24px",
        "--ui-panel-window-footer-gap": "8px",
        "--ui-panel-window-footer-padding": "3px 10px",

        "--ui-curve-background": "#000",
        "--ui-curve-border": "#ff0",
        "--ui-curve-grid": "#808000",
        "--ui-curve-line": "#fff",
        "--ui-curve-point": "#00f",
        "--ui-native-slider-thumb-shadow": `inset 1px 1px ${themeDefinition.colors.hot_face}, inset -1px -1px ${themeDefinition.colors.disabled}`,
        "--ui-button-surface-border-width": "2px",
        "--ui-button-surface-shadow": `inset 2px 2px ${themeDefinition.colors.hot_face}, inset -2px -2px var(--ui-button-surface-line)`,
        "--ui-button-surface-active-shadow": `inset 2px 2px ${themeDefinition.colors.disabled}`,
      },
    };
  },
};
