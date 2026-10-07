import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  ANIMAL_CROSSING_SIZE,
  animalCrossingGrid,
  type AnimalCrossingSettings,
} from "@xprite/editor-core/import-export";

const CHANNELS = 4;
const ALPHA = 3;
const ALPHA_CUTOFF = 128;
const OPAQUE = 255;
export function sourceIslandSurface(source: PixelBuffer, settings: AnimalCrossingSettings) {
  const { columns, rows, cells } = animalCrossingGrid(source, settings);
  const size = ANIMAL_CROSSING_SIZE;
  const pixels: PixelBuffer = {
    width: columns * size,
    height: rows * size,
    data: new Uint8ClampedArray(columns * rows * size * size * CHANNELS),
  };
  const tiles = cells.map((cell, index) => {
    const tile: PixelBuffer = {
      width: size,
      height: size,
      data: new Uint8ClampedArray(size * size * CHANNELS),
    };
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const sx = cell.x + Math.floor((x * settings.cellWidth) / size);
        const sy = cell.y + Math.floor((y * settings.cellHeight) / size);
        const from = (sy * source.width + sx) * CHANNELS;
        if (sx >= source.width || sy >= source.height || source.data[from + ALPHA] < ALPHA_CUTOFF)
          continue;
        const to = (y * size + x) * CHANNELS;
        tile.data.set(source.data.subarray(from, from + CHANNELS), to);
        tile.data[to + ALPHA] = OPAQUE;
        const composite =
          ((Math.floor(index / columns) * size + y) * pixels.width + (index % columns) * size + x) *
          CHANNELS;
        pixels.data.set(tile.data.subarray(to, to + CHANNELS), composite);
      }
    return tile;
  });
  return { pixels, tiles };
}
