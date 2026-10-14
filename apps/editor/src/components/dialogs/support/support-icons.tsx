import type { CSSProperties } from "react";

import { SupportChannel } from "$/components/dialogs/support/support-links";

/** Pixel colour used by a glyph; `ink` follows the theme text colour so dark marks adapt. */
type GlyphPalette = Readonly<Record<string, string>>;

interface SupportGlyph {
  palette: GlyphPalette;
  rows: readonly string[];
}

export const SUPPORT_ICON_PIXELS = 16;
const INK = "currentColor";

/**
 * Hand-drawn 16x16 pixel renditions of each platform mark, made for this dialog rather than traced
 * from brand files. Each row is one pixel row; "." is transparent and other characters index the
 * palette. Rendered with crisp edges, so they stay sharp at any integer scale.
 */
const GLYPHS: Readonly<Record<SupportChannel, SupportGlyph>> = {
  [SupportChannel.GitHub]: {
    palette: { k: INK },
    rows: [
      "......kkkk......",
      "....kkkkkkkk....",
      "...kkkkkkkkkk...",
      "..kk.kkkkkk.kk..",
      ".kkk..kkkk..kkk.",
      ".kkk........kkk.",
      "kkk..........kkk",
      "kkk..........kkk",
      "kkk..........kkk",
      "kkkk........kkkk",
      ".kkkkk....kkkkk.",
      ".k..kk....kkkkk.",
      "..kk......kkkk..",
      "...kkk....kkk...",
      "....kk....kk....",
      "......kkkk......",
    ],
  },
  [SupportChannel.KoFi]: {
    palette: { k: "#202020", w: "#ffffff", r: "#ff5e5b" },
    rows: [
      "................",
      "................",
      "................",
      "kkkkkkkkkkkkk...",
      "kwwwwwwwwwwwkkk.",
      "kwwrrwwrrwwwkwwk",
      "kwrrrrrrrrwwkwwk",
      "kwrrrrrrrrwwkwwk",
      "kwwrrrrrrwwwkwk.",
      "kwwwrrrrwwwwkk..",
      "kwwwwrrwwwwwk...",
      ".kwwwwwwwwwk....",
      "..kkkkkkkkk.....",
      "................",
      "................",
      "................",
    ],
  },
  [SupportChannel.WeChat]: {
    palette: { g: "#07c160", w: "#ffffff" },
    rows: [
      ".gggggggggggggg.",
      "gggggggggggggggg",
      "ggwwwwwwwggggggg",
      "gwwwwwwwwwgggggg",
      "gwwgwwwgwwgggggg",
      "gwwwwwwwwwwwwwgg",
      "gwwwwwwwwgggwwwg",
      "ggwwwwwwgwwwwwwg",
      "gggwwwwgwgwwgwwg",
      "ggwwgggwwwwwwwwg",
      "gggggggwwwwwwwwg",
      "ggggggggwwwwwwgg",
      "ggggggggggggwwgg",
      "gggggggggggggwgg",
      "gggggggggggggggg",
      ".gggggggggggggg.",
    ],
  },
  [SupportChannel.Bilibili]: {
    palette: { b: "#00a1d6" },
    rows: [
      "................",
      "...b........b...",
      "....b......b....",
      ".....b....b.....",
      ".bbbbbbbbbbbbbb.",
      "b..............b",
      "b.bbbbbbbbbbbb.b",
      "b.b..........b.b",
      "b.b.bb....bb.b.b",
      "b.b..........b.b",
      "b.b...b..b...b.b",
      "b.b....bb....b.b",
      "b.bbbbbbbbbbbb.b",
      "b..............b",
      ".bbbbbbbbbbbbbb.",
      "...bb......bb...",
    ],
  },
  [SupportChannel.Xiaohongshu]: {
    palette: { r: "#ff2442", w: "#ffffff" },
    rows: [
      ".rrrrrrrrrrrrrr.",
      "rrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrr",
      "rrwwrrwwwrwwrrrr",
      "rrwrwrwrrrwrwrrr",
      "rrwwrrwwrrwrwrrr",
      "rrwrwrwrrrwrwrrr",
      "rrwrwrwwwrwwrrrr",
      "rrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrr",
      ".rrrrrrrrrrrrrr.",
    ],
  },
  [SupportChannel.Xiaoheihe]: {
    palette: { k: INK },
    rows: [
      ".kkkkkkkkkkkkkk.",
      "kkkkkkkkkkkkkkkk",
      "kkkkkkk..kkkkkkk",
      "kkkkk..kk..kkkkk",
      "kkk..kkkkkk..kkk",
      "kk.kkkkkkkkkk.kk",
      "kk.kk..kk..kk.kk",
      "kk.kkkk..kkkk.kk",
      "kk.kkkkk.kkkk.kk",
      "kk.kkkkk.kkkk.kk",
      "kk.kkkkk.kkkk.kk",
      "kkk..kkk.kkk..kk",
      "kkkkk..k.k..kkkk",
      "kkkkkkk...kkkkkk",
      "kkkkkkkkkkkkkkkk",
      ".kkkkkkkkkkkkkk.",
    ],
  },
  [SupportChannel.X]: {
    palette: { k: INK },
    rows: [
      "................",
      "kkk..........kk.",
      ".kkk........kk..",
      "..kkk......kk...",
      "...kkk....kk....",
      "....kkk..kk.....",
      ".....kkkkk......",
      "......kkk.......",
      "......kkkk......",
      ".....kk.kkk.....",
      "....kk...kkk....",
      "...kk.....kkk...",
      "..kk.......kkk..",
      ".kk.........kkk.",
      "kk...........kkk",
      "................",
    ],
  },
  [SupportChannel.ItchIo]: {
    palette: { r: "#fa5c5c", w: "#ffffff" },
    rows: [
      "................",
      "..rrrrrrrrrrrr..",
      ".rrrrrrrrrrrrrr.",
      "rrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrr",
      ".rr.rr.rr.rr.rr.",
      "..rrrrrrrrrrrr..",
      "..rrrrrrrrrrrr..",
      "..rrrwwrrwwrrr..",
      "..rrwwwwwwwwrr..",
      "..rrwwwrrwwwrr..",
      "..rrrwrrrrwrrr..",
      "..rrrrrrrrrrrr..",
      "..rrrrrrrrrrrr..",
      "................",
      "................",
    ],
  },
};

/** One SVG path per palette colour, made of horizontal runs of painted pixels. */
export function supportGlyphPaths(channel: SupportChannel): readonly { fill: string; d: string }[] {
  const { palette, rows } = GLYPHS[channel];
  const paths = new Map<string, string[]>();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x]!;
      if (key === ".") {
        x += 1;
        continue;
      }
      const start = x;
      while (row[x] === key) x += 1;
      const fill = palette[key];
      if (!fill) throw Error(`Unknown palette key ${key} in ${channel}.`);
      const runs = paths.get(fill) ?? [];
      runs.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
      paths.set(fill, runs);
    }
  });
  return [...paths].map(([fill, runs]) => ({ fill, d: runs.join("") }));
}

export function supportGlyphRows(channel: SupportChannel): readonly string[] {
  return GLYPHS[channel].rows;
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
      aria-hidden="true"
      focusable="false"
      data-support-icon={channel}
      style={{ display: "block", flex: "0 0 auto", marginInlineEnd: scale * 2, ...style }}
    >
      {supportGlyphPaths(channel).map((path) => (
        <path key={path.fill} fill={path.fill} d={path.d} />
      ))}
    </svg>
  );
}
