import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent,
} from "react";

import { tUi, tUiSource } from "$/i18n";
import {
  editorFrameGeometry,
  editorScrollDragPan,
  type EditorScrollAxis,
} from "$/managers/canvas/canvas-presentation";
import { useWorkspaceResizeScheduler } from "$/managers/workspace/workspace-resize-scheduler";
import { type SurfaceBounds, type SurfaceViewport } from "@xprite/ui";
import { useUi } from "@xprite/ui";
import { UiPart } from "@xprite/ui/assets";
import { surfaceLayout, DEFAULT_SURFACE_VIEWPORT } from "@xprite/ui/canvas";
import {
  clientPoint,
  clientRect,
  clientToSurface,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

export const asepriteEditorFrameBounds: SurfaceBounds = {
  x: 160,
  y: 102,
  width: 1724,
  height: 686,
};
export interface EditorPan {
  x: number;
  y: number;
}
export interface EditorFrameProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  viewport?: SurfaceViewport;
  /** Visible scene frame bounds. extraHeight is added to this base. */
  frameBounds?: SurfaceBounds;
  /** Additional scene vertical space; responsive layouts may use a negative value. */
  extraHeight?: number;
  relativeTo?: { x: number; y: number };
  /** Zoom factor (1 = initial source document size). */
  zoom?: number;
  /** Document rectangle before zoom and pan. */
  documentBounds?: SurfaceBounds;
  pan?: EditorPan;
  defaultPan?: EditorPan;
  onPan?: (value: EditorPan) => void;
  selected?: boolean;
  showDocumentOutline?: boolean;
  showScrollbars?: boolean;
  /** Controlled thumb geometry in global scene coordinates. */
  horizontalThumb?: SurfaceBounds;
  verticalThumb?: SurfaceBounds;
}
const initialDocument: SurfaceBounds = {
  x: 404,
  y: 84,
  width: 1224,
  height: 708,
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Reusable Aseprite editor border, document outline, and interactive mini scrollbars. */
export function EditorFrame({
  viewport = DEFAULT_SURFACE_VIEWPORT,
  frameBounds: baseFrameBounds = asepriteEditorFrameBounds,
  extraHeight = 0,
  relativeTo = { x: 0, y: 0 },
  zoom = 1,
  documentBounds = initialDocument,
  pan,
  defaultPan = { x: 0, y: 0 },
  onPan,
  selected = true,
  showDocumentOutline = true,
  showScrollbars = true,
  horizontalThumb,
  verticalThumb,
  style,
  children,
  ...props
}: EditorFrameProps) {
  const { style: uiStyle } = useUi();
  const extension = Math.round(extraHeight);
  const frameBounds = {
    ...baseFrameBounds,
    height: Math.max(30, baseFrameBounds.height + extension),
  };
  const [internalPan, setInternalPan] = useState(defaultPan);
  const [hover, setHover] = useState<"horizontal" | "vertical" | null>(null);
  const panScheduler = useWorkspaceResizeScheduler();
  const drag = useRef<{
    axis: "horizontal" | "vertical";
    pointer: number;
    start: number;
    geometry: EditorScrollAxis;
    moved: boolean;
    pan: EditorPan;
  } | null>(null);
  const offset = pan ?? internalPan;
  const updatePan = (value: EditorPan) => {
    if (!pan) setInternalPan(value);
    onPan?.(value);
  };
  const geometry = editorFrameGeometry(
    frameBounds,
    documentBounds,
    zoom,
    offset,
    (uiStyle.dimensions.scrollbar_size ?? 12) * 2,
    showScrollbars,
  );
  const horizontal = horizontalThumb ?? geometry.horizontalThumb,
    vertical = verticalThumb ?? geometry.verticalThumb;
  const horizontalAxis = {
    ...geometry.horizontal,
    length: horizontal.width / 2,
    travel: geometry.viewport.width / 2 - horizontal.width / 2,
    position: (horizontal.x - geometry.viewport.x) / 2,
  };
  const verticalAxis = {
    ...geometry.vertical,
    length: vertical.height / 2,
    travel: geometry.viewport.height / 2 - vertical.height / 2,
    position: (vertical.y - geometry.viewport.y) / 2,
  };
  const positionRect = (rect: SurfaceBounds): CSSProperties => ({
    position: "absolute",
    left: rect.x - frameBounds.x,
    top: rect.y - frameBounds.y,
    width: rect.width,
    height: rect.height,
    pointerEvents: "none",
  });
  const layout = surfaceLayout(frameBounds, viewport);
  const guiCoordinate = (event: PointerEvent<HTMLDivElement>, axis: "horizontal" | "vertical") => {
    const bounds = axis === "horizontal" ? geometry.horizontalTrack : geometry.verticalTrack,
      hit = surfaceLayout(bounds, viewport),
      point = clientToSurface(event.currentTarget, clientPoint(event), {
        x: hit.left,
        y: hit.top,
        width: hit.width,
        height: hit.height,
      });
    return axis === "horizontal"
      ? Math.floor((point.x * viewport.sceneWidth) / viewport.width / 2)
      : Math.floor((point.y * viewport.sceneHeight) / viewport.height / 2);
  };
  const startDrag = (axis: "horizontal" | "vertical", event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const range = axis === "horizontal" ? horizontalAxis : verticalAxis;
    const point =
      guiCoordinate(event, axis) -
      (axis === "horizontal" ? geometry.horizontalTrack.x : geometry.verticalTrack.y) / 2;
    if (point < range.position || point >= range.position + range.length) {
      const key = axis === "horizontal" ? "x" : "y";
      const next = clamp(
        range.scroll + (point < range.position ? -1 : 1) * Math.trunc(range.visible / 2),
        0,
        range.maximum,
      );
      updatePan({ ...offset, [key]: offset[key] - (next - range.scroll) * 2 });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      axis,
      pointer: event.pointerId,
      start: guiCoordinate(event, axis),
      geometry: axis === "horizontal" ? horizontalAxis : verticalAxis,
      moved: false,
      pan: { ...offset },
    };
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const delta = guiCoordinate(event, current.axis) - current.start;
    if (!current.moved && !delta) return;
    current.moved = true;
    const key = current.axis === "horizontal" ? "x" : "y";
    const pan = {
      ...current.pan,
      [key]: editorScrollDragPan(current.geometry, current.pan[key], delta * 2),
    };
    panScheduler.schedule(() => updatePan(pan));
  };
  useEffect(() => {
    const end = () => {
      panScheduler.flush();
      drag.current = null;
      setHover(null);
    };
    window.addEventListener("blur", end);
    return () => window.removeEventListener("blur", end);
  }, [panScheduler]);
  const hitStyle = (bounds: SurfaceBounds): CSSProperties => {
    const hit = surfaceLayout(bounds, viewport);
    return {
      position: "absolute",
      left: hit.left - layout.left,
      top: hit.top - layout.top,
      width: hit.width,
      height: hit.height,
      pointerEvents: "auto",
      cursor: "var(--ui-cursor-default, default)",
      touchAction: "none",
      outlineOffset: -1,
    };
  };
  return (
    <div
      {...props}
      data-slot="editor-frame"
      style={{
        position: "absolute",
        left: layout.left - Math.floor((relativeTo.x * viewport.width) / viewport.sceneWidth),
        top: layout.top - Math.floor((relativeTo.y * viewport.height) / viewport.sceneHeight),
        width: layout.width,
        height: layout.height,
        pointerEvents: "none",
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        data-slot="frame-artwork-clip"
        style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
      >
        <div
          data-slot="frame-artwork-plane"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: frameBounds.width,
            height: frameBounds.height,
            transform: `scale(${layout.width / frameBounds.width}, ${layout.height / frameBounds.height})`,
            transformOrigin: "top left",
          }}
        >
          {showScrollbars && (
            <>
              <span
                style={{
                  ...positionRect({
                    x: geometry.verticalTrack.x,
                    y: geometry.verticalTrack.y,
                    width: 12,
                    height: geometry.verticalTrack.height + 12,
                  }),
                  background: uiStyle.colors.editor_sprite_border,
                }}
              />
              <span
                style={{
                  ...positionRect({
                    x: geometry.horizontalTrack.x,
                    y: geometry.horizontalTrack.y,
                    width: geometry.horizontalTrack.width + 12,
                    height: 12,
                  }),
                  background: uiStyle.colors.editor_sprite_border,
                }}
              />
            </>
          )}
          {showDocumentOutline && (
            <span style={{ ...positionRect(geometry.viewport), overflow: "hidden" }}>
              {(() => {
                const { x, y, width, height } = geometry.document;
                const rx = x - geometry.viewport.x,
                  ry = y - geometry.viewport.y;
                return (
                  <>
                    <span
                      data-slot="document-outline"
                      style={{
                        position: "absolute",
                        left: rx - 2,
                        top: ry - 2,
                        width: width + 4,
                        height: height + 4,
                        boxSizing: "border-box",
                        border: `2px solid ${uiStyle.colors.editor_sprite_border}`,
                      }}
                    />
                  </>
                );
              })()}
            </span>
          )}
          <UiPart
            part={selected ? "editor_selected" : "editor_normal"}
            scale={2}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: frameBounds.width,
              height: frameBounds.height,
            }}
          />
          {showScrollbars && (
            <>
              {(["horizontal", "vertical"] as const).map((axis) => {
                const track =
                  axis === "horizontal" ? geometry.horizontalTrack : geometry.verticalTrack;
                return (
                  <UiPart
                    key={axis}
                    part={hover === axis ? "mini_scrollbar_bg_hot" : "mini_scrollbar_bg"}
                    scale={2}
                    drawCenter
                    style={positionRect(track)}
                  />
                );
              })}
              <UiPart
                part={hover === "horizontal" ? "mini_scrollbar_thumb_hot" : "mini_scrollbar_thumb"}
                scale={2}
                drawCenter
                style={positionRect(horizontal)}
              />
              <UiPart
                part={hover === "vertical" ? "mini_scrollbar_thumb_hot" : "mini_scrollbar_thumb"}
                scale={2}
                drawCenter
                style={positionRect(vertical)}
              />
            </>
          )}
        </div>
      </div>
      {showScrollbars &&
        (["horizontal", "vertical"] as const).map((axis) => (
          <div
            key={axis}
            role="scrollbar"
            aria-label={tUi("ui.editor.scroll", {
              value1: tUiSource(axis === "horizontal" ? "Horizontal" : "Vertical"),
            })}
            aria-orientation={axis}
            aria-valuemin={0}
            aria-valuemax={
              (axis === "horizontal" ? geometry.horizontal : geometry.vertical).maximum
            }
            aria-valuenow={(axis === "horizontal" ? geometry.horizontal : geometry.vertical).scroll}
            tabIndex={0}
            style={hitStyle(
              axis === "horizontal" ? geometry.horizontalTrack : geometry.verticalTrack,
            )}
            onPointerEnter={() => setHover(axis)}
            onPointerLeave={() => {
              if (!drag.current) setHover(null);
            }}
            {...stylusPointerInputProps()}
            onPointerDown={(event) => startDrag(axis, event)}
            onPointerMove={moveDrag}
            onPointerUp={(event) => {
              moveDrag(event);
              panScheduler.flush();
              drag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
              const rect = clientRect(event.currentTarget);
              setHover(
                clientPoint(event).x >= rect.left &&
                  clientPoint(event).x < rect.right &&
                  clientPoint(event).y >= rect.top &&
                  clientPoint(event).y < rect.bottom
                  ? axis
                  : null,
              );
            }}
            onPointerCancel={() => {
              panScheduler.flush();
              drag.current = null;
              setHover(null);
            }}
            onLostPointerCapture={() => {
              panScheduler.flush();
              drag.current = null;
            }}
            onKeyDown={(event) => {
              const key = axis === "horizontal" ? "x" : "y";
              const range = axis === "horizontal" ? geometry.horizontal : geometry.vertical;
              let next = range.scroll;
              if (event.key === "Home") next = 0;
              else if (event.key === "End") next = range.maximum;
              else if (event.key === "PageUp") next -= Math.trunc(range.visible / 2);
              else if (event.key === "PageDown") next += Math.trunc(range.visible / 2);
              else if (event.key === (axis === "horizontal" ? "ArrowLeft" : "ArrowUp"))
                next -= event.shiftKey ? 50 : 10;
              else if (event.key === (axis === "horizontal" ? "ArrowRight" : "ArrowDown"))
                next += event.shiftKey ? 50 : 10;
              else return;
              event.preventDefault();
              event.stopPropagation();
              updatePan({
                ...offset,
                [key]: offset[key] - (clamp(next, 0, range.maximum) - range.scroll) * 2,
              });
            }}
          />
        ))}
      {children}
    </div>
  );
}
