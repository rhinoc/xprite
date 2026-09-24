import * as React from "react";

import { scrollbarGeometry, type ScrollbarGeometry } from "$/base/components/scrollbar/geometry";
import { clientPoint, clientRect } from "$/base/utils/dom-geometry";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import {
  surfaceLayout,
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";

type ScrollbarOrientation = "vertical" | "horizontal";

interface ScrollbarArtworkState {
  bounds: SurfaceBounds;
  layout: ReturnType<typeof surfaceLayout>;
  geometry: ScrollbarGeometry;
  orientation: ScrollbarOrientation;
  horizontal: boolean;
  hover: boolean;
  variant: string;
}

export interface ScrollbarPrimitiveProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange" | "children"
> {
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
  orientation?: ScrollbarOrientation;
  contentSize: number;
  visibleSize: number;
  value: number;
  onValueChange: (value: number) => void;
  minimumThumbSize?: number;
  variant?: string;
  renderArtwork: (state: ScrollbarArtworkState) => React.ReactNode;
}

/** Accessible scrollbar behavior with host-rendered artwork. */
export function ScrollbarPrimitive({
  bounds,
  relativeTo = { x: 0, y: 0 },
  viewport = DEFAULT_SURFACE_VIEWPORT,
  orientation = "vertical",
  contentSize,
  visibleSize,
  value,
  onValueChange,
  minimumThumbSize = 0,
  variant = "default",
  renderArtwork,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onPointerEnter,
  onPointerLeave,
  onKeyDown,
  tabIndex = 0,
  ...props
}: ScrollbarPrimitiveProps) {
  const [hover, setHover] = React.useState(false);
  const drag = React.useRef<{
    id: number;
    coordinate: number;
    position: number;
    moved: boolean;
  } | null>(null);
  const horizontal = orientation === "horizontal";
  const axisSize = horizontal ? bounds.width : bounds.height;
  const geometry = scrollbarGeometry(axisSize, contentSize, visibleSize, value, minimumThumbSize);
  const layout = surfaceLayout(bounds, viewport);
  const commit = (next: number) =>
    onValueChange(Math.max(0, Math.min(geometry.maximum, Math.trunc(next))));
  const coordinate = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = clientRect(event.currentTarget);
    const extent = horizontal ? rect.width : rect.height;
    return Math.floor(
      ((horizontal ? clientPoint(event).x - rect.left : clientPoint(event).y - rect.top) *
        axisSize) /
        (extent || 1),
    );
  };
  const release = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const rect = clientRect(event.currentTarget);
    setHover(
      clientPoint(event).x >= rect.left &&
        clientPoint(event).x < rect.right &&
        clientPoint(event).y >= rect.top &&
        clientPoint(event).y < rect.bottom,
    );
  };
  const artworkState = { bounds, layout, geometry, orientation, horizontal, hover, variant };

  return (
    <div
      {...props}
      {...stylusPointerInputProps()}
      role="scrollbar"
      tabIndex={tabIndex}
      aria-orientation={orientation}
      aria-valuemin={0}
      aria-valuemax={geometry.maximum}
      aria-valuenow={Math.max(0, Math.min(geometry.maximum, value))}
      onPointerEnter={(event) => {
        setHover(true);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setHover(false);
        onPointerLeave?.(event);
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (event.defaultPrevented || event.button !== 0) return;
        event.preventDefault();
        const point = coordinate(event);
        if (point < geometry.position) commit(value - Math.trunc(visibleSize / 2));
        else if (point >= geometry.position + geometry.length)
          commit(value + Math.trunc(visibleSize / 2));
        else {
          drag.current = {
            id: event.pointerId,
            coordinate: point,
            position: geometry.position,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        const current = drag.current;
        if (event.defaultPrevented || !current || current.id !== event.pointerId) return;
        const point = coordinate(event);
        if (!current.moved && point === current.coordinate) return;
        current.moved = true;
        if (geometry.travel > 0)
          commit(
            (geometry.maximum *
              Math.max(
                0,
                Math.min(geometry.travel, current.position + point - current.coordinate),
              )) /
              geometry.travel,
          );
      }}
      onPointerUp={(event) => {
        release(event);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        release(event);
        onPointerCancel?.(event);
      }}
      onLostPointerCapture={(event) => {
        if (drag.current?.id === event.pointerId) drag.current = null;
        onLostPointerCapture?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        let next: number;
        if (event.key === "Home") next = 0;
        else if (event.key === "End") next = geometry.maximum;
        else if (event.key === "PageUp") next = value - Math.trunc(visibleSize / 2);
        else if (event.key === "PageDown") next = value + Math.trunc(visibleSize / 2);
        else if (event.key === (horizontal ? "ArrowLeft" : "ArrowUp")) next = value - 1;
        else if (event.key === (horizontal ? "ArrowRight" : "ArrowDown")) next = value + 1;
        else return;
        event.preventDefault();
        event.stopPropagation();
        commit(next);
      }}
      style={{
        position: "absolute",
        left: layout.left - Math.floor((relativeTo.x * viewport.width) / viewport.sceneWidth),
        top: layout.top - Math.floor((relativeTo.y * viewport.height) / viewport.sceneHeight),
        width: layout.width,
        height: layout.height,
        touchAction: "none",
        userSelect: "none",
        padding: 0,
        border: 0,
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: layout.width,
          height: layout.height,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {renderArtwork(artworkState)}
      </span>
    </div>
  );
}
