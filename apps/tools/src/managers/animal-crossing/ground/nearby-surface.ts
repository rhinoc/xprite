import type { PixelBuffer } from "@xprite/editor-core/base";
import { ANIMAL_CROSSING_SIZE } from "@xprite/editor-core/import-export";

const NEIGHBORHOOD_SIZE = 3;
const HALF_NEIGHBORHOOD = 1;
const CHANNELS = 4;

/** A small, contiguous piece of the sheet around the selected design. */
export function nearbyIslandSurface(
  pixels: PixelBuffer,
  columns: number,
  rows: number,
  selected: number,
) {
  const width = Math.min(NEIGHBORHOOD_SIZE, columns);
  const height = Math.min(NEIGHBORHOOD_SIZE, rows);
  const column = Math.max(0, Math.min(columns - width, (selected % columns) - HALF_NEIGHBORHOOD));
  const row = Math.max(
    0,
    Math.min(rows - height, Math.floor(selected / columns) - HALF_NEIGHBORHOOD),
  );
  const size = ANIMAL_CROSSING_SIZE;
  const crop: PixelBuffer = {
    width: width * size,
    height: height * size,
    data: new Uint8ClampedArray(width * height * size * size * CHANNELS),
  };
  for (let y = 0; y < crop.height; y++) {
    const from = ((row * size + y) * pixels.width + column * size) * CHANNELS;
    crop.data.set(
      pixels.data.subarray(from, from + crop.width * CHANNELS),
      y * crop.width * CHANNELS,
    );
  }
  return { pixels: crop, columns: width, rows: height };
}
