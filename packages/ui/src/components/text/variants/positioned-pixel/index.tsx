import { Fragment } from "react";

import { cjkPixelGlyphMask } from "$/base/theme/cjk-pixel-glyph";
import { themeFontFamily } from "$/base/theme/font-families";
import { pixelFallbackAdvance } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { FontRole } from "$/base/theme/theme-types";
import { UiFontRenderer, type UiFontDefinition } from "$/base/theme/theme-types";
import { useThemeAssets } from "$/base/theme/use-theme-assets";
import { cn } from "$/base/utils/cn";
import { ScriptText, useCjkRunStyle } from "$/components/text/script-offset";
import { textRuns } from "$/components/text/text-runs";
import { type PositionedPixelTextProps } from "$/components/text/types";

import primitiveStyles from "$/base/theme/primitive-theme.module.css";
import styles from "$/components/text/variants/positioned-pixel/positioned.module.css";

function cjkRunStyle(
  font: UiFontDefinition,
  scale: number,
  titleCjk: boolean,
  offset: React.CSSProperties | undefined,
): React.CSSProperties {
  const titleFamily = titleCjk ? font.titleCjkFontFamily : undefined;
  const titleSize = titleCjk ? font.titleCjkFontSize : undefined;
  const family = titleFamily ?? font.cjkFontFamily;
  const size = titleSize ?? font.cjkFontSize;
  return {
    ...offset,
    fontFamily: `${family}, monospace`,
    fontSize: `${(size * scale) / 2}px`,
    lineHeight: `${(font.lineHeight * scale) / 2}px`,
  };
}

function atlasGlyphStyle(char: string, scale: number, color: string, font: UiFontDefinition) {
  if (font.renderer !== UiFontRenderer.Bitmap) return null;
  const glyph = font.atlas.glyphs[String(char.codePointAt(0))];
  if (!glyph) return null;

  const [sourceX, sourceY, width, height] = glyph;
  const glyphWidth = Math.max(1, Math.round(width * scale));
  const glyphHeight = Math.max(1, Math.round(height * scale));
  const atlasUrl = `url("${font.atlas.url}")`;
  return {
    width: glyphWidth,
    height: glyphHeight,
    backgroundColor: color,
    imageRendering: "crisp-edges" as const,
    maskImage: atlasUrl,
    maskMode: "alpha" as const,
    maskPosition: `${-Math.round(sourceX * scale)}px ${-Math.round(sourceY * scale)}px`,
    maskRepeat: "no-repeat" as const,
    maskSize: `${Math.round(font.atlas.width * scale)}px ${Math.round(font.atlas.height * scale)}px`,
    WebkitMaskImage: atlasUrl,
    WebkitMaskPosition: `${-Math.round(sourceX * scale)}px ${-Math.round(sourceY * scale)}px`,
    WebkitMaskRepeat: "no-repeat" as const,
    WebkitMaskSize: `${Math.round(font.atlas.width * scale)}px ${Math.round(font.atlas.height * scale)}px`,
  };
}

/**
 * Compact CJK in the DOM. The face is a scaled pixel font, and DOM text cannot threshold its own
 * antialiasing, so each glyph is the canvas path's binarised raster, painted as a coloured mask.
 */
function cjkMaskRun(
  text: string,
  metrics: Extract<UiFontDefinition, { renderer: UiFontRenderer.Bitmap }>,
  scale: number,
  color: string,
  offset: React.CSSProperties | undefined,
) {
  return (
    <span style={offset}>
      {[...text].map((char, index) => {
        const mask = cjkPixelGlyphMask(
          char,
          metrics,
          scale,
          pixelFallbackAdvance(char.codePointAt(0)!, metrics.cjkAdvance),
        );
        if (!mask) return null;
        const url = `url("${mask.url}")`;
        return (
          <span
            key={index}
            aria-hidden="true"
            className={styles.atlasGlyph}
            style={{
              width: mask.width,
              height: mask.height,
              backgroundColor: color,
              imageRendering: "pixelated",
              maskImage: url,
              maskSize: "100% 100%",
              maskRepeat: "no-repeat",
              WebkitMaskImage: url,
              WebkitMaskSize: "100% 100%",
              WebkitMaskRepeat: "no-repeat",
            }}
          />
        );
      })}
    </span>
  );
}

export function PositionedPixelText({
  text,
  x,
  y,
  color,
  font = FontRole.Primary,
  scale = 2,
  titleCjk = false,
  style,
}: Omit<PositionedPixelTextProps, "variant">) {
  const { definition } = useTheme();
  const cjkFontReady = useThemeAssets()?.cjkFontReady ?? false;
  const scriptRunStyle = useCjkRunStyle(scale);
  const metrics = definition.typography[font];
  const bitmapInDom = metrics.renderer === UiFontRenderer.Bitmap && metrics.atlasInDom;
  const runs = metrics.renderer === UiFontRenderer.Bitmap ? textRuns(text) : [];
  const scaledFontSize = bitmapInDom ? metrics.lineHeight : metrics.fontSize;
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
              fontSize: `${(scaledFontSize * scale) / 2}px`,
              lineHeight: `${(metrics.lineHeight * scale) / 2}px`,
            }),
        ...(metrics.renderer === UiFontRenderer.Native
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
      {bitmapInDom ? (
        runs.map((run, index) =>
          run.cjk && cjkFontReady && metrics.renderer === UiFontRenderer.Bitmap && !titleCjk ? (
            <Fragment key={index}>
              {cjkMaskRun(run.text, metrics, scale, color, scriptRunStyle)}
            </Fragment>
          ) : run.cjk ? (
            <span
              key={index}
              className={styles.fallbackCjk}
              style={cjkRunStyle(metrics, scale, titleCjk, scriptRunStyle)}
            >
              {run.text}
            </span>
          ) : (
            [...run.text].map((char, charIndex) => {
              const glyphStyle = atlasGlyphStyle(char, scale, color, metrics);
              return glyphStyle ? (
                <span
                  key={`${index}:${charIndex}`}
                  aria-hidden="true"
                  className={styles.atlasGlyph}
                  style={glyphStyle}
                />
              ) : (
                <span
                  key={`${index}:${charIndex}`}
                  className={styles.fallbackLatin}
                  style={{
                    fontFamily: metrics.fallbackFontFamily,
                    fontSize: `${(metrics.cjkFontSize * scale) / 2}px`,
                  }}
                >
                  {char}
                </span>
              );
            })
          ),
        )
      ) : metrics.renderer === UiFontRenderer.Bitmap ? (
        runs.map((run, index) =>
          run.cjk ? (
            <span key={index} style={cjkRunStyle(metrics, scale, titleCjk, scriptRunStyle)}>
              {run.text}
            </span>
          ) : (
            <span key={index}>{run.text}</span>
          ),
        )
      ) : (
        <ScriptText scale={scale}>{text}</ScriptText>
      )}
    </span>
  );
}
