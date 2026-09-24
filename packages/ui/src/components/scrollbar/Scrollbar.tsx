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
  "minimumThumbSize" | "renderArtwork" | "variant"
> {
  variant?: ScrollbarVariant;
}

/** Aseprite-themed scrollbar with shared pointer, keyboard, and range behavior. */
export function Scrollbar({ variant = "mini", className, ...props }: ScrollbarProps) {
  const { definition } = useTheme();
  const minimumThumbSize = definition.dimensions.scrollbar_size * 4;
  const variantStyle = scrollbarVariants[variant];

  return (
    <ScrollbarPrimitive
      {...props}
      className={`${styles.scrollbar}${className ? ` ${className}` : ""}`}
      variant={variant}
      minimumThumbSize={minimumThumbSize}
      renderArtwork={({ bounds, layout, geometry, horizontal, hover }) => {
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
