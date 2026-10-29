import type { PixelBuffer } from "$/base/primitives";
import { getColorPickerEntry } from "$/import-export/image/import/cell-color-picker";
import { MAX_RECOVERED_GRID_SIZE, pixelGridCuts } from "$/import-export/image/import/grid";
import { samplePixelation } from "$/import-export/image/import/sampling";
import {
  CellColorPicker,
  PixelationMethod,
  type PixelGridGeometry,
} from "$/import-export/image/import/types";
const CHANNELS = 4;

/** One RGBA pixel per grid cell: explicit cuts when the grid carries them, else one regular lattice. */
export function recoverGrid(
  image: PixelBuffer,
  grid: PixelGridGeometry,
  picker: CellColorPicker = CellColorPicker.MostCommon,
): PixelBuffer {
  const x = grid.cutsX ?? pixelGridCuts(image.width, grid.cellWidth, grid.offsetX),
    y = grid.cutsY ?? pixelGridCuts(image.height, grid.cellHeight, grid.offsetY);
  const width = x.length - 1,
    height = y.length - 1;
  if (width > MAX_RECOVERED_GRID_SIZE || height > MAX_RECOVERED_GRID_SIZE)
    throw new RangeError("Choose larger cells to restore this image.");
  if (grid.width !== width || grid.height !== height)
    throw new RangeError("The grid no longer matches this image.");

  // Structure picker: use global palette + label vote + centre-weighted original colour
  if (picker === CellColorPicker.Structure) {
    return samplePixelation(image, width, height, PixelationMethod.Structure, { x, y });
  }

  // EdgeReject picker: Structure + edge-rejection of soft borders
  if (picker === CellColorPicker.EdgeReject) {
    return samplePixelation(image, width, height, PixelationMethod.EdgeReject, { x, y });
  }

  // Traditional cell-by-cell color picking
  const entry = getColorPickerEntry(picker);
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const color = entry.pick(image, x[column], y[row], x[column + 1], y[row + 1]);
      if (color) data.set(color, (row * width + column) * CHANNELS);
    }
  entry.finish?.(data);
  return { width, height, data };
}
