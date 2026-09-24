import { TimelineLayerDropPosition, type TimelineRange } from "@xprite/editor-core";

export { TimelineLayerDropPosition };

const DROP_MARKER_SIZE = 5;
const OUTLINE_HIT_INSET_MULTIPLIER = 2;

interface TimelineSceneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** All dimensions and scroll offsets use the timeline's unscaled scene coordinates. */
export interface TimelineRangeViewport {
  frameCount: number;
  visibleLayerIndices: readonly number[];
  frameSize: number;
  rowSize: number;
  frameLeft: number;
  rowTop: number;
  headerTop: number;
  timelineRight: number;
  timelineBottom: number;
  frameScroll: number;
  layerScroll: number;
  outlineWidth: number;
  themeScale: number;
  timelineLeft?: number;
  layerLabelLeft?: number;
}

export interface TimelineRangeGeometry {
  bounds: TimelineSceneRect;
  outlineBounds: TimelineSceneRect;
  clipBounds: TimelineSceneRect;
  outlineClipBounds: TimelineSceneRect;
  outlineWidth: number;
}

export enum TimelineDropMarkerKind {
  Cels = "cels",
  Frames = "frames",
  Layers = "layers",
  IntoGroup = "into-group",
}

export interface TimelineDropGeometryInput {
  range: TimelineRange;
  df: number;
  dl: number;
  /** Insertion boundary in the original frame order, before removing the dragged frames. */
  frameInsertion?: number;
  /** Visible target row; the caller owns subtree and grouping decisions. */
  layerTarget?: number;
  layerPosition?: TimelineLayerDropPosition;
}

export interface TimelineDropGeometry {
  kind: TimelineDropMarkerKind;
  bounds: TimelineSceneRect;
  clipBounds: TimelineSceneRect;
}

function rect(left: number, top: number, right: number, bottom: number): TimelineSceneRect {
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function expand(bounds: TimelineSceneRect, amount: number): TimelineSceneRect {
  return {
    x: bounds.x - amount,
    y: bounds.y - amount,
    width: bounds.width + amount * 2,
    height: bounds.height + amount * 2,
  };
}

function contains(bounds: TimelineSceneRect, point: { x: number; y: number }): boolean {
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    point.x >= bounds.x &&
    point.y >= bounds.y &&
    point.x < bounds.x + bounds.width &&
    point.y < bounds.y + bounds.height
  );
}

function rangeClip(
  kind: TimelineRange["kind"],
  viewport: TimelineRangeViewport,
): TimelineSceneRect {
  return rect(
    kind === "layers" ? (viewport.timelineLeft ?? 0) : viewport.frameLeft,
    kind === "frames" ? viewport.headerTop : viewport.rowTop,
    viewport.timelineRight,
    viewport.timelineBottom,
  );
}

function outlineBounds(
  bounds: TimelineSceneRect,
  viewport: TimelineRangeViewport,
): TimelineSceneRect {
  const leading = Math.max(0, viewport.outlineWidth - viewport.themeScale);
  return rect(
    bounds.x - leading,
    bounds.y - leading,
    bounds.x + bounds.width + viewport.outlineWidth,
    bounds.y + bounds.height + viewport.outlineWidth,
  );
}

/** A range's full bounds stay intact when scrolled; clipping must not create new draggable edges. */
export function getTimelineRangeGeometry(
  range: TimelineRange | undefined,
  viewport: TimelineRangeViewport,
): TimelineRangeGeometry | null {
  if (!range?.frames.length || !range.layers.length || !viewport.visibleLayerIndices.length)
    return null;
  const selectedRows = viewport.visibleLayerIndices
    .map((index, row) => (range.layers.includes(index) ? row : -1))
    .filter((row) => row >= 0);
  if (!selectedRows.length) return null;

  const left =
    range.kind === "layers"
      ? (viewport.layerLabelLeft ?? viewport.timelineLeft ?? 0)
      : viewport.frameLeft + Math.min(...range.frames) * viewport.frameSize - viewport.frameScroll;
  const top =
    range.kind === "frames"
      ? viewport.headerTop
      : viewport.rowTop + Math.min(...selectedRows) * viewport.rowSize - viewport.layerScroll;
  const right =
    viewport.frameLeft +
    (range.kind === "layers" ? viewport.frameCount : Math.max(...range.frames) + 1) *
      viewport.frameSize -
    viewport.frameScroll;
  const bottom =
    viewport.rowTop +
    (range.kind === "frames"
      ? viewport.visibleLayerIndices.length
      : Math.max(...selectedRows) + 1) *
      viewport.rowSize -
    viewport.layerScroll;
  const bounds = rect(left, top, right, bottom);
  if (!bounds.width || !bounds.height) return null;
  const clipBounds = rangeClip(range.kind, viewport);
  return {
    bounds,
    outlineBounds: outlineBounds(bounds, viewport),
    clipBounds,
    outlineClipBounds: expand(clipBounds, viewport.outlineWidth),
    outlineWidth: viewport.outlineWidth,
  };
}

/** Copy modifiers and right-button dragging can use the interior as well as the edge. */
export function hitTimelineRangeOutline(
  geometry: TimelineRangeGeometry | null,
  point: { x: number; y: number },
  includeInterior = false,
): boolean {
  if (
    !geometry ||
    !contains(geometry.outlineClipBounds, point) ||
    !contains(geometry.outlineBounds, point)
  )
    return false;
  return (
    includeInterior ||
    !contains(
      expand(geometry.outlineBounds, -geometry.outlineWidth * OUTLINE_HIT_INSET_MULTIPLIER),
      point,
    )
  );
}

/** Insertion markers use the pointer's original-order target, never the final transfer offset. */
export function getTimelineDropGeometry(
  drop: TimelineDropGeometryInput | null,
  viewport: TimelineRangeViewport,
): TimelineDropGeometry | null {
  if (!drop) return null;
  const markerSize = DROP_MARKER_SIZE * viewport.themeScale;
  const clipBounds = expand(rangeClip(drop.range.kind, viewport), viewport.outlineWidth);

  if (drop.range.kind === "cels") {
    const target = getTimelineRangeGeometry(
      {
        ...drop.range,
        frames: drop.range.frames.map((frame) => frame + drop.df),
        layers: drop.range.layers.map((layer) => layer + drop.dl),
      },
      viewport,
    );
    return target
      ? { kind: TimelineDropMarkerKind.Cels, bounds: target.outlineBounds, clipBounds }
      : null;
  }

  if (drop.range.kind === "frames") {
    if (drop.frameInsertion === undefined) return null;
    const insertion = Math.max(0, Math.min(viewport.frameCount, drop.frameInsertion));
    const x = viewport.frameLeft + insertion * viewport.frameSize - viewport.frameScroll;
    return {
      kind: TimelineDropMarkerKind.Frames,
      bounds: rect(
        x - markerSize / 2,
        viewport.headerTop,
        x + markerSize / 2,
        Math.max(
          viewport.rowTop,
          viewport.rowTop +
            viewport.visibleLayerIndices.length * viewport.rowSize -
            viewport.layerScroll,
        ),
      ),
      clipBounds,
    };
  }

  if (drop.layerTarget === undefined || drop.layerPosition === undefined) return null;
  const row = viewport.visibleLayerIndices.indexOf(drop.layerTarget);
  if (row < 0) return null;
  const left = viewport.layerLabelLeft ?? viewport.timelineLeft ?? 0;
  const right = Math.max(
    viewport.frameLeft,
    viewport.frameLeft + viewport.frameCount * viewport.frameSize - viewport.frameScroll,
  );
  const top = viewport.rowTop + row * viewport.rowSize - viewport.layerScroll;
  if (drop.layerPosition === TimelineLayerDropPosition.Inside) {
    return {
      kind: TimelineDropMarkerKind.IntoGroup,
      bounds: outlineBounds(rect(left, top, right, top + viewport.rowSize), viewport),
      clipBounds,
    };
  }
  const y = top + (drop.layerPosition === TimelineLayerDropPosition.Below ? viewport.rowSize : 0);
  return {
    kind: TimelineDropMarkerKind.Layers,
    bounds: rect(left, y - markerSize / 2, right, y + markerSize / 2),
    clipBounds,
  };
}
