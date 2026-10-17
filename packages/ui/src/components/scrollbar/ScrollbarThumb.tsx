import type { CSSProperties } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { ThemePart } from "$/base/theme/theme-part";
import { ScrollbarStyle } from "$/base/theme/theme-types";

import styles from "$/components/scrollbar/scrollbar.module.css";

export interface ScrollbarThumbProps {
  hovered?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Force a scrollbar skin regardless of theme; Classic is the plain bordered thumb. */
  scrollbarStyle?: ScrollbarStyle;
}

/**
 * The same thumb artwork `Scrollbar` paints (vertical orientation), for controls that must look
 * like a scrollbar thumb but are not scrolling anything. Position and size come from the caller.
 */
export function ScrollbarThumb({
  hovered = false,
  className,
  style,
  scrollbarStyle,
}: ScrollbarThumbProps) {
  const { definition } = useTheme();
  const compactThumb =
    scrollbarStyle === ScrollbarStyle.Classic
      ? undefined
      : definition.controlParts?.scrollbar?.compactThumb;
  const classic =
    (scrollbarStyle ?? definition.controlParts?.scrollbar?.areaStyle) === ScrollbarStyle.Classic;
  const cls = (base: string) => (className ? `${base} ${className}` : base);
  if (classic)
    return <span aria-hidden="true" className={cls(styles.classicThumbStandalone)} style={style} />;
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
  // paint track then thumb exactly like Scrollbar does (the thumb fills the whole track here).
  return (
    <span aria-hidden="true" className={cls(styles.thumbStandalone)} style={style}>
      <ThemePart
        part={hovered ? "mini_scrollbar_bg_hot" : "mini_scrollbar_bg"}
        scale={2}
        drawCenter
        className={styles.track}
      />
      <ThemePart
        part={hovered ? "mini_scrollbar_thumb_hot" : "mini_scrollbar_thumb"}
        scale={2}
        drawCenter
        className={styles.thumb}
        style={{ left: 0, top: 0, width: "100%", height: "100%" }}
      />
    </span>
  );
}
