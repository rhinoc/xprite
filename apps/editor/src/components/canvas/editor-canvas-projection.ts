import {
  documentToScreen,
  type Point,
  type ViewSettings,
} from "$/managers/canvas/canvas-presentation";
import type { SurfaceBounds } from "@xprite/ui";
import { RASTER_SCALE } from "@xprite/ui/canvas";

type Size = Pick<SurfaceBounds, "width" | "height">;
type CanvasView = Pick<ViewSettings, "zoom" | "pan"> & Partial<Pick<ViewSettings, "tiledMode">>;

export function editorCanvasRasterOrigin(viewport: Size, document: Size, view: CanvasView) {
  const origin = documentToScreen({ x: 0, y: 0 }, viewport, document, view);
  return { x: Math.trunc(origin.x), y: Math.trunc(origin.y) };
}

function rasterCoordinate(value: number, origin: number, zoom: number) {
  return Math.trunc((origin + value * zoom) * RASTER_SCALE);
}

export function editorCanvasRasterBounds(bounds: SurfaceBounds, origin: Point, zoom: number) {
  const x = rasterCoordinate(bounds.x, origin.x, zoom);
  const y = rasterCoordinate(bounds.y, origin.y, zoom);
  return {
    x: x / RASTER_SCALE,
    y: y / RASTER_SCALE,
    width: (rasterCoordinate(bounds.x + bounds.width, origin.x, zoom) - x) / RASTER_SCALE,
    height: (rasterCoordinate(bounds.y + bounds.height, origin.y, zoom) - y) / RASTER_SCALE,
  };
}

/** Match the editor's raster origin for both overlay painting and pointer gestures. */
export function createEditorCanvasProjection(
  surface: SurfaceBounds,
  document: Size,
  view: CanvasView,
) {
  const viewport = { width: surface.width / RASTER_SCALE, height: surface.height / RASTER_SCALE };
  const origin = editorCanvasRasterOrigin(viewport, document, view);
  return {
    viewport,
    project: (point: Point): Point => ({
      x: surface.x + rasterCoordinate(point.x, origin.x, view.zoom),
      y: surface.y + rasterCoordinate(point.y, origin.y, view.zoom),
    }),
    unproject: (point: Point): Point => ({
      x: ((point.x - surface.x) / RASTER_SCALE - origin.x) / view.zoom,
      y: ((point.y - surface.y) / RASTER_SCALE - origin.y) / view.zoom,
    }),
  };
}
