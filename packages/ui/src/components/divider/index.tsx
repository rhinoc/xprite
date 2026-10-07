import { centerThemePixel, useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import type { AtlasPartName } from "$/base/theme/theme-part";
import { ThemeRepeat, ThemeRepeatAxis } from "$/base/theme/theme-repeat";
import {
  surfaceLayout,
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { sizedControlBounds } from "$/components/control-flow/placement";
import type { SizedControlPlacement } from "$/components/control-flow/placement";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/divider/divider.module.css";

const SEPARATOR_SPRITE_PITCH = 18;
const SEPARATOR_HORIZONTAL_LABEL_LEFT = 8;
const SEPARATOR_HORIZONTAL_LABEL_TOP = 4;
const SEPARATOR_LABEL_BACKGROUND_LEFT = 4;
const SEPARATOR_LABEL_BACKGROUND_PADDING = 8;
const SEPARATOR_LABEL_BACKGROUND_TOP = 0;
const SEPARATOR_LABEL_VERTICAL_BLEED = 1;

export enum DividerVariant {
  Standard = "standard",
  InView = "in-view",
  InViewHeading = "in-view-heading",
}

interface DividerContentProps {
  variant?: DividerVariant;
  viewport?: SurfaceViewport;
  text?: string;
  vertical?: boolean;
  className?: string;
}

export type DividerProps = DividerContentProps & SizedControlPlacement;

/** Themed horizontal or vertical divider with an optional section label. */
export function Divider(props: DividerProps) {
  const {
    variant = DividerVariant.Standard,
    bounds: suppliedBounds,
    relativeTo = { x: 0, y: 0 },
    viewport = DEFAULT_SURFACE_VIEWPORT,
    text = "",
    vertical = false,
    className,
  } = props;
  const bounds = sizedControlBounds(props);
  const { translateSource, definition } = useTheme();
  const { measureThemeText, themeFontHeight } = useThemeText();
  const displayText = text ? translateSource(text) : "";
  const layout = surfaceLayout(bounds, viewport);
  const origin = surfaceLayout({ ...relativeTo, width: 0, height: 0 }, viewport);
  const part = (vertical ? "separator_vert" : "separator_horz") as AtlasPartName;
  const spriteSize = (vertical ? definition.parts[part].width : definition.parts[part].height) * 2;
  const hasHorizontalLabel = !!displayText && !vertical;
  const inView = variant !== DividerVariant.Standard;
  const heading = variant === DividerVariant.InViewHeading;
  const background = heading
    ? "var(--ui-heading-face)"
    : inView
      ? definition.colors.background
      : definition.colors.window_face;
  const textY = inView
    ? centerThemePixel(bounds.y, bounds.height, themeFontHeight()) - bounds.y
    : SEPARATOR_HORIZONTAL_LABEL_TOP;
  const labelTextBottom = textY + themeFontHeight();
  const labelClipBottom = hasHorizontalLabel
    ? Math.max(0, labelTextBottom - bounds.height) + SEPARATOR_LABEL_VERTICAL_BLEED
    : 0;
  const clipBottomPx = bounds.height > 0 ? (labelClipBottom * layout.height) / bounds.height : 0;

  return (
    <span
      aria-hidden="true"
      className={`${styles.separator}${className ? ` ${className}` : ""}`}
      style={{
        position: suppliedBounds ? "absolute" : "relative",
        ...(suppliedBounds
          ? { left: layout.left - origin.left, top: layout.top - origin.top }
          : {}),
        width: layout.width,
        height: layout.height,
        background: inView ? background : undefined,
        // Some measured separator bounds are shorter than the text line box.
        overflowX: "clip",
        overflowY: hasHorizontalLabel ? "visible" : "clip",
        clipPath: hasHorizontalLabel ? `inset(0 0 -${clipBottomPx}px 0)` : undefined,
      }}
    >
      <span
        className={styles.artwork}
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: `scale(${layout.width / bounds.width}, ${layout.height / bounds.height})`,
        }}
      >
        {!heading && (
          <ThemeRepeat
            part={part}
            length={vertical ? bounds.height : bounds.width}
            pitch={SEPARATOR_SPRITE_PITCH}
            axis={vertical ? ThemeRepeatAxis.Vertical : ThemeRepeatAxis.Horizontal}
            x={vertical ? centerThemePixel(bounds.x, bounds.width, spriteSize) - bounds.x : 0}
            y={
              vertical
                ? 0
                : inView
                  ? centerThemePixel(bounds.y, bounds.height, spriteSize) - bounds.y
                  : displayText
                    ? 6
                    : centerThemePixel(bounds.y, bounds.height, spriteSize) - bounds.y
            }
          />
        )}
        {hasHorizontalLabel && (
          <>
            <span
              className={styles.labelFace}
              style={{
                left: SEPARATOR_LABEL_BACKGROUND_LEFT,
                top: SEPARATOR_LABEL_BACKGROUND_TOP,
                width: measureThemeText(displayText) + SEPARATOR_LABEL_BACKGROUND_PADDING,
                height: bounds.height + labelClipBottom,
                background,
              }}
            />
            <Text
              variant={TextVariant.PositionedPixel}
              text={displayText}
              x={SEPARATOR_HORIZONTAL_LABEL_LEFT}
              y={textY}
              color={heading ? "var(--ui-heading-ink)" : definition.colors.separator_label}
            />
          </>
        )}
      </span>
    </span>
  );
}
