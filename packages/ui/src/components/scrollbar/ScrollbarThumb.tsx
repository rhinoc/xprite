import type { CSSProperties } from "react";

import { useTheme } from "$/base/theme/theme-context";
import type { AtlasPartName } from "$/base/theme/theme-name-types";
import { ThemePart } from "$/base/theme/theme-part";
import { ScrollbarStyle } from "$/base/theme/theme-types";
import { scrollbarStyles } from "$/components/scrollbar/variants";

import styles from "$/components/scrollbar/scrollbar.module.css";

export interface ScrollbarThumbProps {
  /** The `Scrollbar` variant to mirror; defaults to the theme's own scrollbar style. */
  scrollbarStyle?: ScrollbarStyle;
  hovered?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The same thumb artwork `Scrollbar` paints (vertical orientation), for controls that must look
 * like a scrollbar thumb but are not scrolling anything. Position and size come from the caller.
 */
export function ScrollbarThumb({
  scrollbarStyle,
  hovered = false,
  className,
  style,
}: ScrollbarThumbProps) {
  const { definition } = useTheme();
  const parts = definition.controlParts?.scrollbar;
  const resolved =
    scrollbarStyle ??
    (parts?.areaStyle === ScrollbarStyle.Classic ? ScrollbarStyle.Classic : ScrollbarStyle.Compact);
  const variant = scrollbarStyles[resolved];
  const cls = (base: string) => (className ? `${base} ${className}` : base);
  if (resolved === ScrollbarStyle.Classic && parts)
    return <span aria-hidden="true" className={cls(styles.classicThumbStandalone)} style={style} />;
  const compactThumb = resolved === ScrollbarStyle.Classic ? undefined : parts?.compactThumb;
  if (compactThumb)
    return (
      <span
        aria-hidden="true"
        className={cls(styles.compactThumbStandalone)}
        data-hovered={hovered}
        style={{ ...style, borderWidth: compactThumb.borderWidth }}
      />
    );
  // Atlas themes draw the thumb outline and bevel with the track artwork, not the thumb part, so
  // paint track then thumb exactly like Scrollbar does, clipped to the thumb's own box.
  const suffix = hovered && variant.hoverArtwork ? "_hot" : "";
  return (
    <span aria-hidden="true" className={cls(styles.thumbStandalone)} style={style}>
      <span className={styles.thumbArtwork}>
        <ThemePart
          part={`${variant.artworkPrefix}_thumb${suffix}` as AtlasPartName}
          scale={2}
          drawCenter
          className={styles.thumb}
          style={{ left: 0, top: 0, width: "100%", height: "100%" }}
        />
      </span>
    </span>
  );
}
