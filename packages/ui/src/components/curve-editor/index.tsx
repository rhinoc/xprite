import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import { ThemePart } from "$/base/theme/theme-part";
import { cn } from "$/base/utils/cn";
import { clientPoint, clientToLocal } from "$/base/utils/dom-geometry";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "$/components/canvas-surface";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import { sizedControlBounds } from "$/components/control-flow/placement";
import type { SizedControlPlacement } from "$/components/control-flow/placement";

import styles from "$/components/curve-editor/curve-editor.module.css";

export interface CurveEditorPoint {
  readonly x: number;
  readonly y: number;
}

interface CurveEditorContentProps {
  points: readonly CurveEditorPoint[];
  selectedIndex: number;
  onSelectionChange(index: number): void;
  onPointsChange(points: readonly CurveEditorPoint[]): void;
  onPointEdit?(index: number): void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  "aria-label": string;
  className?: string;
}

export type CurveEditorProps = CurveEditorContentProps & SizedControlPlacement;

const FRAME_INSET_X = 3 * RASTER_SCALE;
const FRAME_INSET_TOP = 4 * RASTER_SCALE;
const FRAME_INSET_BOTTOM = 3 * RASTER_SCALE;
const GRAPH_INSET = 1;
const POINT_SIZE = 5;
const HOT_POINT_MARGIN = 2;
const EDIT_POINT_MARGIN = 4;
const STROKE_INSET = 0.5;
const HIT_RADIUS_PIXELS = 10;
const SHIFT_MULTIPLIER = 10;
const GRID_LINES = [0.25, 0.5, 0.75] as const;

/** Controlled, piecewise-linear point editor. Click to add; drag or use arrow keys to move. */
export function CurveEditor(props: CurveEditorProps) {
  const {
    bounds: suppliedBounds,
    relativeTo = { x: 0, y: 0 },
    points,
    selectedIndex,
    onSelectionChange,
    onPointsChange,
    onPointEdit,
    min = 0,
    max = 1,
    step = 0.01,
    disabled = false,
    "aria-label": label,
    className,
  } = props;
  const bounds = sizedControlBounds(props);
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; index: number } | null>(null);
  const current = useRef({ points, selectedIndex, onPointsChange, onSelectionChange });
  current.current = { points, selectedIndex, onPointsChange, onSelectionChange };
  const select = (index: number) => {
    current.current.selectedIndex = index;
    current.current.onSelectionChange(index);
  };
  const layout = surfaceLayout(bounds, DEFAULT_SURFACE_VIEWPORT);
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min >= max ||
    !Number.isFinite(step) ||
    step <= 0
  )
    throw new RangeError("Curve editor requires a finite range and positive step");
  const range = max - min;
  const graphWidth = Math.max(
    GRAPH_INSET * 2 + 2,
    Math.floor((bounds.width - FRAME_INSET_X * 2) / RASTER_SCALE),
  );
  const graphHeight = Math.max(
    GRAPH_INSET * 2 + 2,
    Math.floor((bounds.height - FRAME_INSET_TOP - FRAME_INSET_BOTTOM) / RASTER_SCALE),
  );
  const extentX = graphWidth - GRAPH_INSET * 2 - 1;
  const extentY = graphHeight - GRAPH_INSET * 2 - 1;
  const clamp = (value: number) =>
    Math.max(min, Math.min(max, min + Math.round((value - min) / step) * step));
  const screenX = (value: number) => GRAPH_INSET + Math.floor(((value - min) / range) * extentX);
  const screenY = (value: number) =>
    GRAPH_INSET + extentY - Math.floor(((value - min) / range) * extentY);
  const graphPoint = (event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
    const local = clientToLocal(event.currentTarget, clientPoint(event));
    return {
      x: (local.x - FRAME_INSET_X) / RASTER_SCALE,
      y: (local.y - FRAME_INSET_TOP) / RASTER_SCALE,
    };
  };
  const closestPoint = (event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
    const position = graphPoint(event);
    let closest = -1;
    let distance = HIT_RADIUS_PIXELS / RASTER_SCALE;
    for (const [index, point] of current.current.points.entries()) {
      const next = Math.hypot(screenX(point.x) - position.x, screenY(point.y) - position.y);
      if (next < distance) {
        closest = index;
        distance = next;
      }
    }
    return closest;
  };
  const pointAt = (event: PointerEvent<HTMLDivElement>): CurveEditorPoint => {
    const point = graphPoint(event);
    return {
      x: clamp(min + ((point.x - GRAPH_INSET) / extentX) * range),
      y: clamp(min + ((GRAPH_INSET + extentY - point.y) / extentY) * range),
    };
  };
  const move = (index: number, point: CurveEditorPoint) => {
    const values = current.current.points;
    if (!values[index]) return;
    const lo = index ? values[index - 1].x + step : min;
    const hi = index + 1 < values.length ? values[index + 1].x - step : max;
    const next = { x: Math.max(lo, Math.min(hi, clamp(point.x))), y: clamp(point.y) };
    const updated = values.map((value, at) => (at === index ? next : value));
    current.current.points = updated;
    current.current.onPointsChange(updated);
  };
  const add = (point: CurveEditorPoint): number => {
    const values = current.current.points;
    const existing = values.findIndex((value) => value.x === point.x);
    if (existing >= 0) {
      move(existing, point);
      select(existing);
      return existing;
    }
    const index = values.findIndex((value) => value.x > point.x);
    const inserted = index < 0 ? values.length : index;
    const next = [...values.slice(0, inserted), point, ...values.slice(inserted)];
    current.current.points = next;
    current.current.onPointsChange(next);
    select(inserted);
    return inserted;
  };
  const remove = () => {
    const values = current.current.points;
    const selected = current.current.selectedIndex;
    if (values.length <= 1 || !values[selected]) return;
    const next = values.filter((_, index) => index !== selected);
    current.current.points = next;
    current.current.onPointsChange(next);
    select(Math.min(selected, next.length - 1));
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const index = current.current.selectedIndex;
    const selected = current.current.points[index] ?? current.current.points[0];
    if (!selected) return;
    const distance = step * (event.shiftKey ? SHIFT_MULTIPLIER : 1);
    switch (event.key) {
      case "ArrowLeft":
        move(index, { ...selected, x: selected.x - distance });
        break;
      case "ArrowRight":
        move(index, { ...selected, x: selected.x + distance });
        break;
      case "ArrowUp":
        move(index, { ...selected, y: selected.y + distance });
        break;
      case "ArrowDown":
        move(index, { ...selected, y: selected.y - distance });
        break;
      case "PageUp":
        select(Math.max(0, index - 1));
        break;
      case "PageDown":
        select(Math.min(current.current.points.length - 1, index + 1));
        break;
      case "Home":
        select(0);
        break;
      case "End":
        select(current.current.points.length - 1);
        break;
      case "Delete":
      case "Backspace":
        remove();
        break;
      case "Enter":
        if (!onPointEdit) return;
        onPointEdit(index);
        break;
      case "Insert": {
        const candidates = [min, ...current.current.points.map((point) => point.x), max];
        let left = min;
        let right = min;
        for (let index = 1; index < candidates.length; index++)
          if (candidates[index] - candidates[index - 1] > right - left) {
            left = candidates[index - 1];
            right = candidates[index];
          }
        if (right - left > step) add({ x: clamp((left + right) / 2), y: clamp(selected.y) });
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };
  const selected = points[selectedIndex] ?? points[0];
  // The reference paints one pixel per input column, rather than an antialiased line.
  let segment = 0;
  const curve = points.length
    ? Array.from({ length: extentX + 1 }, (_, column) => {
        const input = min + Math.floor(((column / extentX) * range) / step) * step;
        while (segment + 1 < points.length && input > points[segment + 1].x) segment++;
        const left = points[segment];
        const right = points[segment + 1];
        const output =
          input <= left.x || !right
            ? left.y
            : left.y + ((right.y - left.y) * (input - left.x)) / (right.x - left.x);
        const sampled = Math.max(
          min,
          Math.min(max, min + Math.trunc((output - min) / step) * step),
        );
        return `M${GRAPH_INSET + column},${screenY(sampled)}h1v1h-1z`;
      }).join(" ")
    : "";
  return (
    <div
      ref={host}
      {...stylusPointerInputProps(!disabled)}
      className={cn(styles.root, className)}
      style={{
        position: suppliedBounds ? "absolute" : "relative",
        ...(suppliedBounds
          ? {
              left:
                layout.left -
                Math.floor(
                  (relativeTo.x * DEFAULT_SURFACE_VIEWPORT.width) /
                    DEFAULT_SURFACE_VIEWPORT.sceneWidth,
                ),
              top:
                layout.top -
                Math.floor(
                  (relativeTo.y * DEFAULT_SURFACE_VIEWPORT.height) /
                    DEFAULT_SURFACE_VIEWPORT.sceneHeight,
                ),
            }
          : {}),
        width: layout.width,
        height: layout.height,
      }}
      tabIndex={disabled ? -1 : 0}
      role="group"
      aria-label={label}
      aria-disabled={disabled}
      onKeyDown={keyDown}
      onContextMenu={(event) => {
        if (!disabled && onPointEdit) event.preventDefault();
      }}
      onDoubleClick={(event) => {
        if (disabled || !onPointEdit || event.button !== 0) return;
        const index = closestPoint(event);
        if (index < 0) return;
        event.preventDefault();
        select(index);
        onPointEdit(index);
      }}
      onPointerDown={(event) => {
        if (disabled || (event.button !== 0 && event.button !== 2)) return;
        const closest = closestPoint(event);
        if (event.button === 2) {
          if (!onPointEdit || closest < 0) return;
          event.preventDefault();
          select(closest);
          onPointEdit(closest);
          return;
        }
        event.preventDefault();
        event.currentTarget.focus();
        const index = closest < 0 ? add(pointAt(event)) : closest;
        select(index);
        drag.current = { pointer: event.pointerId, index };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointer === event.pointerId && !disabled)
          move(drag.current.index, pointAt(event));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <ThemePart part="sunken_normal" scale={RASTER_SCALE} className={styles.frame} />
      <svg
        className={styles.graph}
        style={{
          left: FRAME_INSET_X,
          top: FRAME_INSET_TOP,
          width: graphWidth * RASTER_SCALE,
          height: graphHeight * RASTER_SCALE,
        }}
        viewBox={`0 0 ${graphWidth} ${graphHeight}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <rect className={styles.background} width={graphWidth} height={graphHeight} />
        <rect
          className={styles.border}
          x={STROKE_INSET}
          y={STROKE_INSET}
          width={graphWidth - 1}
          height={graphHeight - 1}
        />
        {GRID_LINES.map((value) => (
          <g key={value} className={styles.grid}>
            <rect
              x={Math.floor(value * (graphWidth - GRAPH_INSET * 2))}
              y={GRAPH_INSET}
              width={1}
              height={graphHeight - GRAPH_INSET * 2}
            />
            <rect
              x={GRAPH_INSET}
              y={Math.floor(value * (graphHeight - GRAPH_INSET * 2))}
              width={graphWidth - GRAPH_INSET * 2}
              height={1}
            />
          </g>
        ))}
        <path className={styles.curve} d={curve} />
        {points.map((point, index) => (
          <g
            key={index}
            className={cn(styles.node, index === selectedIndex && styles.selected)}
            transform={`translate(${screenX(point.x)}, ${screenY(point.y)})`}
          >
            <rect
              className={styles.hitTarget}
              x={-HIT_RADIUS_PIXELS / RASTER_SCALE}
              y={-HIT_RADIUS_PIXELS / RASTER_SCALE}
              width={(HIT_RADIUS_PIXELS * 2) / RASTER_SCALE}
              height={(HIT_RADIUS_PIXELS * 2) / RASTER_SCALE}
            />
            <rect
              className={styles.point}
              x={-Math.floor(POINT_SIZE / 2) + STROKE_INSET}
              y={-Math.floor(POINT_SIZE / 2) + STROKE_INSET}
              width={POINT_SIZE - 1}
              height={POINT_SIZE - 1}
            />
            {([HOT_POINT_MARGIN, EDIT_POINT_MARGIN] as const).map((margin) => (
              <rect
                key={margin}
                className={margin === HOT_POINT_MARGIN ? styles.hotGuide : styles.editGuide}
                x={-Math.floor(POINT_SIZE / 2) - margin + STROKE_INSET}
                y={-Math.floor(POINT_SIZE / 2) - margin + STROKE_INSET}
                width={POINT_SIZE - 1 + margin * 2}
                height={POINT_SIZE - 1 + margin * 2}
              />
            ))}
          </g>
        ))}
      </svg>
      <span className={styles.status} aria-live="polite">
        {selected ? `${selected.x}, ${selected.y}` : ""}
      </span>
    </div>
  );
}
