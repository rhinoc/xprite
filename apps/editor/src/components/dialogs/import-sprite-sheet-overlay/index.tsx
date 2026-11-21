import { useRef, useState, type PointerEvent } from "react";

import { createEditorCanvasProjection } from "$/components/canvas/editor-canvas-projection";
import {
  useEditorCanvasGeometry,
  type EditorCanvasGeometry,
} from "$/components/canvas/use-editor-canvas-geometry";
import { tUi } from "$/i18n";
import {
  dragImportSheetOverlayRulers,
  getImportSheetOverlayGeometry,
  hitImportSheetOverlayRulers,
  useImportSheetEditor,
  type ImportSheetPoint,
  type ImportSheetRuler,
  type ImportSheetView,
  type ImportSpriteSheetFormOptions,
  type ImportSheetOverlayGeometryView,
} from "$/managers/dialogs/import-sprite-sheet";
import { CanvasSurface, Text, TextVariant, type SurfaceBounds } from "@xprite/ui";
import { centerUiPixel, useUiAssets } from "@xprite/ui/assets";
import { RASTER_SCALE, surfaceLayout } from "@xprite/ui/canvas";
import {
  clientPoint,
  clientToSurface,
  clientDeltaToSurface,
  PointerDragActivation,
  PointerDragAxis,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

interface ImportSpriteSheetOverlayProps {
  viewport: EditorCanvasGeometry;
  documentWidth: number;
  documentHeight: number;
  view: ImportSheetView;
  options: ImportSpriteSheetFormOptions;
  onChange: (options: ImportSpriteSheetFormOptions) => void;
  /** Aseprite contextbar area; its appearance/help text belongs to this primitive. */
  contextBounds?: SurfaceBounds;
  onViewChange?: (patch: Partial<ImportSheetView>) => void;
}

function visibleDocumentBounds(
  viewport: SurfaceBounds,
  unproject: (point: ImportSheetPoint) => ImportSheetPoint,
  zoom: number,
) {
  const first = unproject(viewport);
  // Cover the last scaled source pixel that can touch the canvas surface,
  // then round outward so partially visible edge pixels receive the overlay.
  const edge = Math.trunc(zoom) * RASTER_SCALE;
  const last = unproject({
    x: viewport.x + viewport.width + edge,
    y: viewport.y + viewport.height + edge,
  });
  const x = Math.floor(first.x);
  const y = Math.floor(first.y);
  return { x, y, width: Math.ceil(last.x) - x, height: Math.ceil(last.y) - y };
}

function rulerCursor(
  moving: readonly ImportSheetRuler[],
  guides: ImportSheetOverlayGeometryView["rulerGuides"],
) {
  const movesX = moving.some((index) => guides[index]?.axis === "vertical");
  const movesY = moving.some((index) => guides[index]?.axis === "horizontal");
  if (moving.length === guides.length) return "move";
  if (movesX && movesY)
    return (moving.includes(0) && moving.includes(2)) || (moving.includes(1) && moving.includes(3))
      ? "nwse-resize"
      : "nesw-resize";
  return movesX ? "ew-resize" : movesY ? "ns-resize" : "default";
}

function ImportSpriteSheetOverlay({
  viewport: { surface: viewport, scene },
  documentWidth,
  documentHeight,
  view,
  options,
  onChange,
  contextBounds,
  onViewChange,
}: ImportSpriteSheetOverlayProps) {
  const assets = useUiAssets();
  const [cursor, setCursor] = useState("default");
  const drag = useRef<{
    id: number;
    activation: PointerDragActivation;
    start: ImportSheetPoint;
    options: ImportSpriteSheetFormOptions;
    moving: ImportSheetRuler[];
  } | null>(null);
  const pan = useRef<{ id: number; start: ImportSheetPoint; origin: ImportSheetPoint } | null>(
    null,
  );

  const image = { width: documentWidth, height: documentHeight };
  const {
    viewport: logicalViewport,
    project,
    unproject,
  } = createEditorCanvasProjection(viewport, image, view);
  const documentViewport = visibleDocumentBounds(viewport, unproject, view.zoom);
  const geometry = getImportSheetOverlayGeometry(image, options, documentViewport, view.zoom);

  const eventPoint = (event: PointerEvent<HTMLDivElement>) =>
    unproject(clientToSurface(event.currentTarget, clientPoint(event), viewport));

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId && pan.current?.id !== event.pointerId) return;
    drag.current = null;
    pan.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <>
      {contextBounds && assets && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            ...surfaceLayout(contextBounds),
            pointerEvents: "none",
            zIndex: 1,
            background: assets.style.colors.workspace,
          }}
        >
          <Text
            variant={TextVariant.PositionedPixel}
            text={tUi("ui.select.bounds.to.identify.sprite.frames")}
            x={6}
            y={centerUiPixel(contextBounds.y, contextBounds.height - 4, 14) - contextBounds.y}
            color={assets.style.colors.text}
          />
        </div>
      )}

      <div
        aria-label={tUi("ui.import.sprite.sheet.rulers")}
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
        {...stylusPointerInputProps()}
        onPointerDown={(event) => {
          if (event.button === 1 && onViewChange) {
            event.preventDefault();
            event.stopPropagation();
            pan.current = {
              id: event.pointerId,
              start: { x: clientPoint(event).x, y: clientPoint(event).y },
              origin: { ...view.pan },
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            setCursor("grabbing");
            return;
          }
          if (event.button !== 0 && event.button !== 2) return;

          event.preventDefault();
          event.stopPropagation();
          const point = eventPoint(event);
          const moving = hitImportSheetOverlayRulers(point, options, 2 / view.zoom);
          drag.current = {
            id: event.pointerId,
            activation: new PointerDragActivation(
              event,
              moving.every((index) => geometry.rulerGuides[index]?.axis === "vertical")
                ? PointerDragAxis.Horizontal
                : moving.every((index) => geometry.rulerGuides[index]?.axis === "horizontal")
                  ? PointerDragAxis.Vertical
                  : PointerDragAxis.Both,
            ),
            start: { x: Math.floor(point.x), y: Math.floor(point.y) },
            options: { ...options },
            moving,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setCursor(rulerCursor(moving, geometry.rulerGuides));
        }}
        onPointerMove={(event) => {
          const activePan = pan.current;
          if (activePan && activePan.id === event.pointerId) {
            event.preventDefault();
            event.stopPropagation();
            const current = clientPoint(event);
            const delta = clientDeltaToSurface(
              event.currentTarget,
              {
                x: current.x - activePan.start.x,
                y: current.y - activePan.start.y,
              },
              logicalViewport,
            );
            onViewChange?.({
              pan: {
                x: activePan.origin.x + Math.trunc(delta.x),
                y: activePan.origin.y + Math.trunc(delta.y),
              },
            });
            return;
          }

          const point = eventPoint(event);
          const activeDrag = drag.current;
          if (!activeDrag) {
            const moving = hitImportSheetOverlayRulers(point, options, 2 / view.zoom);
            setCursor(rulerCursor(moving, geometry.rulerGuides));
            return;
          }
          if (activeDrag.id !== event.pointerId || activeDrag.moving.length === 0) return;
          if (!activeDrag.activation.update(event)) return;

          event.preventDefault();
          event.stopPropagation();
          onChange(
            dragImportSheetOverlayRulers(
              image,
              activeDrag.options,
              activeDrag.moving,
              {
                x: Math.floor(point.x) - activeDrag.start.x,
                y: Math.floor(point.y) - activeDrag.start.y,
              },
              event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey,
            ),
          );
        }}
        onPointerUp={(event) => {
          finish(event);
          event.stopPropagation();
        }}
        onPointerCancel={finish}
        onLostPointerCapture={() => {
          drag.current = null;
          pan.current = null;
        }}
      >
        <CanvasSurface
          aria-hidden
          bounds={viewport}
          dependencies={[assets, geometry, view.zoom, view.pan.x, view.pan.y, viewport]}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            width: "100%",
            height: "100%",
          }}
          paint={(context) => {
            context.save();
            context.beginPath();
            context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
            context.clip();

            context.fillStyle = "rgba(0,0,0,0.5019607843137255)";
            for (const band of geometry.shade) {
              const corner = project(band);
              const end = project({ x: band.x + band.width, y: band.y + band.height });
              context.fillRect(corner.x, corner.y, end.x - corner.x, end.y - corner.y);
            }

            context.fillStyle = assets?.style.colors.select_box_grid ?? "#64c864";
            for (const line of geometry.grid) {
              const first = project(line.from);
              const last = project(line.to);
              context.fillRect(
                first.x,
                first.y,
                line.from.x === line.to.x ? 2 : Math.max(0, last.x - first.x) + 2,
                line.from.y === line.to.y ? 2 : Math.max(0, last.y - first.y) + 2,
              );
            }

            context.fillStyle = assets?.style.colors.select_box_ruler ?? "#0000ff";
            for (const guide of geometry.rulerGuides) {
              const point =
                guide.axis === "horizontal"
                  ? project({ x: 0, y: guide.position })
                  : project({ x: guide.position, y: 0 });
              if (guide.axis === "horizontal")
                context.fillRect(viewport.x, point.y, viewport.width, 2);
              else context.fillRect(point.x, viewport.y, 2, viewport.height);
            }
            context.restore();
          }}
        />
      </div>
    </>
  );
}

export function ImportSpriteSheetOverlayHost({
  options,
  onChange,
}: {
  options: ImportSpriteSheetFormOptions;
  onChange: (options: ImportSpriteSheetFormOptions) => void;
}) {
  const editor = useImportSheetEditor();
  const snapshot = editor.snapshot;
  const document = snapshot.document;
  const { marker, viewport, contextBounds } = useEditorCanvasGeometry(!!document);
  return (
    <>
      <span hidden ref={marker} />
      {document && viewport && (
        <ImportSpriteSheetOverlay
          key={`${document.id ?? document.name}`}
          viewport={viewport}
          documentWidth={document.width}
          documentHeight={document.height}
          view={snapshot.view}
          options={options}
          onChange={onChange}
          onViewChange={editor.setView}
          contextBounds={contextBounds ?? undefined}
        />
      )}
    </>
  );
}
