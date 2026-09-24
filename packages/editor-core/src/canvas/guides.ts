import type { Point, Rect } from "$/base/primitives";
import { samplePixel } from "$/canvas/raster";
import { layerAtPoint } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import { EditorToolId, type EditorTool } from "$/drawing/tool-settings";
import { LAYER_REFERENCE } from "$/timeline/timeline";

export interface CelGuide {
  axis: "horizontal" | "vertical";
  from: number;
  to: number;
  position: number;
  distance: number;
  comparisonBounds?: Rect;
  extension?: { from: Point; to: Point };
}

export interface AutoCelGuideInput {
  enabled: boolean;
  tool: EditorTool;
  modifierActive: boolean;
  pointer: Point | null;
  allowLayerEdges?: boolean;
  screenScale?: number;
}

interface AxisGap {
  from: number;
  to: number;
  edge: number;
}

function gapIntervals(
  itemStart: number,
  itemEnd: number,
  fieldStart: number,
  fieldEnd: number,
): AxisGap[] {
  if (itemEnd < fieldStart) return [{ from: itemEnd, to: fieldStart, edge: fieldStart }];
  if (itemStart > fieldEnd) return [{ from: fieldEnd, to: itemStart, edge: fieldEnd }];

  const gaps: AxisGap[] = [];
  if (itemStart !== fieldStart && itemEnd !== fieldStart)
    gaps.push({ from: fieldStart, to: itemStart, edge: fieldStart });
  if (itemStart !== fieldEnd && itemEnd !== fieldEnd)
    gaps.push({ from: fieldEnd, to: itemEnd, edge: fieldEnd });
  return gaps;
}

function visibleCelPixelAt(document: EditorDocument, pointer: Point) {
  const layer = document.layer;
  if (
    !layer.visible ||
    pointer.x < 0 ||
    pointer.y < 0 ||
    pointer.x >= document.width ||
    pointer.y >= document.height
  )
    return false;
  return samplePixel(layer.pixels, { x: pointer.x - layer.x, y: pointer.y - layer.y })[3] > 0;
}

/** Compare the active cel with the visible cel under the pointer, or with the
 * canvas over transparency. Picking never changes the active layer or history. */
export function getAutoCelGuides(
  document: EditorDocument,
  input: AutoCelGuideInput,
): { showBounds: boolean; measurements: CelGuide[]; comparisonBounds?: Rect } {
  const showBounds =
    input.enabled &&
    input.tool === EditorToolId.Move &&
    input.modifierActive &&
    input.allowLayerEdges !== false &&
    input.pointer !== null &&
    !document.layer.emptyCel;
  if (!showBounds) return { showBounds: false, measurements: [] };

  const layer = document.layer;
  const timeline = document.timeline;
  const pointer = input.pointer!;
  const hoveredLayer = timeline ? layerAtPoint(document, pointer.x, pointer.y) : null;
  if (timeline ? hoveredLayer === timeline.activeLayer : visibleCelPixelAt(document, pointer))
    return { showBounds: true, measurements: [] };

  const hoveredCel =
    hoveredLayer !== null && timeline
      ? timeline.frames[timeline.activeFrame].cels[hoveredLayer]
      : null;
  const comparisonBounds =
    hoveredCel && timeline && hoveredLayer !== null
      ? timeline.layers[hoveredLayer].flags & LAYER_REFERENCE && hoveredCel.preciseBounds
        ? hoveredCel.preciseBounds
        : {
            x: hoveredCel.x,
            y: hoveredCel.y,
            width: hoveredCel.pixels.width,
            height: hoveredCel.pixels.height,
          }
      : undefined;
  const activeCel = timeline?.frames[timeline.activeFrame].cels[timeline.activeLayer];
  const activeBounds =
    timeline &&
    timeline.layers[timeline.activeLayer].flags & LAYER_REFERENCE &&
    activeCel?.preciseBounds
      ? activeCel.preciseBounds
      : { x: layer.x, y: layer.y, width: layer.pixels.width, height: layer.pixels.height };
  const measurements = celCanvasMeasurements(
    activeBounds,
    comparisonBounds ?? { x: 0, y: 0, width: document.width, height: document.height },
    input.screenScale,
  );
  return {
    showBounds: true,
    measurements: comparisonBounds
      ? measurements.map((guide) => ({ ...guide, comparisonBounds }))
      : measurements,
    ...(comparisonBounds ? { comparisonBounds } : {}),
  };
}

function displayGridCenter(start: number, span: number, scale: number) {
  const screenSpan = Math.trunc(span * scale);
  return start + Math.trunc(screenSpan / 2) / scale;
}

function outsideExtension(
  axis: CelGuide["axis"],
  position: number,
  edge: number,
  item: Rect,
  field: Rect,
): CelGuide["extension"] {
  const itemRight = item.x + item.width;
  const itemBottom = item.y + item.height;
  const fieldRight = field.x + field.width;
  const fieldBottom = field.y + field.height;

  if (axis === "horizontal") {
    if (position < field.y) return { from: { x: edge, y: item.y }, to: { x: edge, y: field.y } };
    if (position > fieldBottom)
      return { from: { x: edge, y: fieldBottom }, to: { x: edge, y: itemBottom } };
    return undefined;
  }

  if (position < field.x) return { from: { x: item.x, y: edge }, to: { x: field.x, y: edge } };
  if (position > fieldRight)
    return { from: { x: fieldRight, y: edge }, to: { x: itemRight, y: edge } };
  return undefined;
}

function measurementsForAxis(
  axis: CelGuide["axis"],
  item: Rect,
  field: Rect,
  position: number,
): CelGuide[] {
  const horizontal = axis === "horizontal";
  const start = horizontal ? item.x : item.y;
  const end = horizontal ? item.x + item.width : item.y + item.height;
  const fieldStart = horizontal ? field.x : field.y;
  const fieldEnd = horizontal ? field.x + field.width : field.y + field.height;

  return gapIntervals(start, end, fieldStart, fieldEnd).map((gap) => ({
    axis,
    from: gap.from,
    to: gap.to,
    position,
    distance: Math.abs(gap.to - gap.from),
    extension: outsideExtension(axis, position, gap.edge, item, field),
  }));
}

/** Return horizontal and vertical clearance segments around a cel rectangle.
 * The center is selected on the current projected pixel grid so odd dimensions
 * remain centered consistently at fractional and integer zoom levels. */
export function celCanvasMeasurements(cel: Rect, canvas: Rect, screenScale = 1): CelGuide[] {
  const scale = Number.isFinite(screenScale) && screenScale > 0 ? screenScale : 1;
  const centerX = displayGridCenter(cel.x, cel.width, scale);
  const centerY = displayGridCenter(cel.y, cel.height, scale);
  return [
    ...measurementsForAxis("horizontal", cel, canvas, centerY),
    ...measurementsForAxis("vertical", cel, canvas, centerX),
  ];
}
