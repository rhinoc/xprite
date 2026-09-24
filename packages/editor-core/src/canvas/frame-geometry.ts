import type { Point, Rect } from "$/base/primitives";
import { clamp } from "@xprite/bedrock/common/clamp";

const EDITOR_FRAME_INSET = 6;
const EDITOR_FRAME_SCROLLBAR_TRACK_SIZE = 12;
const EDITOR_FRAME_HORIZONTAL_RESERVE = 24;
const EDITOR_FRAME_VERTICAL_RESERVE = 24;
const EDITOR_FRAME_RESERVE_WITHOUT_SCROLLBARS = EDITOR_FRAME_INSET * 2;

export interface EditorScrollAxis {
  visible: number;
  content: number;
  padding: number;
  scroll: number;
  maximum: number;
  position: number;
  length: number;
  travel: number;
}
/** Canvas padding follows LibreSprite's GPLv2 Editor::calcExtraPadding; the
 * proportional thumb uses its MIT-licensed UI scrollbar rule. Values here are
 * logical GUI pixels, before the renderer's screen-scale conversion. */
export function editorScrollAxis(
  visible: number,
  documentSize: number,
  documentOffset: number,
  minimumThumb = 24,
): EditorScrollAxis {
  visible = Math.max(0, Math.trunc(visible));
  documentSize = Math.max(0, Math.trunc(documentSize));
  if (!documentSize)
    return {
      visible,
      content: visible,
      padding: 0,
      scroll: 0,
      maximum: 0,
      length: visible,
      travel: 0,
      position: 0,
    };
  const padding = Math.max(Math.trunc(visible / 2), visible - documentSize),
    content = documentSize + padding * 2,
    maximum = Math.max(0, content - visible),
    scroll = clamp(padding - Math.trunc(documentOffset), 0, maximum);
  const length =
      maximum === 0
        ? visible
        : clamp(
            Math.trunc((visible * visible) / content),
            Math.min(minimumThumb, visible),
            visible,
          ),
    travel = visible - length;
  return {
    visible,
    content,
    padding,
    scroll,
    maximum,
    length,
    travel,
    position: maximum ? clamp(Math.trunc((travel * scroll) / maximum), 0, travel) : 0,
  };
}
/** The document base rectangle/pan and returned paint rectangles are in
 * physical pixels. Integer source arithmetic is completed before multiplying2. */
export function editorFrameGeometry(
  frame: Rect,
  baseDocument: Rect,
  zoom: number,
  pan: Point,
  minimumThumb = 24,
  showScrollbars = true,
) {
  const horizontalReserve = showScrollbars
      ? EDITOR_FRAME_HORIZONTAL_RESERVE
      : EDITOR_FRAME_RESERVE_WITHOUT_SCROLLBARS,
    verticalReserve = showScrollbars
      ? EDITOR_FRAME_VERTICAL_RESERVE
      : EDITOR_FRAME_RESERVE_WITHOUT_SCROLLBARS;
  const viewport = {
    x: frame.x + EDITOR_FRAME_INSET,
    y: frame.y + EDITOR_FRAME_INSET,
    width: Math.max(0, frame.width - horizontalReserve),
    height: Math.max(0, frame.height - verticalReserve),
  };
  const baseW = Math.trunc(baseDocument.width / 2),
    baseH = Math.trunc(baseDocument.height / 2),
    width = Math.trunc(baseW * zoom),
    height = Math.trunc(baseH * zoom);
  const document = {
    x:
      (Math.trunc(baseDocument.x / 2) +
        Math.trunc(baseW / 2) -
        Math.trunc(width / 2) +
        Math.trunc(pan.x / 2)) *
      2,
    y:
      (Math.trunc(baseDocument.y / 2) +
        Math.trunc(baseH / 2) -
        Math.trunc(height / 2) +
        Math.trunc(pan.y / 2)) *
      2,
    width: width * 2,
    height: height * 2,
  };
  const horizontal = editorScrollAxis(
      viewport.width / 2,
      width,
      (document.x - viewport.x) / 2,
      minimumThumb,
    ),
    vertical = editorScrollAxis(
      viewport.height / 2,
      height,
      (document.y - viewport.y) / 2,
      minimumThumb,
    );
  return {
    viewport,
    document,
    horizontal,
    vertical,
    horizontalTrack: {
      x: viewport.x,
      y: viewport.y + viewport.height,
      width: viewport.width,
      height: EDITOR_FRAME_SCROLLBAR_TRACK_SIZE,
    },
    verticalTrack: {
      x: viewport.x + viewport.width,
      y: viewport.y,
      width: EDITOR_FRAME_SCROLLBAR_TRACK_SIZE,
      height: viewport.height,
    },
    horizontalThumb: {
      x: viewport.x + horizontal.position * 2,
      y: viewport.y + viewport.height,
      width: horizontal.length * 2,
      height: EDITOR_FRAME_SCROLLBAR_TRACK_SIZE,
    },
    verticalThumb: {
      x: viewport.x + viewport.width,
      y: viewport.y + vertical.position * 2,
      width: EDITOR_FRAME_SCROLLBAR_TRACK_SIZE,
      height: vertical.length * 2,
    },
  };
}
/** Thumb dragging maps absolute thumb position to integer scroll. */
export function editorScrollDragPan(
  axis: EditorScrollAxis,
  startPan: number,
  deltaScene: number,
): number {
  if (!axis.travel) return startPan;
  const position = clamp(axis.position + Math.trunc(deltaScene / 2), 0, axis.travel);
  const scroll = Math.trunc((axis.maximum * position) / axis.travel);
  return startPan - (scroll - axis.scroll) * 2;
}
