import type { UiThemeTokens } from "$/base/theme/theme-definition";

/** Generic color-pair defaults; original fixed-color tiles supply their own pixels. */
export function desktopPatternTokens(): UiThemeTokens {
  return { "--ui-pattern-foreground": "#000000", "--ui-pattern-background": "#ffffff" };
}
