import { selectionCursorDirection } from "$/adapters/input/selection-cursor-direction";
import { cursorStyle } from "@xprite/ui/cursor";
import type { CursorName } from "@xprite/ui/cursor";

export function editorCursor(tool: string) {
  const role =
    tool === "eyedropper"
      ? "eyedropper"
      : tool === "move"
        ? "move"
        : tool === "zoom"
          ? "magnifier"
          : "crosshair";
  return cursorStyle(role, role === "move" ? "move" : "crosshair");
}

// BrushPreview::createCrosshairCursor uses this sparse 7x7 pattern. The atlas
// cursor_crosshair is the larger generic UI cursor, not this one.
export const paintingCrosshairPixels = [
  [3, 0],
  [3, 1],
  [0, 3],
  [1, 3],
  [5, 3],
  [6, 3],
  [3, 5],
  [3, 6],
] as const;
/** Rotate the resize/rotate cursor direction with the selected bounds. */
export function selectionHandleCursor(
  handle: string,
  bounds: { width: number; height: number },
  angle: number,
) {
  const rotating = handle.startsWith("rotate-");
  const direction = selectionCursorDirection(handle, bounds.width, bounds.height, angle);
  return direction
    ? cursorStyle(`${rotating ? "rotate" : "scale"}-${direction}` as CursorName, "crosshair")
    : cursorStyle("move", "move");
}
