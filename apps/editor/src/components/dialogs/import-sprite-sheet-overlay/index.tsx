import { useEffect, useRef, useState, type PointerEvent } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { tUi } from "$/i18n";
import {
  dragImportSheetOverlayRulers,
  getImportSheetOverlayGeometry,
  hitImportSheetOverlayRulers,
  projectImportSheetDocumentPoint,
  unprojectImportSheetDocumentPoint,
  useImportSheetEditor,
  type ImportSheetPoint,
  type ImportSheetRuler,
  type ImportSheetView,
  type ImportSpriteSheetFormOptions,
  type ImportSheetOverlayGeometryView,
} from "$/managers/dialogs/import-sprite-sheet";
import { CanvasSurface, Text, TextVariant, type SurfaceBounds } from "@xprite/ui";
import { centerUiPixel, useUiAssets } from "@xprite/ui/assets";
import { surfaceLayout } from "@xprite/ui/canvas";
import {
  clientPoint,
  clientToSurface,
  clientDeltaToSurface,
  PointerDragActivation,
  PointerDragAxis,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

interface ImportSpriteSheetOverlayProps {
  viewportBounds: SurfaceBounds;
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
  logicalViewport: { width: number; height: number },
  image: { width: number; height: number },
  view: ImportSheetView,
) {
  const first = unprojectImportSheetDocumentPoint({ x: 0, y: 0 }, logicalViewport, image, view);
  // Cover the last scaled source pixel that can touch the canvas surface,
  // then round outward so partially visible edge pixels receive the overlay.
  const edge = Math.trunc(view.zoom);
  const last = unprojectImportSheetDocumentPoint(
    {
      x: logicalViewport.width + edge,
      y: logicalViewport.height + edge,
    },
    logicalViewport,
    image,
    view,
  );
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
  viewportBounds: viewport,
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
  const logicalViewport = { width: viewport.width / 2, height: viewport.height / 2 };
  const project = (point: ImportSheetPoint) => {
    const screen = projectImportSheetDocumentPoint(point, logicalViewport, image, view);
    return {
      x: viewport.x + Math.trunc(screen.x) * 2,
      y: viewport.y + Math.trunc(screen.y) * 2,
    };
  };
  const documentViewport = visibleDocumentBounds(logicalViewport, image, view);
  const geometry = getImportSheetOverlayGeometry(image, options, documentViewport, view.zoom);
  const layout = surfaceLayout(viewport);

  const eventPoint = (event: PointerEvent<HTMLDivElement>) => {
    const screen = clientToSurface(event.currentTarget, clientPoint(event), logicalViewport);
    return unprojectImportSheetDocumentPoint(screen, logicalViewport, image, view);
  };

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
        style={{ position: "absolute", ...layout, zIndex: 0, cursor, touchAction: "none" }}
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
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          paint={(context) => {
            context.save();
            context.beginPath();
            context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
            context.clip();

            context.fillStyle = "rgba(0,0,0,0.5019607843137255)";
            for (const band of geometry.shade) {
              const corner = project(band);
              context.fillRect(
                corner.x,
                corner.y,
                Math.trunc(band.width * view.zoom) * 2,
                Math.trunc(band.height * view.zoom) * 2,
              );
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

/** Scene-scoped measuring adapter. Canvas-authored Aseprite bounds are the source
 * of truth; draft/paint updates never modify the document or undo history. */
export function ImportSpriteSheetOverlayHost({
  options,
  onChange,
}: {
  options: ImportSpriteSheetFormOptions;
  onChange: (options: ImportSpriteSheetFormOptions) => void;
}) {
  const editor = useImportSheetEditor();
  const snapshot = editor.snapshot;
  const sceneBounds = useSceneBounds();
  const marker = useRef<HTMLSpanElement>(null);
  const [viewport, setViewport] = useState<SurfaceBounds | null>(null);

  useEffect(() => {
    const scene = marker.current?.closest("[data-ui-scene]");
    if (!scene) return;

    const read = () => {
      const canvas = scene.querySelector<HTMLCanvasElement>("canvas[data-editor-canvas]");
      if (!canvas) return;
      const next = {
        x: Number(canvas.dataset.uiX),
        y: Number(canvas.dataset.uiY),
        width: Number(canvas.dataset.uiWidth),
        height: Number(canvas.dataset.uiHeight),
      };
      if (Object.values(next).every(Number.isFinite) && next.width > 0 && next.height > 0) {
        setViewport((old) =>
          old &&
          Object.keys(next).every(
            (key) => old[key as keyof SurfaceBounds] === next[key as keyof SurfaceBounds],
          )
            ? old
            : next,
        );
      }
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(scene, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-ui-x", "data-ui-y", "data-ui-width", "data-ui-height"],
    });
    return () => observer.disconnect();
  }, []);

  const document = snapshot.document;
  return (
    <>
      <span hidden ref={marker} />
      {document && viewport && (
        <ImportSpriteSheetOverlay
          key={`${document.id ?? document.name}`}
          viewportBounds={viewport}
          documentWidth={document.width}
          documentHeight={document.height}
          view={snapshot.view}
          options={options}
          onChange={onChange}
          onViewChange={editor.setView}
          contextBounds={{
            x: viewport.x - 6,
            y: viewport.y - 42,
            width: sceneBounds.width - (viewport.x - 6),
            height: 36,
          }}
        />
      )}
    </>
  );
}
