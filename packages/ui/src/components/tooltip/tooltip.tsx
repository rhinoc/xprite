import { useCallback, type CSSProperties } from "react";

import { useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { ThemeIcon, ThemePart } from "$/base/theme/theme-part";
import { clientRect } from "$/base/utils/dom-geometry";
import { surfaceLayout, type SurfaceBounds } from "$/components/canvas-surface/geometry";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import { Text, TextVariant } from "$/components/text";
import { BalloonFrame, balloonBody } from "$/components/tooltip/balloon-frame";
import { tooltipArrow, type TooltipPlacementOption } from "$/components/tooltip/geometry";
import { PositionedTooltip } from "$/components/tooltip/positioned";
import type { PositionedTooltipLayout, TooltipTriggerContent } from "$/components/tooltip/types";

import styles from "$/components/tooltip/tooltip.module.css";

export type { TooltipTriggerProps, TooltipTriggerPropsGetter } from "$/components/tooltip/types";

export interface TooltipProps {
  /** Reuses the child DOM; use a function child for explicit event composition. */
  children: TooltipTriggerContent;
  /** Content is localized through the active theme provider. */
  text: string;
  delay?: number;
  /** Maximum width in scene pixels, including the text insets. */
  maxWidth?: number;
  disabled?: boolean;
  placement?: TooltipPlacementOption;
  targetBounds?: SurfaceBounds;
  targetOffsetX?: number;
}

const TOOLTIP_TEXT_INSET = 10;
const BALLOON_WIDTH_RESERVE = 2;
const BALLOON_HEIGHT_RESERVE = 1;
const TOOLTIP_LINE_HEIGHT = 14;
const TOOLTIP_FONT_SCALE = RASTER_SCALE;
let tooltipTextProbe: HTMLSpanElement | undefined;

function measureTooltipText(text: string, fontFamily: string, fontSize: string) {
  const measure = (tooltipTextProbe ??= document.createElement("span"));
  Object.assign(measure.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    display: "inline-block",
    whiteSpace: "pre",
    fontFamily,
    fontSize,
    lineHeight: fontSize,
    fontWeight: "400",
    fontStyle: "normal",
    fontKerning: "none",
    fontVariantLigatures: "none",
    fontSynthesis: "none",
  });
  measure.textContent = text;
  document.body.append(measure);
  const width = clientRect(measure).width;
  measure.remove();
  return Math.ceil(width);
}

function TooltipArtwork({ layout }: { layout: PositionedTooltipLayout }) {
  const { definition: theme } = useTheme();
  const { bounds, viewport } = layout;
  const skin = theme.controlParts?.tooltip;
  const balloon = skin?.balloon;
  const font = skin?.font ?? "default";
  const inset = skin?.padding ?? theme.dimensions.tooltip_text_inset ?? TOOLTIP_TEXT_INSET;
  const pointerSize = skin?.pointerSize ?? 0;
  const pointer =
    skin?.pointerArtworks?.[layout.placement] ??
    skin?.pointerArtworks?.[layout.placement === "bottom" ? "bottom-left" : "top-left"];
  const body = balloon
    ? balloonBody(bounds, layout.placement, pointerSize, pointer?.bodyInsets)
    : { left: 0, top: 0 };
  const lineHeight = theme.typography?.[font]?.lineHeight ?? TOOLTIP_LINE_HEIGHT;
  const scaleX = viewport.width / viewport.sceneWidth;
  const scaleY = viewport.height / viewport.sceneHeight;
  const displayBounds = surfaceLayout(bounds, viewport);
  const offsetX = bounds.x * scaleX - displayBounds.left;
  const offsetY = bounds.y * scaleY - displayBounds.top;
  const { clip, atlas } = tooltipArrow(bounds, layout.target, layout.placement);
  const artworkStyle: CSSProperties = {
    width: bounds.width,
    height: bounds.height,
    transform: `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY})`,
  };

  return (
    <div aria-hidden="true" className={styles.artwork} style={artworkStyle}>
      {balloon ? (
        <BalloonFrame
          layout={layout}
          pointerSize={pointerSize}
          pointerArtwork={pointer}
          face={theme.colors.tooltip_face}
          ink={theme.colors.tooltip_text}
        />
      ) : (
        <>
          <ThemePart
            className={styles.skin}
            part="tooltip"
            scale={TOOLTIP_FONT_SCALE}
            drawCenter
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: bounds.width,
              height: bounds.height,
              minWidth: 0,
              minHeight: 0,
              display: "block",
            }}
          />
          <span
            className={styles.arrowClip}
            style={{
              left: clip.x - bounds.x,
              top: clip.y - bounds.y,
              width: clip.width,
              height: clip.height,
            }}
          >
            <ThemeIcon
              part="tooltip_arrow"
              scale={TOOLTIP_FONT_SCALE}
              x={atlas.x - clip.x}
              y={atlas.y - clip.y}
            />
          </span>
        </>
      )}
      <span className={styles.textLayer}>
        {layout.lines.map((line, lineIndex) => (
          <Text
            key={lineIndex}
            variant={TextVariant.PositionedPixel}
            text={line}
            x={body.left + inset + (pointer?.textOffset?.x ?? 0)}
            y={body.top + inset + lineIndex * lineHeight + (pointer?.textOffset?.y ?? 0)}
            color={theme.colors.tooltip_text}
            font={font}
            scale={TOOLTIP_FONT_SCALE}
          />
        ))}
      </span>
    </div>
  );
}

/** Delayed tooltip using DOM theme sprites, WOFF2 text, placement, and interaction. */
export function Tooltip({ text, ...props }: TooltipProps) {
  const { translateSource, definition, tokens } = useTheme();
  const { measureThemeText } = useThemeText();
  const skin = definition.controlParts?.tooltip;
  const font = skin?.font ?? "default";
  const metrics = definition.typography?.[font];
  const inset = skin?.padding ?? definition.dimensions.tooltip_text_inset ?? TOOLTIP_TEXT_INSET;
  const textMetrics = metrics
    ? {
        inset,
        lineHeight: metrics.lineHeight,
        widthPadding: inset * 2 + (skin?.balloon ? BALLOON_WIDTH_RESERVE : 0),
        heightPadding: inset * 2 + (skin?.balloon ? BALLOON_HEIGHT_RESERVE : 0),
        pointerSize: skin?.pointerSize,
        pointerInsets: skin?.pointerArtworks
          ? Object.fromEntries(
              Object.entries(skin.pointerArtworks).map(([key, value]) => [key, value.bodyInsets]),
            )
          : undefined,
      }
    : undefined;
  const measure = useCallback(
    (text: string) =>
      metrics
        ? measureThemeText(text, font)
        : measureTooltipText(
            text,
            tokens["--ui-font-family"] ?? "inherit",
            tokens["--ui-text-default-size"] ?? `${TOOLTIP_LINE_HEIGHT}px`,
          ),
    [metrics, measureThemeText, font, tokens],
  );
  const displayText = translateSource(text);
  const render = useCallback(
    (layout: PositionedTooltipLayout) => <TooltipArtwork layout={layout} />,
    [],
  );
  return (
    <PositionedTooltip
      {...props}
      text={displayText}
      measureText={measure}
      textMetrics={textMetrics}
      render={render}
    />
  );
}
