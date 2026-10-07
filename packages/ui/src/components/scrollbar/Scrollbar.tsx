import {
  ScrollbarPrimitive,
  type ScrollbarPrimitiveProps,
} from "$/base/components/scrollbar/primitive";
import { useTheme } from "$/base/theme/theme-context";
import { ThemePart, type AtlasPartName } from "$/base/theme/theme-part";
import type { ScrollbarVariant } from "$/components/scrollbar/types";
import { scrollbarVariants } from "$/components/scrollbar/variants";

import styles from "$/components/scrollbar/scrollbar.module.css";

export interface ScrollbarProps extends Omit<
  ScrollbarPrimitiveProps,
  "minimumThumbSize" | "renderArtwork" | "variant" | "arrowExtent" | "fixedThumbSize"
> {
  variant?: ScrollbarVariant;
}

/** Themed scrollbar with shared pointer, keyboard, and range behavior. */
export function Scrollbar({ variant: suppliedVariant, className, ...props }: ScrollbarProps) {
  const { definition } = useTheme();
  const variant = suppliedVariant ?? definition.controlParts?.scrollbar?.areaVariant ?? "mini";
  const minimumThumbSize = definition.dimensions.scrollbar_size * 4;
  const variantStyle = scrollbarVariants[variant];
  const classic = variant === "regular" ? definition.controlParts?.scrollbar : undefined;

  return (
    <ScrollbarPrimitive
      {...props}
      className={`${styles.scrollbar}${className ? ` ${className}` : ""}`}
      variant={variant}
      minimumThumbSize={minimumThumbSize}
      arrowExtent={classic?.arrowExtent}
      fixedThumbSize={classic?.thumbSize}
      renderArtwork={({ bounds, layout, geometry, horizontal, hover }) => {
        if (classic) {
          const extent = horizontal ? bounds.width : bounds.height;
          const arrowSize = Math.min(classic.arrowExtent, extent / 2);
          const arrows = [false, true].map((end) => {
            const origin = end ? extent - arrowSize : 0;
            return (
              <span
                key={String(end)}
                className={styles.classicArrow}
                style={{
                  left: horizontal ? origin : 0,
                  top: horizontal ? 0 : origin,
                  width: horizontal ? arrowSize : bounds.width,
                  height: horizontal ? bounds.height : arrowSize,
                }}
              >
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 16 16"
                  shapeRendering="crispEdges"
                  aria-hidden="true"
                >
                  <g
                    transform={
                      horizontal
                        ? `rotate(${end ? 90 : -90} 8 8)`
                        : end
                          ? "rotate(180 8 8)"
                          : undefined
                    }
                  >
                    <path
                      d="M7 3h2v1H7Z M6 4h1v1H6Z M9 4h1v1H9Z M5 5h1v1H5Z M10 5h1v1h-1Z M4 6h1v1H4Z M11 6h1v1h-1Z M3 7h1v1H3Z M12 7h1v1h-1Z M2 8h4v1H2Z M10 8h4v1h-4Z M5 9h1v3H5Z M10 9h1v3h-1Z M5 12h6v1H5Z"
                      fill="var(--xse-text)"
                    />
                  </g>
                </svg>
              </span>
            );
          });
          return (
            <span
              aria-hidden="true"
              className={styles.classicFrame}
              style={{
                width: bounds.width,
                height: bounds.height,
                transform: `scale(${layout.width / bounds.width}, ${layout.height / bounds.height})`,
                transformOrigin: "top left",
              }}
            >
              <span
                className={styles.classicTrack}
                style={{
                  left: horizontal ? arrowSize : 0,
                  top: horizontal ? 0 : arrowSize,
                  width: horizontal ? extent - arrowSize * 2 : bounds.width,
                  height: horizontal ? bounds.height : extent - arrowSize * 2,
                }}
              />
              {arrows}
              {geometry.length > 0 && (
                <span
                  className={styles.classicThumb}
                  style={{
                    left: horizontal ? geometry.position : 0,
                    top: horizontal ? 0 : geometry.position,
                    width: horizontal ? geometry.length : bounds.width,
                    height: horizontal ? bounds.height : geometry.length,
                  }}
                />
              )}
            </span>
          );
        }
        const suffix = hover && variantStyle.hoverArtwork ? "_hot" : "";
        const backgroundPart = `${variantStyle.artworkPrefix}_bg${suffix}` as AtlasPartName;
        const thumbPart = `${variantStyle.artworkPrefix}_thumb${suffix}` as AtlasPartName;
        return (
          <span
            aria-hidden="true"
            className={styles.artwork}
            style={{
              width: bounds.width,
              height: bounds.height,
              transform: `scale(${layout.width / bounds.width}, ${layout.height / bounds.height})`,
              transformOrigin: "top left",
            }}
          >
            <ThemePart part={backgroundPart} scale={2} drawCenter className={styles.track} />
            {geometry.length > 0 && (
              <ThemePart
                part={thumbPart}
                scale={2}
                drawCenter
                className={styles.thumb}
                style={{
                  left: horizontal ? geometry.position : 0,
                  top: horizontal ? 0 : geometry.position,
                  width: horizontal ? geometry.length : bounds.width,
                  height: horizontal ? bounds.height : geometry.length,
                }}
              />
            )}
          </span>
        );
      }}
    />
  );
}
