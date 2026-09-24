export interface PaletteSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PaletteSelectionGeometry {
  index: number;
  box: PaletteSelectionRect;
  clip: PaletteSelectionRect;
  edges: { left: boolean; top: boolean; right: boolean; bottom: boolean };
}

/** PaletteView::getEntryBoundsAndClip at reference GUI scale 2.
 * Connected cells hide their shared outline; row ends never wrap sideways.
 */
export function paletteSelectionGeometry(
  selected: readonly number[],
  count: number,
  columns = 5,
  options: {
    cellSize?: number;
    scrollY?: number;
    origin?: { x: number; y: number };
  } = {},
): PaletteSelectionGeometry[] {
  const cellSize = options.cellSize ?? 22,
    pitch = cellSize + 2,
    scrollY = options.scrollY ?? 0;
  columns = Math.max(1, Math.floor(columns));
  const picks = new Set(
    selected.filter((index) => Number.isInteger(index) && index >= 0 && index < count),
  );
  return [...picks]
    .sort((a, b) => a - b)
    .map((index) => {
      const x = (options.origin?.x ?? 12) + (index % columns) * pitch,
        y = (options.origin?.y ?? 110) + Math.floor(index / columns) * pitch - scrollY;
      const edges = {
        left: index % columns === 0 || !picks.has(index - 1),
        top: !picks.has(index - columns),
        right: index % columns === columns - 1 || !picks.has(index + 1),
        bottom: !picks.has(index + columns),
      };
      const left = edges.left ? 0 : 1,
        top = edges.top ? 0 : 1,
        right = edges.right ? 0 : 1,
        bottom = edges.bottom ? 0 : 1;
      const clipLeft = edges.left ? 6 : 1,
        clipTop = edges.top ? 6 : 1,
        clipRight = edges.right ? 6 : 1,
        clipBottom = edges.bottom ? 6 : 1;
      return {
        index,
        edges,
        box: {
          x: x - 6 - left,
          y: y - 6 - top,
          width: cellSize + 12 + left + right,
          height: cellSize + 12 + top + bottom,
        },
        clip: {
          x: x - clipLeft,
          y: y - clipTop,
          width: cellSize + clipLeft + clipRight,
          height: cellSize + clipTop + clipBottom,
        },
      };
    });
}

/** PaletteView::hitTest's external 6px outline strips. */
export function hitPaletteSelectionOutline(
  point: { x: number; y: number },
  geometry: readonly PaletteSelectionGeometry[],
): number | null {
  for (const { index, edges, box } of geometry) {
    // The unjoined box before the extra shared-edge padding.
    const cellX = box.x + 6 + (edges.left ? 0 : 1);
    const cellY = box.y + 6 + (edges.top ? 0 : 1);
    const x = cellX - 6,
      y = cellY - 6;
    const width = box.width - (edges.left ? 0 : 1) - (edges.right ? 0 : 1);
    const height = box.height - (edges.top ? 0 : 1) - (edges.bottom ? 0 : 1);
    if (point.x < x || point.x >= x + width || point.y < y || point.y >= y + height) continue;
    if (
      (edges.left && point.x < x + 6) ||
      (edges.right && point.x >= x + width - 6) ||
      (edges.top && point.y < y + 6) ||
      (edges.bottom && point.y >= y + height - 6)
    )
      return index;
  }
  return null;
}
