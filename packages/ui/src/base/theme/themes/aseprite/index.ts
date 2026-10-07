import type { UiTheme } from "$/base/theme/theme-definition";
import { panelWindowKindTokens } from "$/base/theme/window-chrome-tokens";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";

export const asepriteTheme: UiTheme = {
  id: "aseprite",
  label: "Aseprite",
  async load(appearance) {
    const { themeDefinition, ...artwork } = await (appearance === "dark"
      ? import("$/base/theme/generated/themes/aseprite-dark")
      : import("$/base/theme/generated/themes/aseprite-light"));
    return {
      ...artwork,
      definition: {
        ...themeDefinition,
        controlParts: {
          button: {
            font: "mini",
            // The bitmap button frame reserves its final row for the shadow.
            frameIconOffset: { x: 0, y: -RASTER_SCALE / 2 },
          },
        },
      },
      tokens: {
        ...panelWindowKindTokens,
        "--ui-panel-window-title-height": "28px",
        "--ui-panel-window-title-gap": "10px",
        "--ui-panel-window-title-inset": "6px",
        "--ui-panel-window-title-font-size": "16px",
        "--ui-panel-window-title-line-height": "16px",
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
        "--ui-panel-window-footer-font-size": "16px",
        "--ui-panel-window-footer-line-height": "18px",
        "--ui-panel-window-footer-font": "var(--ui-font-family-compact)",

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
