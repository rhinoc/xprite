import type { UiThemeTokens } from "$/base/theme/theme-definition";

/** Original sticky-note artwork colors stay legible on their own paper in either appearance. */
const NOTE_PALETTES = {
  yellow: {
    stippleDark: "#ecda11",
    stippleLight: "#ebeba2",
    paper: "#ffffb3",
    edge: "#ffda00",
    control: "#ffb300",
  },
  cyan: {
    stippleDark: "#11daec",
    stippleLight: "#a2ebeb",
    paper: "#b3ffff",
    edge: "#00daff",
    control: "#00b3ff",
  },
  green: {
    stippleDark: "#8fec8f",
    stippleLight: "#c8ebc8",
    paper: "#daffda",
    edge: "#87ff87",
    control: "#00f300",
  },
  pink: {
    stippleDark: "#ecb6b6",
    stippleLight: "#ebc9c9",
    paper: "#ffdada",
    edge: "#ffb3b3",
    control: "#ff87ff",
  },
  lilac: {
    stippleDark: "#b6b6ec",
    stippleLight: "#c9c9eb",
    paper: "#dadaff",
    edge: "#b3b3ff",
    control: "#b3b3ff",
  },
  gray: {
    stippleDark: "#d1d1d1",
    stippleLight: "#dfdfdf",
    paper: "#f3f3f3",
    edge: "#cdcdcd",
    control: "#969696",
  },
  white: {
    stippleDark: "#181818",
    stippleLight: "#e7e7e7",
    paper: "#fff",
    edge: "#000",
    control: "#000",
  },
};

/** Pure presentation defaults, also used by static first-paint generation. */
export function noteTokens(fontFamily: string): UiThemeTokens {
  return {
    ...Object.fromEntries(
      Object.entries(NOTE_PALETTES).flatMap(([color, palette]) => [
        [`--ui-note-${color}-stipple-dark`, palette.stippleDark],
        [`--ui-note-${color}-stipple-light`, palette.stippleLight],
        [`--ui-note-${color}-paper`, palette.paper],
        [`--ui-note-${color}-edge`, palette.edge],
        [`--ui-note-${color}-control`, palette.control],
      ]),
    ),
    "--ui-note-ink": "#000",
    "--ui-note-muted": "#444",
    "--ui-note-highlight": "#fff",
    "--ui-note-font-family": fontFamily,
    "--ui-note-font-size": "16px",
    "--ui-note-line-height": "12px",
    "--ui-note-width": "126px",
    "--ui-note-min-height": "47px",
    "--ui-note-border-width": "1px",
    "--ui-note-content-padding": "9px 5px 5px",
    "--ui-note-window-content-top": "0px",
    "--ui-note-header-height": "9px",
    "--ui-note-header-padding": "0px 4px",
    "--ui-note-stipple-size": "2px",
    "--ui-note-control-size": "7px",
    "--ui-note-resize-size": "8px",
    "--ui-note-focus-width": "1px",
    "--ui-note-focus-offset": "1px",
    "--ui-note-collapsed-title-margin": "0px 3px",
    "--ui-note-collapsed-title-padding": "0px 2px",
  };
}
