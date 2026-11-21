import { useRef, useState, type PointerEvent } from "react";

import { createEditorCanvasProjection } from "$/components/canvas/editor-canvas-projection";
import type { EditorCanvasGeometry } from "$/components/canvas/use-editor-canvas-geometry";
import { tUi } from "$/i18n";
import type { Point, Rect, ViewSettings } from "$/managers/canvas/canvas-presentation";
import { resolvePointerActionModifiers } from "$/managers/input/policies/action-modifiers";
import { useShortcutManager } from "$/managers/shortcuts/use-shortcut-manager";
import { CanvasSurface } from "@xprite/ui";
import { useUiAssets } from "@xprite/ui/assets";
import { RASTER_SCALE } from "@xprite/ui/canvas";
import {
  clientPoint,
  clientToSurface,
  PointerDragActivation,
  PointerDragAxis,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

export interface CanvasSizeOverlayProps {
  viewport: EditorCanvasGeometry;
  documentWidth: number;
  documentHeight: number;
  view: Pick<ViewSettings, "zoom" | "pan" | "tiledMode">;
  bounds: Rect;
  onBoundsChange: (bounds: Rect) => void;
}
/** Four-ruler canvas bounds follow LibreSprite's GPLv2 SelectBoxState flags
 * Rulers and DarkOutside. Edge hit regions extend outward; dragging inside
 * translates all four rulers. */
export function CanvasSizeOverlay({
  viewport: { surface: viewport, scene },
  documentWidth,
  documentHeight,
  view,
  bounds,
  onBoundsChange,
}: CanvasSizeOverlayProps) {
  const shortcuts = useShortcutManager();
  const assets = useUiAssets();
  const { project, unproject } = createEditorCanvasProjection(
    viewport,
    { width: documentWidth, height: documentHeight },
    view,
  );
  const first = project(bounds),
    last = project({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });
  const [cursor, setCursor] = useState("move");
  const drag = useRef<{
    pointer: number;
    activation: PointerDragActivation;
    start: Point;
    rulers: number[];
    moving: number[];
  } | null>(null);
  const eventPoint = (event: PointerEvent<HTMLDivElement>) => {
    return clientToSurface(event.currentTarget, clientPoint(event), viewport);
  };
  const toDocument = (p: Point) => {
    const point = unproject(p);
    return { x: Math.floor(point.x), y: Math.floor(point.y) };
  };
  const hits = (p: Point) => {
    const moving: number[] = [];
    if (p.y <= first.y + 4) moving.push(0);
    if (p.y >= last.y - 4) moving.push(1);
    if (p.x <= first.x + 4) moving.push(2);
    if (p.x >= last.x - 4) moving.push(3);
    return moving.length ? moving : [0, 1, 2, 3];
  };
  const cursorFor = (moving: number[]) =>
    moving.length === 4
      ? "move"
      : (moving.includes(0) && moving.includes(2)) || (moving.includes(1) && moving.includes(3))
        ? "nwse-resize"
        : (moving.includes(0) && moving.includes(3)) || (moving.includes(1) && moving.includes(2))
          ? "nesw-resize"
          : moving.includes(0) || moving.includes(1)
            ? "ns-resize"
            : "ew-resize";
  return (
    <div
      {...stylusPointerInputProps()}
      aria-label={tUi("ui.canvas.size.rulers")}
      style={{
        position: "absolute",
        left: scene.x,
        top: scene.y,
        width: scene.width,
        height: scene.height,
        zIndex: 0,
        cursor,
        touchAction: "none",
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.button !== 2) return;
        if (drag.current) return;
        event.preventDefault();
        event.stopPropagation();
        const p = eventPoint(event),
          moving = hits(p);
        drag.current = {
          pointer: event.pointerId,
          activation: new PointerDragActivation(
            event,
            moving.every((index) => index < 2)
              ? PointerDragAxis.Vertical
              : moving.every((index) => index >= 2)
                ? PointerDragAxis.Horizontal
                : PointerDragAxis.Both,
          ),
          start: toDocument(p),
          rulers: [bounds.y, bounds.y + bounds.height, bounds.x, bounds.x + bounds.width],
          moving,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setCursor(cursorFor(moving));
      }}
      onPointerMove={(event) => {
        const p = eventPoint(event),
          active = drag.current;
        if (!active) {
          setCursor(cursorFor(hits(p)));
          return;
        }
        if (active.pointer !== event.pointerId) return;
        if (!active.activation.update(event)) return;
        const current = toDocument(p),
          next = [...active.rulers],
          delta = { x: current.x - active.start.x, y: current.y - active.start.y };
        for (const index of active.moving) {
          const d = index < 2 ? delta.y : delta.x;
          next[index] = active.rulers[index] + d;
          if (resolvePointerActionModifiers(shortcuts, event).lockAxis)
            next[index ^ 1] = active.rulers[index ^ 1] - d;
        }
        onBoundsChange({
          x: Math.min(next[2], next[3]),
          y: Math.min(next[0], next[1]),
          width: Math.max(1, Math.abs(next[3] - next[2])),
          height: Math.max(1, Math.abs(next[1] - next[0])),
        });
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer === event.pointerId) {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        event.stopPropagation();
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <CanvasSurface
        aria-hidden
        bounds={viewport}
        dependencies={[assets, first.x, first.y, last.x, last.y]}
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
        paint={(ctx) => {
          ctx.fillStyle = "rgba(0,0,0,0.5019607843137255)";
          ctx.beginPath();
          ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
          ctx.rect(first.x, first.y, Math.max(0, last.x - first.x), Math.max(0, last.y - first.y));
          ctx.fill("evenodd");
          ctx.fillStyle = assets?.style.colors.select_box_ruler ?? "#0000ff";
          ctx.fillRect(first.x, viewport.y, RASTER_SCALE, viewport.height);
          ctx.fillRect(last.x, viewport.y, RASTER_SCALE, viewport.height);
          ctx.fillRect(viewport.x, first.y, viewport.width, RASTER_SCALE);
          ctx.fillRect(viewport.x, last.y, viewport.width, RASTER_SCALE);
        }}
      />
    </div>
  );
}
