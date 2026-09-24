import { type SurfaceBounds, type SurfaceViewport } from "@xprite/ui";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";

export interface CanvasCommandContext {
  viewport: { width: number; height: number };
  zoomAnchor?: { x: number; y: number };
}

interface ClientRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Convert local presentation pixels into logical editor scene coordinates. */
export function presentationToCanvasLogical(
  point: { x: number; y: number },
  bounds: SurfaceBounds,
  viewport: SurfaceViewport = DEFAULT_SURFACE_VIEWPORT,
) {
  const layout = surfaceLayout(bounds, viewport);
  return {
    x: (((point.x + layout.left) * viewport.sceneWidth) / viewport.width - bounds.x) / 2,
    y: (((point.y + layout.top) * viewport.sceneHeight) / viewport.height - bounds.y) / 2,
  };
}

export function presentationDeltaToCanvasLogical(
  delta: { x: number; y: number },
  viewport: SurfaceViewport = DEFAULT_SURFACE_VIEWPORT,
) {
  return {
    x: (delta.x * viewport.sceneWidth) / viewport.width / 2,
    y: (delta.y * viewport.sceneHeight) / viewport.height / 2,
  };
}

/** UI coordinate mapping from the canvas element into the command viewport. */
export function createCanvasCommandContext(
  surfaceBounds: SurfaceBounds,
  rect?: ClientRect | null,
  pointer?: { x: number; y: number } | null,
): CanvasCommandContext {
  const viewport = {
    width: surfaceBounds.width / 2,
    height: surfaceBounds.height / 2,
  };
  if (
    !rect ||
    !pointer ||
    pointer.x < rect.left ||
    pointer.x >= rect.right ||
    pointer.y < rect.top ||
    pointer.y >= rect.bottom
  )
    return { viewport };

  const layout = surfaceLayout(surfaceBounds);
  const presentationPoint = {
    x: ((pointer.x - rect.left) * layout.width) / rect.width,
    y: ((pointer.y - rect.top) * layout.height) / rect.height,
  };
  const point = presentationToCanvasLogical(presentationPoint, surfaceBounds);
  return { viewport, zoomAnchor: { x: Math.floor(point.x), y: Math.floor(point.y) } };
}
