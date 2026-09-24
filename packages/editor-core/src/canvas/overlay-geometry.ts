import { UINT8_MAX } from "$/base/numeric-constants";
import type { Point, Rect } from "$/base/primitives";

const DEFAULT_GRID_OPACITY = 160;
const GRID_ALPHA_REFERENCE_SIZE = 32;
const PIXEL_GRID_ZOOM_THRESHOLD = 2;
const PIXEL_GRID_AUTO_OPACITY_ZOOM_RANGE = 14;

/** Grid alpha and visibility thresholds follow LibreSprite's GPLv2 editor grid
 * settings. Line positions are projected independently from document cell indices. */
export function libreSpriteGridGeometry(
  document: { width: number; height: number },
  origin: Point,
  zoom: number,
  cell: { width: number; height: number },
  opacity = DEFAULT_GRID_OPACITY,
  autoOpacity = true,
): { alpha: number; bounds: Rect; lines: Rect[] } {
  const bounds = {
    x: Math.trunc(origin.x),
    y: Math.trunc(origin.y),
    width: Math.trunc(document.width * zoom),
    height: Math.trunc(document.height * zoom),
  };
  const cellWidth = Math.max(1, Math.trunc(cell.width)),
    cellHeight = Math.max(1, Math.trunc(cell.height));
  const projectedWidth = Math.trunc(cellWidth * zoom),
    projectedHeight = Math.trunc(cellHeight * zoom);
  const baseOpacity = Math.max(0, Math.min(UINT8_MAX, Math.trunc(opacity)));
  const alpha = autoOpacity
    ? Math.max(
        0,
        Math.min(
          UINT8_MAX,
          Math.trunc(
            (baseOpacity * (projectedWidth + projectedHeight)) / 2 / GRID_ALPHA_REFERENCE_SIZE,
          ),
        ),
      )
    : baseOpacity;
  if (projectedWidth <= 2 || projectedHeight <= 2 || alpha <= 8)
    return { alpha, bounds, lines: [] };

  const lines: Rect[] = [];
  const horizontalPositions = documentGridPositions(
    document.height,
    cellHeight,
    zoom,
    origin.y,
    bounds.height,
  );
  const verticalPositions = documentGridPositions(
    document.width,
    cellWidth,
    zoom,
    origin.x,
    bounds.width,
  );

  for (const y of horizontalPositions)
    lines.push({ x: bounds.x, y, width: bounds.width, height: 1 });
  for (const x of verticalPositions)
    lines.push({ x, y: bounds.y, width: 1, height: bounds.height });
  return { alpha, bounds, lines };
}

function documentGridPositions(
  documentSpan: number,
  cellSpan: number,
  zoom: number,
  origin: number,
  projectedSpan: number,
) {
  const firstPixel = Math.trunc(origin);
  const lastPixel = firstPixel + projectedSpan;
  const step = cellSpan * zoom;
  if (!(step > 0)) return [];

  const finalDocumentIndex = Math.floor(documentSpan / cellSpan);
  let finalVisibleIndex = Math.floor((lastPixel - firstPixel) / step);
  while (finalVisibleIndex >= 0 && firstPixel + finalVisibleIndex * step > lastPixel)
    finalVisibleIndex--;
  while (firstPixel + (finalVisibleIndex + 1) * step <= lastPixel) finalVisibleIndex++;
  finalVisibleIndex = Math.min(finalDocumentIndex, finalVisibleIndex);

  const positions: number[] = [];
  for (let index = 0; index <= finalVisibleIndex; index++) {
    const projected = Math.trunc(firstPixel + index * step);
    if (projected >= firstPixel && projected <= lastPixel) positions.push(projected);
  }
  return positions;
}

/** The 1×1 pixel lattice uses LibreSprite's GPLv2 auto-opacity rule: its default
 * opacity fades from 0 at 200% zoom to 160 at 1600%. Coordinates are logical
 * display pixels; line enumeration is clipped to the visible canvas. */
export function libreSpritePixelGridGeometry(
  document: Rect,
  origin: Point,
  zoom: number,
  viewport: Rect,
  opacity = DEFAULT_GRID_OPACITY,
  autoOpacity = true,
): { alpha: number; bounds: Rect; lines: Rect[] } {
  const bounds = {
    x: Math.trunc(origin.x + document.x * zoom),
    y: Math.trunc(origin.y + document.y * zoom),
    width: Math.trunc(document.width * zoom),
    height: Math.trunc(document.height * zoom),
  };
  const baseOpacity = Math.max(0, Math.min(UINT8_MAX, Math.trunc(opacity)));
  const alpha = autoOpacity
    ? Math.max(
        0,
        Math.min(
          UINT8_MAX,
          Math.trunc(
            (baseOpacity * (zoom - PIXEL_GRID_ZOOM_THRESHOLD)) / PIXEL_GRID_AUTO_OPACITY_ZOOM_RANGE,
          ),
        ),
      )
    : baseOpacity;
  if (zoom <= PIXEL_GRID_ZOOM_THRESHOLD || !alpha || bounds.width <= 0 || bounds.height <= 0)
    return { alpha, bounds, lines: [] };

  // drawGrid advances by one projected sprite pixel from the editor origin.
  // Limit line generation to the visible canvas so large sprites remain cheap.
  const firstX = Math.max(document.x, Math.floor((viewport.x - origin.x) / zoom) - 1);
  const lastX = Math.min(
    document.x + document.width,
    Math.ceil((viewport.x + viewport.width - origin.x) / zoom) + 1,
  );
  const firstY = Math.max(document.y, Math.floor((viewport.y - origin.y) / zoom) - 1);
  const lastY = Math.min(
    document.y + document.height,
    Math.ceil((viewport.y + viewport.height - origin.y) / zoom) + 1,
  );
  const lines: Rect[] = [];
  for (let y = firstY; y <= lastY; y++) {
    const screenY = Math.trunc(origin.y + y * zoom);
    if (screenY >= viewport.y - 1 && screenY <= viewport.y + viewport.height)
      lines.push({ x: bounds.x, y: screenY, width: bounds.width, height: 1 });
  }
  for (let x = firstX; x <= lastX; x++) {
    const screenX = Math.trunc(origin.x + x * zoom);
    if (screenX >= viewport.x - 1 && screenX <= viewport.x + viewport.width)
      lines.push({ x: screenX, y: bounds.y, width: 1, height: bounds.height });
  }
  return { alpha, bounds, lines };
}

function projectCoordinate(value: number, offset: number, zoom: number) {
  return Math.trunc(offset) + Math.trunc(value * zoom);
}

function projectedInterval(start: number, end: number, offset: number, zoom: number) {
  const first = Math.trunc(start * zoom);
  const last = Math.trunc(end * zoom);
  return { start: Math.trunc(offset) + first, length: last - first };
}

function perimeterOfPixelRectangle(bounds: Rect): Rect[] {
  const { x, y, width, height } = bounds;
  if (width <= 0 || height <= 0) return [];

  const border: Rect[] = [{ x, y, width, height: 1 }];
  if (height > 1) border.push({ x, y: y + height - 1, width, height: 1 });
  if (height > 2) {
    border.push({ x, y: y + 1, width: 1, height: height - 2 });
    if (width > 1) border.push({ x: x + width - 1, y: y + 1, width: 1, height: height - 2 });
  }
  return border;
}

/** Project a half-open document rectangle to integer display pixels and return
 * its non-overlapping one-pixel perimeter runs. */
export function documentLayerEdgeGeometry(layer: Rect, origin: Point, zoom: number): Rect[] {
  const horizontal = projectedInterval(layer.x, layer.x + layer.width, origin.x, zoom);
  const vertical = projectedInterval(layer.y, layer.y + layer.height, origin.y, zoom);
  return perimeterOfPixelRectangle({
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.length,
    height: vertical.length,
  });
}

function segmentRectangle(
  axis: "horizontal" | "vertical",
  first: number,
  last: number,
  position: number,
): Rect {
  if (axis === "horizontal") {
    return {
      x: Math.min(first, last),
      y: position,
      width: Math.abs(last - first),
      height: 1,
    };
  }
  return {
    x: position,
    y: Math.min(first, last),
    width: 1,
    height: Math.abs(last - first),
  };
}

function outsideSegmentRectangle(
  axis: "horizontal" | "vertical",
  from: Point,
  to: Point,
  origin: Point,
  zoom: number,
  comparison: Rect,
): Rect {
  if (axis === "horizontal") {
    const edge =
      projectCoordinate(from.x, origin.x, zoom) -
      (from.x === comparison.x + comparison.width ? 1 : 0);
    const firstY = projectCoordinate(from.y, origin.y, zoom);
    const lastY = projectCoordinate(to.y, origin.y, zoom);
    return {
      x: edge,
      y: Math.min(firstY, lastY),
      width: 1,
      height: Math.abs(lastY - firstY),
    };
  }

  const edge =
    projectCoordinate(from.y, origin.y, zoom) -
    (from.y === comparison.y + comparison.height ? 1 : 0);
  const firstX = projectCoordinate(from.x, origin.x, zoom);
  const lastX = projectCoordinate(to.x, origin.x, zoom);
  return {
    x: Math.min(firstX, lastX),
    y: edge,
    width: Math.abs(lastX - firstX),
    height: 1,
  };
}

/** Convert a spacing measurement to display-pixel segments and its label
 * anchor. Endpoints are projected separately, then represented as rectangles
 * so the canvas renderer paints crisp one-pixel runs. */
export function documentAutoGuideGeometry(
  guide: import("$/canvas/guides").CelGuide,
  origin: Point,
  zoom: number,
  canvas: { width: number; height: number },
) {
  const horizontal = guide.axis === "horizontal";
  const start = horizontal
    ? projectCoordinate(guide.from, origin.x, zoom)
    : projectCoordinate(guide.from, origin.y, zoom);
  const end = horizontal
    ? projectCoordinate(guide.to, origin.x, zoom)
    : projectCoordinate(guide.to, origin.y, zoom);
  const position = horizontal
    ? projectCoordinate(guide.position, origin.y, zoom)
    : projectCoordinate(guide.position, origin.x, zoom);
  const line = segmentRectangle(guide.axis, start, end, position);
  const extension = guide.extension
    ? outsideSegmentRectangle(
        guide.axis,
        guide.extension.from,
        guide.extension.to,
        origin,
        zoom,
        guide.comparisonBounds ?? { x: 0, y: 0, ...canvas },
      )
    : undefined;

  // The label is centered along the measured run and aligned beside its line.
  return { line, extension, midpoint: Math.trunc((start + end) / 2), position };
}
/** Repeat a stable eight-pixel dash phase in global logical-screen coordinates. */
export function documentGuideDashVisible(x: number, y: number) {
  const phase = (Math.trunc(x) + Math.trunc(y) + 7) % 8;
  return (phase + 8) % 8 >= 4;
}
