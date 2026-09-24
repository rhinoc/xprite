import { CanvasPointerTarget } from "$/managers/input/controllers/pointer-controller";
import {
  INLINE_TEXT_MOVE_REGION_PADDING,
  SelectionMode,
  canMoveSelectionPixels,
  isSelectionTool,
  maskContains,
  selectionModeForInput,
  sliceKeyAt,
  type EditorSnapshot,
  type Point,
  type PointerInput,
  type Rect,
} from "@xprite/editor-core";

const SLICE_EDGE_HIT_RADIUS = 2;
const MIN_SLICE_EDGE_HIT_RADIUS = 0.5;

function contains(bounds: Rect, point: Point, padding = 0): boolean {
  return (
    point.x >= bounds.x - padding &&
    point.y >= bounds.y - padding &&
    point.x < bounds.x + bounds.width + padding &&
    point.y < bounds.y + bounds.height + padding
  );
}

/** Read-only hit policy: explicit handles and existing objects own finger edits.
 * Presentation supplies handle hits; document hit rules stay with this manager.
 * It never starts a transaction, commits a draft or changes selection.
 */
export function resolveCanvasPointerTarget(
  state: EditorSnapshot,
  input: PointerInput,
  hasHandle: boolean,
): CanvasPointerTarget {
  if ((input.button ?? 0) !== 0) return CanvasPointerTarget.Surface;
  if (hasHandle) return CanvasPointerTarget.Editable;
  if (state.inlineText)
    return contains(
      state.inlineText.bounds,
      input,
      INLINE_TEXT_MOVE_REGION_PADDING / state.view.zoom,
    )
      ? CanvasPointerTarget.Editable
      : CanvasPointerTarget.Surface;
  if (state.floatingPaste) {
    const paste = state.floatingPaste;
    return contains({ ...paste.pixels, x: paste.x, y: paste.y }, input)
      ? CanvasPointerTarget.Editable
      : CanvasPointerTarget.Surface;
  }
  const document = state.document;
  if (!document || state.preview) return CanvasPointerTarget.Surface;
  const tool = state.settings.tool;
  if (
    document.selection &&
    document.layer.visible &&
    !document.layer.locked &&
    isSelectionTool(tool) &&
    tool !== "magic_wand" &&
    canMoveSelectionPixels(
      selectionModeForInput(state.settings.selectionMode ?? SelectionMode.Replace, input),
      state.settings.selectionMoveOnAddMode !== false,
      input.actionModifiers?.copySelection !== undefined
        ? input.actionModifiers.copySelection &&
            !(
              input.actionModifiers.addSelection ||
              input.actionModifiers.subtractSelection ||
              input.actionModifiers.intersectSelection
            )
        : !!input.ctrl && !input.shift,
    ) &&
    maskContains(document.selection, { x: Math.floor(input.x), y: Math.floor(input.y) })
  )
    return CanvasPointerTarget.Editable;

  const timeline = document.timeline;
  if (tool === "slice" && timeline) {
    const selectedBounds: Rect[] = [];
    for (const slice of timeline.slices ?? []) {
      const bounds = sliceKeyAt(slice, timeline.activeFrame)?.bounds;
      if (!bounds) continue;
      if (contains(bounds, input)) return CanvasPointerTarget.Editable;
      if (state.selectedSliceIds?.includes(slice.id)) selectedBounds.push(bounds);
    }
    if (selectedBounds.length) {
      const x = Math.min(...selectedBounds.map((bounds) => bounds.x));
      const y = Math.min(...selectedBounds.map((bounds) => bounds.y));
      const bounds = {
        x,
        y,
        width: Math.max(...selectedBounds.map((bounds) => bounds.x + bounds.width)) - x,
        height: Math.max(...selectedBounds.map((bounds) => bounds.y + bounds.height)) - y,
      };
      const padding = Math.max(MIN_SLICE_EDGE_HIT_RADIUS, SLICE_EDGE_HIT_RADIUS / state.view.zoom);
      const nearEdge =
        Math.abs(input.x - bounds.x) <= padding ||
        Math.abs(input.x - bounds.x - bounds.width) <= padding ||
        Math.abs(input.y - bounds.y) <= padding ||
        Math.abs(input.y - bounds.y - bounds.height) <= padding;
      if (nearEdge && contains(bounds, input, padding)) return CanvasPointerTarget.Editable;
    }
  }
  return CanvasPointerTarget.Surface;
}
