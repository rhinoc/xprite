import type { CSSProperties } from "react";

import { cn } from "$/base/utils/cn";
import { SliderOrientation, type NativeSliderProps } from "$/components/slider/types";

import styles from "$/components/slider/variants/native/native.module.css";

const PROGRESS_PERCENT_SCALE = 100;
const MAX_VISIBLE_TICKS = 32;

/** A flow-layout slider with the browser's pointer and keyboard interactions. */
export function NativeSlider({
  className,
  style,
  value,
  min,
  max,
  step,
  orientation = SliderOrientation.Horizontal,
  showTicks = false,
  onValueChange,
  "aria-label": ariaLabel,
  "aria-valuetext": ariaValueText,
  disabled,
}: NativeSliderProps) {
  const progress = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  const input = (
    <input
      type="range"
      data-orientation={orientation}
      aria-orientation={orientation}
      className={cn(styles.root, className)}
      style={
        {
          "--ui-native-slider-progress": `${progress * PROGRESS_PERCENT_SCALE}%`,
          ...style,
        } as CSSProperties
      }
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
      onChange={(event) => onValueChange(event.currentTarget.valueAsNumber)}
    />
  );
  if (!showTicks) return input;
  const count = Math.max(2, Math.min(MAX_VISIBLE_TICKS, Math.floor((max - min) / (step ?? 1)) + 1));
  return (
    <span className={styles.ticked} data-orientation={orientation}>
      {input}
      <span className={styles.ticks} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <span key={index} />
        ))}
      </span>
    </span>
  );
}
