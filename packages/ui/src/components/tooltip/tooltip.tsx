import { useCallback, type CSSProperties } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { ThemeIcon, ThemePart } from "$/base/theme/theme-part";
import { clientRect } from "$/base/utils/dom-geometry";
import { surfaceLayout, type SurfaceBounds } from "$/components/canvas-surface/geometry";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import { Text, TextVariant } from "$/components/text";
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
const TOOLTIP_LINE_HEIGHT = 14;
const TOOLTIP_FONT_SCALE = RASTER_SCALE;
const TOOLTIP_FONT_FAMILY = "var(--xse-font, PixelArtBitmap, FusionPixelZhHans, monospace)";
let tooltipTextProbe: HTMLSpanElement | undefined;

function measureTooltipText(text: string) {
  const measure = (tooltipTextProbe ??= document.createElement("span"));
  Object.assign(measure.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    display: "inline-block",
    whiteSpace: "pre",
    fontFamily: TOOLTIP_FONT_FAMILY,
    fontSize: `${TOOLTIP_LINE_HEIGHT}px`,
    lineHeight: `${TOOLTIP_LINE_HEIGHT}px`,
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
      <span className={styles.textLayer}>
        {layout.lines.map((line, lineIndex) => (
          <Text
            key={lineIndex}
            variant={TextVariant.PositionedPixel}
            text={line}
            x={TOOLTIP_TEXT_INSET}
            y={TOOLTIP_TEXT_INSET + lineIndex * TOOLTIP_LINE_HEIGHT}
            color={theme.colors.text}
            font="default"
            scale={TOOLTIP_FONT_SCALE}
          />
        ))}
      </span>
    </div>
  );
}

/** Delayed tooltip using DOM theme sprites, WOFF2 text, placement, and interaction. */
export function Tooltip({ text, ...props }: TooltipProps) {
  const { translateSource } = useTheme();
  const displayText = translateSource(text);
  const render = useCallback(
    (layout: PositionedTooltipLayout) => <TooltipArtwork layout={layout} />,
    [],
  );
  return (
    <PositionedTooltip
      {...props}
      text={displayText}
      measureText={measureTooltipText}
      render={render}
    />
  );
}
