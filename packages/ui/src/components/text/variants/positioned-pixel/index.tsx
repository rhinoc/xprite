import { themeFontFamily } from "$/base/theme/font-families";
import { themeGlyphAssets } from "$/base/theme/theme-assets";
import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { textRuns } from "$/components/text/text-runs";
import type { PositionedPixelTextProps } from "$/components/text/types";

import primitiveStyles from "$/base/theme/primitive-theme.module.css";
import styles from "$/components/text/variants/positioned-pixel/positioned.module.css";

const MINI_FONT_ATLAS_WIDTH = 177;
const MINI_FONT_ATLAS_HEIGHT = 154;
const MINI_FONT_LINE_HEIGHT = 10;
const MINI_CJK_FONT_SIZE = 10;
const DEFAULT_FONT_SIZE = 14;
const MINI_FONT_FALLBACK_SIZE = 10;

const miniGlyphs = themeGlyphAssets.miniGlyphMetrics as Record<string, number[]>;

function miniGlyphStyle(char: string, scale: number, color: string) {
  const glyph = miniGlyphs[String(char.codePointAt(0))];
  if (!glyph) return null;

  const [sourceX, sourceY, width, height] = glyph;
  const glyphWidth = Math.max(1, Math.round(width * scale));
  const glyphHeight = Math.max(1, Math.round(height * scale));
  const atlasUrl = `url("${themeGlyphAssets.miniGlyphAtlasUrl}")`;
  return {
    width: glyphWidth,
    height: glyphHeight,
    backgroundColor: color,
    imageRendering: "crisp-edges" as const,
    maskImage: atlasUrl,
    maskMode: "alpha" as const,
    maskPosition: `${-Math.round(sourceX * scale)}px ${-Math.round(sourceY * scale)}px`,
    maskRepeat: "no-repeat" as const,
    maskSize: `${Math.round(MINI_FONT_ATLAS_WIDTH * scale)}px ${Math.round(MINI_FONT_ATLAS_HEIGHT * scale)}px`,
    WebkitMaskImage: atlasUrl,
    WebkitMaskPosition: `${-Math.round(sourceX * scale)}px ${-Math.round(sourceY * scale)}px`,
    WebkitMaskRepeat: "no-repeat" as const,
    WebkitMaskSize: `${Math.round(MINI_FONT_ATLAS_WIDTH * scale)}px ${Math.round(MINI_FONT_ATLAS_HEIGHT * scale)}px`,
  };
}

export function PositionedPixelText({
  text,
  x,
  y,
  color,
  font = "default",
  scale = 2,
  style,
}: Omit<PositionedPixelTextProps, "variant">) {
  const { definition } = useTheme();
  const metrics = definition.typography?.[font];
  const runs = font === "mini" && !metrics ? textRuns(text) : [];
  const baseFontSize = font === "mini" ? MINI_FONT_FALLBACK_SIZE : DEFAULT_FONT_SIZE;
  const baseLineHeight = font === "mini" ? MINI_FONT_LINE_HEIGHT : DEFAULT_FONT_SIZE;
  return (
    <span
      aria-hidden="true"
      className={cn(styles.positioned, primitiveStyles.uiBitmapFont)}
      style={{
        position: "absolute",
        left: x,
        top: y,
        whiteSpace: "pre",
        pointerEvents: "none",
        color,
        ...(scale === 2
          ? {}
          : {
              fontSize: `${(baseFontSize * scale) / 2}px`,
              lineHeight: `${(baseLineHeight * scale) / 2}px`,
            }),
        ...(metrics
          ? {
              fontFamily: themeFontFamily(metrics),
              fontSize: `${(metrics.fontSize * scale) / 2}px`,
              lineHeight: `${(metrics.lineHeight * scale) / 2}px`,
            }
          : {}),
        ...style,
      }}
      data-font={font}
    >
      {font === "mini" && !metrics
        ? runs.map((run, index) =>
            run.cjk ? (
              <span
                key={index}
                className={styles.miniCjk}
                style={{
                  fontFamily: "FusionPixelZhHans, monospace",
                  ...(scale === 2
                    ? {}
                    : {
                        fontSize: `${(MINI_CJK_FONT_SIZE * scale) / 2}px`,
                        lineHeight: `${(MINI_FONT_LINE_HEIGHT * scale) / 2}px`,
                      }),
                }}
              >
                {run.text}
              </span>
            ) : (
              [...run.text].map((char, charIndex) => {
                const glyphStyle = miniGlyphStyle(char, scale, color);
                return glyphStyle ? (
                  <span
                    key={`${index}:${charIndex}`}
                    aria-hidden="true"
                    className={styles.miniGlyph}
                    style={glyphStyle}
                  />
                ) : (
                  <span
                    key={`${index}:${charIndex}`}
                    className={styles.miniLatin}
                    style={{
                      fontFamily: "sans-serif",
                      ...(scale === 2
                        ? {}
                        : { fontSize: `${(MINI_FONT_FALLBACK_SIZE * scale) / 2}px` }),
                    }}
                  >
                    {char}
                  </span>
                );
              })
            ),
          )
        : text}
    </span>
  );
}
