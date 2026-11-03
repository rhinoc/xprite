import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { ScrollbarStyle } from "$/base/theme/theme-types";
import { borderSize, clientPoint, clientRect, clientToLocal } from "$/base/utils/dom-geometry";
import { PointerDragActivation, PointerDragAxis } from "$/base/utils/pointer-drag-activation";
import { PointerResizeGesture } from "$/base/utils/pointer-resize-gesture";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import { useElementSize } from "$/base/utils/use-element-size";
import { ScrollbarThumb, ScrollbarThumbGrip } from "$/components/scrollbar/ScrollbarThumb";
import type { FilmstripSliderProps } from "$/components/slider/types";

import styles from "$/components/slider/variants/filmstrip/filmstrip.module.css";

const PERCENT = 100;
const LARGE_STEP = 10;

enum DragTarget {
  Start,
  End,
  Position,
}
interface Drag {
  pointer: number;
  target: DragTarget;
  initial: [number, number];
  initialPosition: number;
  activation: PointerDragActivation;
  resize: PointerResizeGesture;
}

/** A bounded range over media thumbnails, with a separately seekable playhead. */
export function FilmstripSlider({
  frames,
  frameAspectRatio,
  duration,
  value,
  position,
  step,
  disabled = false,
  labels,
  formatValue,
  onValueChange,
  onPositionChange,
  className,
}: FilmstripSliderProps) {
  const rail = useRef<HTMLDivElement>(null);
  const size = useElementSize(rail);
  const visibleCount = Math.max(
    1,
    Math.min(frames.length, Math.round(size.width / Math.max(1, size.height * frameAspectRatio))),
  );
  const visibleFrames = Array.from(
    { length: visibleCount },
    (_, index) =>
      frames[Math.round((index * (frames.length - 1)) / Math.max(1, visibleCount - 1))] ?? null,
  );
  const drag = useRef<Drag | null>(null);
  const [hovered, setHovered] = useState<DragTarget | null>(null);
  const [focused, setFocused] = useState<DragTarget | null>(null);
  const current = useRef({ value, position });
  current.current = { value, position };
  const minimumSpan = Math.min(duration, step);
  const snap = (time: number) =>
    time >= duration ? duration : Math.max(0, Math.round(time / step) * step);
  const update = (target: DragTarget, time: number) => {
    const [start, end] = current.current.value;
    const next = snap(time);
    if (target === DragTarget.Start) onValueChange([Math.min(end - minimumSpan, next), end]);
    else if (target === DragTarget.End) onValueChange([start, Math.max(start + minimumSpan, next)]);
    else onPositionChange(Math.max(start, Math.min(end, next)));
  };
  const timeAt = (event: PointerEvent<HTMLDivElement>) => {
    const element = rail.current!;
    return (
      (clientToLocal(element, clientPoint(event)).x / Math.max(1, borderSize(element).width)) *
      duration
    );
  };
  const begin = (event: PointerEvent<HTMLDivElement>, target: DragTarget) => {
    if (disabled || event.button !== 0 || drag.current || !rail.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const initialValue =
      target === DragTarget.Start ? value[0] : target === DragTarget.End ? value[1] : position;
    drag.current = {
      pointer: event.pointerId,
      target,
      initial: [...value],
      initialPosition: position,
      activation: new PointerDragActivation(event, PointerDragAxis.Horizontal),
      resize: new PointerResizeGesture(event, {
        axis: PointerDragAxis.Horizontal,
        initialValue,
        pixelsPerUnit: Math.max(1, clientRect(rail.current).width) / duration,
      }),
    };
    if (target === DragTarget.Position) update(target, timeAt(event));
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const action = drag.current;
    if (!action || action.pointer !== event.pointerId || disabled) return;
    if (action.target === DragTarget.Position) {
      if (action.activation.update(event)) update(action.target, timeAt(event));
    } else {
      const next = action.resize.valueAt(event);
      if (next !== null) update(action.target, next);
    }
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancel = false) => {
    const action = drag.current;
    if (!action || action.pointer !== event.pointerId) return;
    drag.current = null;
    if (cancel) {
      if (action.target === DragTarget.Position) onPositionChange(action.initialPosition);
      else onValueChange(action.initial);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>, target: DragTarget) => {
    if (disabled) return;
    const active =
      target === DragTarget.Start ? value[0] : target === DragTarget.End ? value[1] : position;
    const increment = step * (event.shiftKey ? LARGE_STEP : 1);
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = active - increment;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = active + increment;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = duration;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    update(target, next);
  };
  const pointerProps = (target: DragTarget) => ({
    ...stylusPointerInputProps(),
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => begin(event, target),
    onPointerMove: move,
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => keyboard(event, target),
  });
  const percent = (time: number) => `${(time / duration) * PERCENT}%`;
  return (
    <div
      className={`${styles.root} ${className ?? ""}`}
      role="group"
      aria-label={labels.range}
      data-disabled={disabled}
    >
      <div
        ref={rail}
        className={styles.rail}
        style={
          {
            "--trim-start": percent(value[0]),
            "--trim-end": percent(value[1]),
            "--trim-position": percent(position),
          } as CSSProperties
        }
      >
        <div
          {...pointerProps(DragTarget.Position)}
          className={styles.seek}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={labels.position}
          aria-valuemin={value[0]}
          aria-valuemax={value[1]}
          aria-valuenow={position}
          aria-valuetext={formatValue(position)}
          aria-disabled={disabled}
        >
          <div className={styles.frames} aria-hidden="true">
            {visibleFrames.map((url, index) => (
              <span key={index}>{url && <img src={url} alt="" draggable={false} />}</span>
            ))}
          </div>
          <div className={styles.before} aria-hidden="true" />
          <div className={styles.after} aria-hidden="true" />
        </div>
        <div className={styles.selection} aria-hidden="true" />
        <div className={styles.playhead} aria-hidden="true" />
        {([DragTarget.Start, DragTarget.End] as const).map((target) => (
          <div
            {...pointerProps(target)}
            key={target}
            className={styles.handle}
            data-end={target === DragTarget.End}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={target === DragTarget.Start ? labels.start : labels.end}
            aria-valuemin={target === DragTarget.Start ? 0 : value[0] + minimumSpan}
            aria-valuemax={target === DragTarget.Start ? value[1] - minimumSpan : duration}
            aria-valuenow={target === DragTarget.Start ? value[0] : value[1]}
            aria-valuetext={formatValue(target === DragTarget.Start ? value[0] : value[1])}
            aria-disabled={disabled}
            onPointerEnter={() => setHovered(target)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setFocused(target)}
            onBlur={() => setFocused(null)}
          >
            <ScrollbarThumb
              scrollbarStyle={ScrollbarStyle.Classic}
              grip={ScrollbarThumbGrip.VerticalBars}
              className={styles.grip}
              hovered={hovered === target || focused === target}
            />
          </div>
        ))}
      </div>
      <div className={styles.times} aria-hidden="true">
        <span>{formatValue(value[0])}</span>
        <span>{formatValue(value[1])}</span>
      </div>
    </div>
  );
}
