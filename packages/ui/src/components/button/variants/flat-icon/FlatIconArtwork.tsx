import { ThemeIcon, type AtlasPartName } from "$/base/theme/theme-part";
import type { SurfaceBounds } from "$/components/canvas-surface";

import styles from "$/components/button/button.module.css";

export function FlatIconArtwork({
  bounds,
  width,
  height,
  icon,
  iconX,
  iconY,
  ink,
  face,
}: {
  bounds: SurfaceBounds;
  width: number;
  height: number;
  icon?: AtlasPartName;
  iconX: number;
  iconY: number;
  ink: string;
  face: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={styles.themeArtwork}
      style={{
        width: bounds.width,
        height: bounds.height,
        transform: `scale(${width / bounds.width}, ${height / bounds.height})`,
        background: face,
      }}
    >
      {icon && <ThemeIcon part={icon} x={iconX} y={iconY} scale={2} color={ink} />}
    </span>
  );
}
