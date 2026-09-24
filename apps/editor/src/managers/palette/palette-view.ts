import { asepritePaletteLayout } from "$/managers/palette/policies/palette-layout";
import {
  hitPaletteSelectionOutline,
  paletteSelectionGeometry,
  type PaletteSelectionGeometry,
} from "$/managers/palette/policies/palette-selection";
import {
  MAX_PALETTE_COLORS,
  dropPaletteColors,
  paletteResizeHandle,
  paletteResizeTarget,
} from "@xprite/editor-core";

export const MAX_EDITOR_PALETTE_COLORS = MAX_PALETTE_COLORS;
export type PaletteDropPreview = ReturnType<typeof dropPaletteColors>;
export type PaletteSelectionFrame = PaletteSelectionGeometry;

export function getPaletteGridLayout(
  count: number,
  boxSize = 11,
  initialColumns?: number,
  viewportHeight = 660,
  viewportWidth = 134,
) {
  return asepritePaletteLayout(count, boxSize, initialColumns, viewportHeight, viewportWidth);
}

export function getPaletteSelectionFrames(
  selected: readonly number[],
  count: number,
  columns = 5,
  options: { cellSize?: number; scrollY?: number; origin?: { x: number; y: number } } = {},
) {
  return paletteSelectionGeometry(selected, count, columns, options);
}

export function findPaletteSelectionOutline(
  point: { x: number; y: number },
  geometry: readonly PaletteSelectionFrame[],
): number | null {
  return hitPaletteSelectionOutline(point, geometry);
}

export function getPaletteResizeHandle(
  count: number,
  geometry: {
    origin: { x: number; y: number };
    columns: number;
    cellSize: number;
    scrollY: number;
  },
) {
  return paletteResizeHandle(count, geometry);
}

export function getPaletteResizeTarget(
  point: { x: number; y: number },
  geometry: {
    origin: { x: number; y: number };
    columns: number;
    cellSize: number;
    scrollY: number;
  },
) {
  return paletteResizeTarget(point, geometry);
}

export function previewPaletteDrop(
  colors: readonly (readonly number[])[],
  selected: readonly number[],
  target: number,
  copy: boolean,
): PaletteDropPreview {
  return dropPaletteColors(colors, selected, target, copy);
}
