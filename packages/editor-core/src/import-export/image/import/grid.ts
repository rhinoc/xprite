import type { PixelBuffer } from "$/base/primitives";
import type { PixelGridGeometry } from "$/import-export/image/import/types";

export const MAX_RECOVERED_GRID_SIZE = 512;
export const MAX_GRID_CELL_SIZE = 128;
const PHASE_SNAP = 0.2;
const PIXEL_CENTER_OFFSET = 0.5;
export function pixelGridCuts(length: number, step: number, offset = 0): number[] {
  if (!Number.isFinite(step) || step < 1 || !Number.isFinite(offset))
    throw new RangeError("Grid cells must be at least one pixel wide.");
  const phase = ((offset % step) + step) % step;
  const cuts = [0];
  let position = phase > PHASE_SNAP ? phase : step;
  for (; position < length - PHASE_SNAP; position += step) {
    // Quantize one regular lattice to raster edges; never chase individual content edges.
    const cut = Math.max(0, Math.min(length, Math.ceil(position - PIXEL_CENTER_OFFSET)));
    if (cut > cuts[cuts.length - 1] && cut < length) cuts.push(cut);
  }
  cuts.push(length);
  return cuts;
}
export function manualPixelGrid(
  image: Pick<PixelBuffer, "width" | "height">,
  cellWidth: number,
  cellHeight: number,
): PixelGridGeometry {
  if (cellWidth > MAX_GRID_CELL_SIZE || cellHeight > MAX_GRID_CELL_SIZE)
    throw new RangeError("Choose cell sizes no larger than 128 pixels.");
  const width = pixelGridCuts(image.width, cellWidth).length - 1,
    height = pixelGridCuts(image.height, cellHeight).length - 1;
  if (width > MAX_RECOVERED_GRID_SIZE || height > MAX_RECOVERED_GRID_SIZE)
    throw new RangeError("Choose larger cells to restore this image.");
  return { width, height, cellWidth, cellHeight, offsetX: 0, offsetY: 0 };
}
