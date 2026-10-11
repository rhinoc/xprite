import type { UiThemeTokens } from "$/base/theme/theme-definition";
import { UiColorScheme } from "$/base/theme/theme-types";

const TOAST_COLORS = {
  [UiColorScheme.Light]: {
    info: { face: "#cee5f1", ink: "#112d40" },
    success: { face: "#d4ede2", ink: "#193b2c" },
    warning: { face: "#f4edba", ink: "#4d3600" },
    error: { face: "#f5d1d1", ink: "#5c1717" },
  },
  [UiColorScheme.Dark]: {
    info: { face: "#334855", ink: "#d5edff" },
    success: { face: "#334c3c", ink: "#d7f5df" },
    warning: { face: "#51482d", ink: "#fff0bb" },
    error: { face: "#553333", ink: "#ffdada" },
  },
} as const;

/** Message colors shared by interactive skins and static public pages. */
export function toastTokens(colorScheme: UiColorScheme): UiThemeTokens {
  return Object.fromEntries(
    Object.entries(TOAST_COLORS[colorScheme]).flatMap(([tone, colors]) => [
      [`--ui-toast-${tone}-face`, colors.face],
      [`--ui-toast-${tone}-ink`, colors.ink],
    ]),
  );
}
