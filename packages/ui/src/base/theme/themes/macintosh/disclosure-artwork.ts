import { UiColorScheme } from "$/base/theme/theme-types";

const INDICATOR_SIZE = 11;
const TRIANGLE_WIDTH = 6;
const LABEL_GAP = 5;
const TRIANGLE_ROWS = [
  "#     ",
  "##    ",
  "#o#   ",
  "#.o#  ",
  "#o.o# ",
  "#.o.o#",
  "#o.o# ",
  "#.o#  ",
  "#o#   ",
  "##    ",
  "#     ",
] as const;

/** Pixel contour and stippled fill adapted from Brian Levy's CC BY 4.0 Controls export. */
function disclosureImage(
  ink: string,
  highlight: string,
  accent: string,
  open: boolean,
  pressed: boolean,
) {
  const colors: Record<string, string> = { "#": ink, ".": highlight, o: accent };
  const pixels = TRIANGLE_ROWS.flatMap((row, y) =>
    [...row].flatMap((pixel, x) =>
      colors[pixel]
        ? [`<rect x="${x}" y="${y}" width="1" height="1" fill="${pressed ? ink : colors[pixel]}"/>`]
        : [],
    ),
  ).join("");
  // Closed triangles align their tip with the open triangle's right edge.
  const transform = open
    ? `translate(${INDICATOR_SIZE} 2) rotate(90)`
    : `translate(${INDICATOR_SIZE - TRIANGLE_WIDTH} 0)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${INDICATOR_SIZE}" height="${INDICATOR_SIZE}" shape-rendering="crispEdges"><g transform="${transform}">${pixels}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function macintoshDisclosureTokens(ink: string, paper: string, colorScheme: UiColorScheme) {
  const accent = colorScheme === UiColorScheme.Dark ? "#7777aa" : "#b3b3ff";
  return {
    "--ui-disclosure-border-width": "0px",
    "--ui-disclosure-face": "transparent",
    "--ui-disclosure-font-size": "16px",
    "--ui-disclosure-line-height": "16px",
    "--ui-disclosure-summary-height": "20px",
    "--ui-disclosure-summary-padding": "2px 0",
    "--ui-disclosure-label-gap": `${LABEL_GAP}px`,
    "--ui-disclosure-indicator-size": `${INDICATOR_SIZE}px`,
    "--ui-disclosure-indicator-fill": "transparent",
    "--ui-disclosure-closed-shape": "none",
    "--ui-disclosure-open-shape": "none",
    "--ui-disclosure-closed-image": disclosureImage(ink, paper, accent, false, false),
    "--ui-disclosure-open-image": disclosureImage(ink, paper, accent, true, false),
    "--ui-disclosure-closed-pressed-image": disclosureImage(ink, paper, accent, false, true),
    "--ui-disclosure-open-pressed-image": disclosureImage(ink, paper, accent, true, true),
    "--ui-disclosure-note-closed-image": disclosureImage("#000", "#fff", "#b3b3ff", false, false),
    "--ui-disclosure-note-open-image": disclosureImage("#000", "#fff", "#b3b3ff", true, false),
    "--ui-disclosure-note-closed-pressed-image": disclosureImage(
      "#000",
      "#fff",
      "#b3b3ff",
      false,
      true,
    ),
    "--ui-disclosure-note-open-pressed-image": disclosureImage(
      "#000",
      "#fff",
      "#b3b3ff",
      true,
      true,
    ),
    "--ui-disclosure-content-padding": `4px 0 8px ${INDICATOR_SIZE + LABEL_GAP}px`,
  };
}
