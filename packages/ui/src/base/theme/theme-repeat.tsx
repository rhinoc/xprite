import { useTheme } from "$/base/theme/theme-context";
import type { AtlasPartName } from "$/base/theme/theme-name-types";
import { ThemeIcon } from "$/base/theme/theme-part";

import styles from "$/base/theme/theme-part.module.css";

export enum ThemeRepeatAxis {
  Horizontal = "horizontal",
  Vertical = "vertical",
}
const THEME_REPEAT_SCALE = 2;
const DEFAULT_REPEAT_PITCH = 18;

/** Repeated artwork uses the same cached pixel painter as individual icons. */
export function ThemeRepeat({
  part,
  length,
  pitch = DEFAULT_REPEAT_PITCH,
  x = 0,
  y = 0,
  axis = ThemeRepeatAxis.Horizontal,
}: {
  part: AtlasPartName;
  length: number;
  pitch?: number;
  x?: number;
  y?: number;
  axis?: ThemeRepeatAxis;
}) {
  const { definition } = useTheme();
  const source = definition.parts[part];
  const count = Math.ceil(Math.max(0, length) / pitch);
  const horizontal = axis === ThemeRepeatAxis.Horizontal;
  return (
    <span
      aria-hidden="true"
      data-slot="theme-repeat"
      data-theme-part={part}
      className={styles.themeRepeat}
      style={{
        left: x,
        top: y,
        width: horizontal ? count * pitch : source.width * THEME_REPEAT_SCALE,
        height: horizontal ? source.height * THEME_REPEAT_SCALE : count * pitch,
      }}
    >
      {Array.from({ length: count }, (_, index) => (
        <ThemeIcon
          key={index}
          part={part}
          scale={THEME_REPEAT_SCALE}
          x={horizontal ? index * pitch : 0}
          y={horizontal ? 0 : index * pitch}
        />
      ))}
    </span>
  );
}
