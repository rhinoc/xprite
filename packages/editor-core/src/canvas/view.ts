import type { Point } from "$/base/primitives";
import type { ViewSettings } from "$/canvas/types";
import { asepriteZoomLevels, stepAsepriteZoom } from "$/canvas/zoom";
import { clamp } from "@xprite/bedrock/common/clamp";
type CanvasProjectionView = Pick<ViewSettings, "zoom" | "pan"> &
  Partial<Pick<ViewSettings, "tiledMode">>;
export const DEFAULT_VIEW: ViewSettings = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  onionSkin: undefined,
  playback: undefined,
  symmetryMode: undefined,
  symmetryX: undefined,
  symmetryY: undefined,
  tiledMode: undefined,
  gridX: undefined,
  gridY: undefined,
  snapToGrid: undefined,
  grid: false,
  pixelGrid: false,
  selectionEdges: true,
  guides: true,
  layerEdges: false,
  slices: true,
  tileNumbers: true,
  brushPreview: true,
  gridWidth: 16,
  gridHeight: 16,
  appearance: "light",
};
/** Center in logical pixels before the canvas is scaled for display. */
function centeredAxis(viewportSize: number, canvasSize: number, zoom: number): number {
  return Math.trunc(viewportSize / 2) - Math.trunc(Math.trunc(canvasSize * zoom) / 2);
}
export function documentToScreen(
  point: Point,
  viewport: { width: number; height: number },
  document: { width: number; height: number },
  view: CanvasProjectionView,
): Point {
  return {
    x:
      centeredAxis(
        viewport.width,
        document.width * ((view.tiledMode ?? 0) & 1 ? 3 : 1),
        view.zoom,
      ) +
      view.pan.x +
      (point.x + ((view.tiledMode ?? 0) & 1 ? document.width : 0)) * view.zoom,
    y:
      centeredAxis(
        viewport.height,
        document.height * ((view.tiledMode ?? 0) & 2 ? 3 : 1),
        view.zoom,
      ) +
      view.pan.y +
      (point.y + ((view.tiledMode ?? 0) & 2 ? document.height : 0)) * view.zoom,
  };
}
export function screenToDocument(
  point: Point,
  viewport: { width: number; height: number },
  document: { width: number; height: number },
  view: CanvasProjectionView,
): Point {
  const origin = documentToScreen({ x: 0, y: 0 }, viewport, document, view);
  return {
    x: (point.x - origin.x) / view.zoom,
    y: (point.y - origin.y) / view.zoom,
  };
}
export const ZOOM_LEVELS = asepriteZoomLevels.map((value) => value / 100);
/** Common zoom bounds for view assignment and anchored user interactions. */
export function clampZoom(value: number, fallback = 1): number {
  return Number.isNaN(value) ? fallback : Math.max(1 / 64, Math.min(64, value));
}
export function stepZoom(current: number, direction: number) {
  return stepAsepriteZoom(current * 100, direction) / 100;
}
/** Keep the projected canvas within the padded scroll interval used by
 * LibreSprite's GPLv2 `calcExtraPadding` and `View::onSetViewScroll` model.
 */
export function clampCanvasPan(
  pan: Point,
  viewport: { width: number; height: number },
  document: { width: number; height: number },
  zoom: number,
  tiledMode = 0,
): Point {
  const axis = (value: number, visible: number, size: number) => {
    const projected = Math.trunc(size * zoom);
    const padding = Math.max(Math.trunc(visible / 2), visible - projected);
    const centered = centeredAxis(visible, size, zoom);
    const maximumScroll = Math.max(0, projected + 2 * padding - visible);
    const scroll = Math.max(0, Math.min(maximumScroll, Math.trunc(padding - centered - value)));
    return padding - scroll - centered;
  };
  return {
    x: axis(pan.x, viewport.width, document.width * (tiledMode & 1 ? 3 : 1)),
    y: axis(pan.y, viewport.height, document.height * (tiledMode & 2 ? 3 : 1)),
  };
}
/** Apply LibreSprite's GPLv2 `EditorView::KeepOrigin` rule so a viewport resize
 * leaves the document origin in place.
 */
export function keepDocumentOrigin(
  previous: { width: number; height: number },
  next: { width: number; height: number },
  pan: Point,
): Point {
  return {
    x: pan.x + Math.trunc(previous.width / 2) - Math.trunc(next.width / 2),
    y: pan.y + Math.trunc(previous.height / 2) - Math.trunc(next.height / 2),
  };
}

/** Convert the visible viewport to integer document bounds before display scaling.
 * The negative lower edge uses the same one-past convention as LibreSprite's
 * GPLv2 integer zoom removal, including when the division is exact.
 */
export function libreSpriteViewportDocumentBounds(
  viewport: { width: number; height: number },
  document: { width: number; height: number },
  view: CanvasProjectionView,
) {
  const origin = documentToScreen({ x: 0, y: 0 }, viewport, document, view);
  const denominator = view.zoom < 1 ? Math.round(1 / view.zoom) : 1;
  const numerator = view.zoom >= 1 && Number.isInteger(view.zoom) ? view.zoom : 1;
  const exactZoomRatio = Math.abs(numerator / denominator - view.zoom) < 1e-12;
  const divide = (value: number) =>
    exactZoomRatio ? (value * denominator) / numerator : value / view.zoom;
  const lower = (value: number) => {
    value = Math.trunc(value);
    return Math.trunc(divide(value)) - (value < 0 ? 1 : 0);
  };
  const upper = (value: number) => {
    value = Math.trunc(value);
    return value < 0 ? Math.trunc(divide(value)) : Math.ceil(divide(value));
  };
  const x = lower(-origin.x),
    y = lower(-origin.y);
  return {
    x,
    y,
    width: upper(viewport.width - origin.x) - x,
    height: upper(viewport.height - origin.y) - y,
  };
}

/** Place pasted pixels by intersecting the viewport and document rectangles. */
export function documentPastePosition(
  image: { width: number; height: number },
  document: { width: number; height: number },
  viewport: { width: number; height: number },
  view: CanvasProjectionView,
): Point {
  const viewportBounds = libreSpriteViewportDocumentBounds(viewport, document, view);
  const visibleStartX = Math.max(0, viewportBounds.x);
  const visibleStartY = Math.max(0, viewportBounds.y);
  const visibleEndX = Math.min(document.width, viewportBounds.x + viewportBounds.width);
  const visibleEndY = Math.min(document.height, viewportBounds.y + viewportBounds.height);
  const hasVisibleDocumentArea = visibleEndX > visibleStartX && visibleEndY > visibleStartY;
  const visible = hasVisibleDocumentArea
    ? {
        x: visibleStartX,
        y: visibleStartY,
        width: visibleEndX - visibleStartX,
        height: visibleEndY - visibleStartY,
      }
    : { x: 0, y: 0, width: 0, height: 0 };
  const centeredOrigin = (start: number, extent: number, imageExtent: number) =>
    start + Math.trunc(extent / 2) - Math.trunc(imageExtent / 2);
  const keepVisible = (
    proposedOrigin: number,
    imageExtent: number,
    viewportStart: number,
    viewportExtent: number,
  ) => {
    const viewportEnd = viewportStart + viewportExtent;
    const imageCenter = proposedOrigin + Math.trunc(imageExtent / 2);
    if (imageCenter < viewportStart || imageCenter >= viewportEnd)
      return centeredOrigin(viewportStart, viewportExtent, imageExtent);

    // These endpoints are the origins where the image first/last overlaps the
    // half-open viewport interval by one logical pixel.
    return clamp(proposedOrigin, viewportStart - imageExtent, viewportEnd - 1);
  };
  const proposed = {
    x: centeredOrigin(visible.x, visible.width, image.width),
    y: centeredOrigin(visible.y, visible.height, image.height),
  };
  const positioned = {
    x: keepVisible(proposed.x, image.width, viewportBounds.x, viewportBounds.width),
    y: keepVisible(proposed.y, image.height, viewportBounds.y, viewportBounds.height),
  };

  // If either axis cannot contain the whole image, use the partial-overlap
  // rule on both axes; otherwise require the image to fit inside the document.
  const requireWholeImageInside = image.width >= document.width || image.height >= document.height;
  const fitDocumentAxis = (origin: number, imageExtent: number, docExtent: number) =>
    requireWholeImageInside
      ? clamp(origin, 0, Math.max(0, docExtent - imageExtent))
      : clamp(origin, 1 - imageExtent, docExtent - 1);
  return {
    x: fitDocumentAxis(positioned.x, image.width, document.width),
    y: fitDocumentAxis(positioned.y, image.height, document.height),
  };
}

/** Pin an integer viewport point to its document pixel while changing zoom.
 * Integer projection and within-pixel snapping follow the GPLv2 zoom behavior
 * in LibreSprite; visible document and tiled-canvas limits use this editor's
 * viewport geometry.
 */
export function libreSpriteZoomAtAnchor(
  desiredZoom: number,
  viewport: { width: number; height: number },
  document: { width: number; height: number },
  view: CanvasProjectionView,
  anchor?: Point,
): Pick<ViewSettings, "zoom" | "pan"> {
  // Treat repeated tiles as one expanded canvas for anchor and pan arithmetic.
  if (view.tiledMode)
    return libreSpriteZoomAtAnchor(
      desiredZoom,
      viewport,
      {
        width: document.width * (view.tiledMode & 1 ? 3 : 1),
        height: document.height * (view.tiledMode & 2 ? 3 : 1),
      },
      { ...view, tiledMode: 0 },
      anchor,
    );
  const zoom = clampZoom(desiredZoom, view.zoom);
  const old = {
    ...view,
    pan: { x: Math.trunc(view.pan.x), y: Math.trunc(view.pan.y) },
  };
  const ratio = (scale: number) => {
    const denominator = scale < 1 ? Math.round(1 / scale) : 1;
    const numerator = scale >= 1 && Number.isInteger(scale) ? scale : 1;
    return Math.abs(numerator / denominator - scale) < 1e-12 ? { numerator, denominator } : null;
  };
  const apply = (value: number, scale: number) => {
    const r = ratio(scale);
    return Math.trunc(r ? (value * r.numerator) / r.denominator : value * scale);
  };
  const remove = (value: number, scale: number) => {
    const r = ratio(scale);
    return (
      Math.trunc(r ? (value * r.denominator) / r.numerator : value / scale) - (value < 0 ? 1 : 0)
    );
  };
  const origin = documentToScreen({ x: 0, y: 0 }, viewport, document, old);
  const vp = libreSpriteViewportDocumentBounds(viewport, document, old);
  type Span = { start: number; end: number };
  const intersect = (a: Span, b: Span): Span => ({
    start: Math.max(a.start, b.start),
    end: Math.min(a.end, b.end),
  });
  const xVisible = intersect(
    { start: vp.x, end: vp.x + vp.width },
    { start: 0, end: document.width },
  );
  const yVisible = intersect(
    { start: vp.y, end: vp.y + vp.height },
    { start: 0, end: document.height },
  );

  // The valid anchor set is a Cartesian product of independently clipped
  // half-open axes. Project their edges separately so integer zoom can collapse
  // an axis to one screen pixel without building a projected bounds rectangle.
  // If either axis has no document pixels, both collapse to the origin anchor.
  const visible =
    xVisible.end > xVisible.start && yVisible.end > yVisible.start
      ? { x: xVisible, y: yVisible }
      : { x: { start: 0, end: 0 }, y: { start: 0, end: 0 } };
  const coveredScreenPixels = (pixels: Span, imageOrigin: number): Span => {
    const first = imageOrigin + apply(pixels.start, old.zoom);
    const afterLast = imageOrigin + apply(pixels.end, old.zoom);
    return { start: first, end: first + Math.max(1, afterLast - first) };
  };
  const xCovered = coveredScreenPixels(visible.x, origin.x);
  const yCovered = coveredScreenPixels(visible.y, origin.y);
  const pointInSpan = (point: number, pixels: Span) =>
    Math.max(pixels.start, Math.min(point, pixels.end - 1));
  const requested = {
    x: anchor ? Math.floor(anchor.x) : Math.trunc(viewport.width / 2),
    y: anchor ? Math.floor(anchor.y) : Math.trunc(viewport.height / 2),
  };
  const screen = {
    x: pointInSpan(requested.x, xCovered),
    y: pointInSpan(requested.y, yCovered),
  };
  const axis = (screen: number, origin: number, extent: number, viewportExtent: number) => {
    const pixel = remove(screen - origin, old.zoom);
    let subpixel = 0.5;
    if (anchor && old.zoom > 1) {
      const pixelOrigin = origin + apply(pixel, old.zoom);
      subpixel = (0.5 + screen - pixelOrigin) / old.zoom;
      if (zoom > old.zoom) {
        const radius = 1 / zoom;
        if (subpixel >= 0.5 - radius && subpixel <= 0.5 + radius) subpixel = 0.5;
      }
    }
    const nextOrigin =
      screen - apply(pixel + Math.trunc(remove(1, zoom) / 2), zoom) - Math.trunc(subpixel * zoom);
    return nextOrigin - centeredAxis(viewportExtent, extent, zoom);
  };
  const result = {
    zoom,
    pan: {
      x: axis(screen.x, origin.x, document.width, viewport.width),
      y: axis(screen.y, origin.y, document.height, viewport.height),
    },
  };
  return { zoom, pan: clampCanvasPan(result.pan, viewport, document, zoom) };
}

/** Choose a discrete zoom stop using the viewport's limiting axis. Growing stops
 * one level before the first projection that reaches the available extent.
 */
export function fitScreenZoom(
  current: number,
  viewport: { width: number; height: number },
  canvas: { width: number; height: number },
): number {
  const horizontal = viewport.width / canvas.width < viewport.height / canvas.height;
  const available = horizontal ? viewport.width : viewport.height;
  const extent = horizontal ? canvas.width : canvas.height;
  let zoom = clampZoom(current);
  const projected = (scale: number) => Math.trunc(extent * scale);
  const initialSize = projected(zoom);
  if (initialSize === available) return zoom;

  if (initialSize > available) {
    while (projected(zoom) > available) {
      const candidate = stepZoom(zoom, -1);
      if (candidate === zoom) return zoom;
      zoom = candidate;
    }
    return zoom;
  }

  while (projected(zoom) < available) {
    const candidate = stepZoom(zoom, 1);
    if (candidate === zoom) return zoom;
    if (projected(candidate) >= available) return stepZoom(candidate, -1);
    zoom = candidate;
  }
  return zoom;
}
