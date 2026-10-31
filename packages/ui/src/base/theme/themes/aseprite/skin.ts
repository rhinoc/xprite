import type { UiThemeArtwork } from "$/base/theme/theme-definition";
import { FontRole, type UiColorScheme, type UiStyleDefinition } from "$/base/theme/theme-types";
import { toastTokens } from "$/base/theme/toast-tokens";
import { panelWindowKindTokens } from "$/base/theme/window-chrome-tokens";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";

/** Shared Aseprite control bindings: every theme here uses the Aseprite atlas layout. */
export function asepriteControlParts(): NonNullable<UiStyleDefinition["controlParts"]> {
  return {
    button: {
      font: FontRole.Compact,
      // The bitmap button frame reserves its final row for the shadow.
      frameIconOffset: { x: 0, y: -RASTER_SCALE / 2 },
      // Primary caps sit above the face centre once the shadow row is excluded.
      textOffsetY: { [FontRole.Primary]: 1 },
    },
  };
}

/** Panel, curve and button tokens built from the theme's own colors. */
export function asepriteSkinTokens(
  colors: UiStyleDefinition["colors"],
  colorScheme: UiColorScheme,
): UiThemeArtwork["tokens"] {
  return {
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
    "--ui-panel-window-emphasized-title-face": colors.window_face,
    "--ui-panel-window-footer-height": "24px",
    "--ui-panel-window-footer-gap": "8px",
    "--ui-panel-window-footer-padding": "3px 10px",
    "--ui-native-slider-thumb-shadow": `inset 1px 1px ${colors.hot_face}, inset -1px -1px ${colors.disabled}`,
    "--ui-button-surface-border-width": "2px",
    "--ui-button-surface-shadow": `inset 2px 2px ${colors.hot_face}, inset -2px -2px var(--ui-button-surface-line)`,
    "--ui-button-surface-active-shadow": `inset 2px 2px ${colors.disabled}`,
  };
}
