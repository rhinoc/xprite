import * as React from "react";

import { useUi, type SurfaceBounds, type SurfaceViewport } from "@xprite/ui";
import { UiPart } from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";
import { clientPoint, clientToSurface, stylusPointerInputProps } from "@xprite/ui/utils";

import styles from "$/components/timeline/onion-skin-range/timeline-range.module.css";

export enum TimelineRangeHandle {
  Start = "start",
  End = "end",
}

const TIMELINE_RANGE_THEME_SCALE = 2;

export interface TimelineRangeSliderProps {
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
  range: { x: number; width: number; handleWidth: number } | null;
  itemWidth: number;
  scrollOffset: number;
  values: readonly [number, number];
  labels: readonly [string, string];
  disabled?: boolean;
  onAdjust: (
    side: TimelineRangeHandle,
    startIndex: number,
    currentIndex: number,
    startValues: readonly [number, number],
  ) => void;
}

function position(
  bounds: SurfaceBounds,
  relativeTo: { x: number; y: number } | undefined,
  viewport: SurfaceViewport,
): React.CSSProperties {
  const layout = surfaceLayout(bounds, viewport);
  return {
    position: "absolute",
    left: layout.left - Math.floor(((relativeTo?.x ?? 0) * viewport.width) / viewport.sceneWidth),
    top: layout.top - Math.floor(((relativeTo?.y ?? 0) * viewport.height) / viewport.sceneHeight),
    width: layout.width,
    height: layout.height,
    outline: "none",
    touchAction: "none",
    userSelect: "none",
  };
}

export function TimelineRangeSlider({
  bounds,
  relativeTo,
  viewport = DEFAULT_SURFACE_VIEWPORT,
  range,
  itemWidth,
  scrollOffset,
  values,
  labels,
  disabled = false,
  onAdjust,
}: TimelineRangeSliderProps) {
  const host = React.useRef<HTMLDivElement>(null);
  const { translateSource } = useUi();
  const drag = React.useRef<{
    pointer: number;
    side: TimelineRangeHandle;
    startIndex: number;
    startValues: readonly [number, number];
  } | null>(null);
  const handles = [TimelineRangeHandle.Start, TimelineRangeHandle.End] as const;
  const layout = surfaceLayout(bounds, viewport);

  if (!range) return null;

  const artwork = surfaceLayout(
    {
      x: bounds.x + range.x,
      y: bounds.y,
      width: range.width,
      height: bounds.height,
    },
    viewport,
  );

  const hitIndex = (clientX: number) => {
    const point = clientToSurface(host.current!, { x: clientX, y: 0 }, bounds);
    return Math.floor((point.x - bounds.x + scrollOffset) / itemWidth);
  };
  const begin = (side: TimelineRangeHandle, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    const startIndex = hitIndex(clientPoint(event).x);
    drag.current = {
      pointer: event.pointerId,
      side,
      startIndex,
      startValues: [values[0], values[1]],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    onAdjust(active.side, active.startIndex, hitIndex(clientPoint(event).x), active.startValues);
  };
  const end = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={host}
      role="group"
      className={styles.timelineRangeSlider}
      style={position(bounds, relativeTo, viewport)}
    >
      <div
        aria-hidden="true"
        className={styles.timelineRangeArtwork}
        style={{
          left: artwork.left - layout.left,
          top: artwork.top - layout.top,
          width: artwork.width,
          height: artwork.height,
        }}
      >
        <UiPart
          part="timeline_onionskin_range"
          scale={(TIMELINE_RANGE_THEME_SCALE * viewport.width) / viewport.sceneWidth}
          scaleTop={(TIMELINE_RANGE_THEME_SCALE * viewport.height) / viewport.sceneHeight}
          scaleBottom={(TIMELINE_RANGE_THEME_SCALE * viewport.height) / viewport.sceneHeight}
          drawCenter
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      {handles.map((side, index) => {
        const left =
          range.x + (side === TimelineRangeHandle.End ? range.width - range.handleWidth : 0);
        const handle = surfaceLayout(
          {
            x: bounds.x + left,
            y: bounds.y,
            width: range.handleWidth,
            height: bounds.height,
          },
          viewport,
        );
        return (
          <button
            key={side}
            {...stylusPointerInputProps(!disabled)}
            type="button"
            role="slider"
            aria-label={translateSource(labels[index])}
            data-label-source={labels[index]}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuenow={values[index]}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            className={styles.timelineRangeHandle}
            style={{
              left: handle.left - layout.left,
              width: handle.width,
              height: layout.height,
            }}
            onPointerDown={(event) => begin(side, event)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => {
              if (disabled || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
              event.preventDefault();
              event.stopPropagation();
              onAdjust(side, 0, event.key === "ArrowLeft" ? -1 : 1, values);
            }}
          />
        );
      })}
    </div>
  );
}
