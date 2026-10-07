import * as React from "react";

import { useThemeText, isCjkGlyph, centerThemePixel } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { computedStyle } from "$/base/utils/dom-geometry";
import { surfaceLayout, DEFAULT_SURFACE_VIEWPORT } from "$/components/canvas-surface";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import type { ControlTextProps, PixelFont } from "$/components/text/types";
import { PositionedPixelText } from "$/components/text/variants/positioned-pixel";

import styles from "$/components/text/variants/control/control.module.css";

const CJK_LABEL_GLYPH_BLEED = 1;

let labelTextMetricContext: CanvasRenderingContext2D | null | undefined;

function getLabelTextMetricContext() {
  if (typeof document === "undefined") return null;
  if (labelTextMetricContext === undefined) {
    labelTextMetricContext = document.createElement("canvas").getContext("2d");
  }
  return labelTextMetricContext;
}

export function ControlText({
  bounds: suppliedBounds,
  pixelSize,
  relativeTo = { x: 0, y: 0 },
  viewport = DEFAULT_SURFACE_VIEWPORT,
  text,
  font = "default",
  color,
  align = "left",
  fill,
  wrap = false,
  style,
  className,
  variant: _variant,
  ...props
}: ControlTextProps) {
  const { definition: theme, translateSource } = useTheme();
  const { measureThemeText, themeFontHeight } = useThemeText();
  const displayText = translateSource(text);
  const labelRef = React.useRef<HTMLSpanElement>(null);
  const [inkBounds, setInkBounds] = React.useState<{
    text: string;
    font: PixelFont;
    right: number;
  } | null>(null);
  const bounds = suppliedBounds ?? {
    x: 0,
    y: 0,
    width: pixelSize ? pixelSize.width * RASTER_SCALE : measureThemeText(displayText, font),
    height: pixelSize ? pixelSize.height * RASTER_SCALE : themeFontHeight(font),
  };
  React.useLayoutEffect(() => {
    if (align !== "right") return;
    let active = true;
    const measureInkRight = () => {
      const textElement = labelRef.current?.querySelector<HTMLElement>("[data-font]");
      const context = getLabelTextMetricContext();
      if (!textElement || !context) return;
      const computed = computedStyle(textElement);
      context.font = computed.font;
      context.textAlign = "left";
      context.direction = computed.direction as CanvasDirection;
      const canvasTextStyles = context as unknown as Record<string, string>;
      if ("fontKerning" in context) canvasTextStyles.fontKerning = computed.fontKerning;
      if ("letterSpacing" in context) {
        canvasTextStyles.letterSpacing =
          computed.letterSpacing === "normal" ? "0px" : computed.letterSpacing;
      }
      if ("wordSpacing" in context) {
        canvasTextStyles.wordSpacing =
          computed.wordSpacing === "normal" ? "0px" : computed.wordSpacing;
      }
      if ("lang" in context) canvasTextStyles.lang = document.documentElement.lang || "en";
      const right = context.measureText(displayText).actualBoundingBoxRight;
      if (Number.isFinite(right)) {
        setInkBounds((current) =>
          current?.text === displayText && current.font === font && current.right === right
            ? current
            : { text: displayText, font, right },
        );
      }
    };
    measureInkRight();
    const fontsReady = typeof document === "undefined" ? undefined : document.fonts?.ready;
    if (fontsReady) void fontsReady.then(() => active && measureInkRight());
    return () => {
      active = false;
    };
  }, [align, displayText, font, style, theme]);
  const ink = color ?? theme.colors.text;
  const textHeight = themeFontHeight(font);
  const textY = centerThemePixel(bounds.y, bounds.height, textHeight) - bounds.y;
  const containsCjk = [...displayText].some((char) => isCjkGlyph(char.codePointAt(0)!));
  const glyphBleed = containsCjk
    ? CJK_LABEL_GLYPH_BLEED
    : (theme.typography?.[font]?.glyphBleed ?? 0);
  const clipTop = Math.max(0, -textY) + glyphBleed;
  const clipBottom = Math.max(0, textY + textHeight - bounds.height) + glyphBleed;
  const textX =
    align === "center"
      ? centerThemePixel(bounds.x, bounds.width, measureThemeText(displayText, font)) - bounds.x
      : align === "right"
        ? bounds.width -
          (inkBounds?.text === displayText && inkBounds.font === font
            ? inkBounds.right
            : measureThemeText(displayText, font))
        : 0;
  const layout = surfaceLayout(bounds, viewport);
  return (
    <span
      {...props}
      ref={labelRef}
      className={cn(styles.uiLabel, className)}
      role="img"
      aria-label={displayText}
      style={{
        position: suppliedBounds ? "absolute" : "relative",
        left: layout.left - Math.floor((relativeTo.x * viewport.width) / viewport.sceneWidth),
        top: layout.top - Math.floor((relativeTo.y * viewport.height) / viewport.sceneHeight),
        flex: "0 0 auto",
        width: layout.width,
        height: layout.height,
        pointerEvents: "none",
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: bounds.width,
          height: bounds.height,
          overflowX: "clip",
          overflowY: glyphBleed ? "visible" : "clip",
          clipPath: glyphBleed ? `inset(-${clipTop}px 0 -${clipBottom}px 0)` : undefined,
          background: fill,
          transform: `scale(${layout.width / bounds.width}, ${layout.height / bounds.height})`,
          transformOrigin: "top left",
        }}
      >
        <PositionedPixelText
          text={displayText}
          x={textX}
          y={textY}
          font={font}
          color={ink}
          style={
            wrap
              ? {
                  left: 0,
                  width: bounds.width,
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                  textAlign: align,
                  top: "50%",
                  transform: "translateY(-50%)",
                }
              : undefined
          }
        />
      </span>
    </span>
  );
}
