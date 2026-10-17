import type { CSSProperties } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { ThemePart } from "$/base/theme/theme-part";
import { ScrollbarStyle } from "$/base/theme/theme-types";

import styles from "$/components/scrollbar/scrollbar.module.css";

export interface ScrollbarThumbProps {
  hovered?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The same thumb artwork `Scrollbar` paints (vertical orientation), for controls that must look
 * like a scrollbar thumb but are not scrolling anything. Position and size come from the caller.
 */
export function ScrollbarThumb({ hovered = false, className, style }: ScrollbarThumbProps) {
  const { definition } = useTheme();
  const compactThumb = definition.controlParts?.scrollbar?.compactThumb;
  const classic = definition.controlParts?.scrollbar?.areaStyle === ScrollbarStyle.Classic;
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
  return (
    <ThemePart
      part={hovered ? "mini_scrollbar_thumb_hot" : "mini_scrollbar_thumb"}
      scale={2}
      drawCenter
      className={cls(styles.thumbStandalone)}
      style={style}
    />
  );
}
