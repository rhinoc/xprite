import { UINT16_VALUE_COUNT, UINT8_MAX } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";

/** Browser allocation guard; Aseprite doc::Palette is otherwise unbounded for RGB sprites. */
export const MIN_PALETTE_COLORS = 1;
export const MAX_PALETTE_COLORS = UINT16_VALUE_COUNT;

/** doc::Palette::resize defaults newly appended entries to opaque black. */
export function resizePaletteColors(colors: readonly (readonly number[])[], size: number): Rgba[] {
  if (!Number.isInteger(size) || size < MIN_PALETTE_COLORS || size > MAX_PALETTE_COLORS)
    throw new RangeError(
      `Palette size must be between ${MIN_PALETTE_COLORS} and ${MAX_PALETTE_COLORS}.`,
    );
  return Array.from({ length: size }, (_, index) => {
    const color = colors[index];
    return color ? [color[0], color[1], color[2], color[3] ?? UINT8_MAX] : [0, 0, 0, UINT8_MAX];
  });
}
export interface PaletteResizeGeometry {
  origin: { x: number; y: number };
  columns: number;
  cellSize: number;
  scrollY: number;
}
/** PaletteView places its resize handle in the first cell after the last color. */
export function paletteResizeHandle(count: number, geometry: PaletteResizeGeometry) {
  const pitch = geometry.cellSize + 2;
  return {
    x: geometry.origin.x + (count % geometry.columns) * pitch,
    y: geometry.origin.y + Math.floor(count / geometry.columns) * pitch - geometry.scrollY,
    width: geometry.cellSize,
    height: geometry.cellSize,
  };
}
/** PaletteView::hitTest: captured drags can address empty cells and the next row.
 * A zero-size preview is legal; release commits max(1, hit.color).
 */
export function paletteResizeTarget(
  point: { x: number; y: number },
  geometry: PaletteResizeGeometry,
) {
  const pitch = geometry.cellSize + 2;
  const column = Math.max(
    0,
    Math.min(geometry.columns, Math.floor((point.x - geometry.origin.x) / pitch)),
  );
  const row = Math.max(0, Math.floor((point.y - geometry.origin.y + geometry.scrollY) / pitch));
  return Math.min(MAX_PALETTE_COLORS, row * geometry.columns + column);
}
