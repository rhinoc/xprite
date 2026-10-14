import type { CSSProperties } from "react";

import { SupportChannel } from "$/components/dialogs/support/support-links";

/**
 * Monochrome 12x12 pixel glyphs drawn for this dialog (no brand artwork). Each row is one pixel
 * row; "#" paints with currentColor, so every glyph follows the theme ink and stays crisp.
 */
const GLYPHS: Readonly<Record<SupportChannel, readonly string[]>> = {
  [SupportChannel.GitHub]: [
    ".....##.....",
    ".....##.....",
    "....####....",
    "############",
    ".##########.",
    "..########..",
    "...######...",
    "...######...",
    "..###..###..",
    "..##....##..",
    ".##......##.",
    "............",
  ],
  [SupportChannel.KoFi]: [
    "............",
    "...#..#.....",
    "..#..#......",
    "...#..#.....",
    "#########...",
    "#.......####",
    "#.##.##.#..#",
    "#.#####.#..#",
    "#..###..####",
    "#...#...#...",
    ".#######....",
    "............",
  ],
  [SupportChannel.WeChat]: [
    "..#####.....",
    ".#.....#....",
    "#..#.#..#...",
    "#.......#...",
    "#....######.",
    ".#..#......#",
    "..#.#.#..#.#",
    "....#......#",
    ".....######.",
    ".........#..",
    "..........#.",
    "............",
  ],
  [SupportChannel.Bilibili]: [
    "..#......#..",
    "...#....#...",
    "############",
    "#..........#",
    "#.#......#.#",
    "#.#......#.#",
    "#..........#",
    "#...#..#...#",
    "#....##....#",
    "############",
    "..#......#..",
    "............",
  ],
  [SupportChannel.Xiaohongshu]: [
    ".##########.",
    "#..........#",
    "#.########.#",
    "#.#......#.#",
    "#.#.####.#.#",
    "#.#......#.#",
    "#.#.###..#.#",
    "#.#......#.#",
    "#.########.#",
    "#..........#",
    ".##########.",
    "............",
  ],
  [SupportChannel.Xiaoheihe]: [
    ".....##.....",
    "...##..##...",
    ".##......##.",
    "#.##....##.#",
    "#...####...#",
    "#.....#....#",
    "#.....#....#",
    "#.....#....#",
    ".##...#..##.",
    "...##.#.##..",
    ".....###....",
    "............",
  ],
  [SupportChannel.X]: [
    "##.......##.",
    ".##......#..",
    "..##....#...",
    "...##..#....",
    "....###.....",
    "....###.....",
    "...#..##....",
    "..#....##...",
    ".#......##..",
    "#........##.",
    "............",
    "............",
  ],
};

export const SUPPORT_ICON_PIXELS = 12;

/** One SVG path per glyph: horizontal runs of painted pixels. */
export function supportGlyphPath(channel: SupportChannel): string {
  const segments: string[] = [];
  GLYPHS[channel].forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "#") {
        x += 1;
        continue;
      }
      const start = x;
      while (row[x] === "#") x += 1;
      segments.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return segments.join("");
}

export function SupportIcon({
  channel,
  scale = 2,
  style,
}: {
  channel: SupportChannel;
  scale?: number;
  style?: CSSProperties;
}) {
  const size = SUPPORT_ICON_PIXELS * scale;
  return (
    <svg
      viewBox={`0 0 ${SUPPORT_ICON_PIXELS} ${SUPPORT_ICON_PIXELS}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flex: "0 0 auto", marginInlineEnd: scale * 2, ...style }}
    >
      <path d={supportGlyphPath(channel)} />
    </svg>
  );
}
