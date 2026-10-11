import { UINT8_MAX, type PixelBuffer } from "$/base";

export interface BeadColor {
  readonly code: string;
  readonly name: string;
  readonly rgb: readonly [number, number, number];
}
export interface BeadGrid {
  width: number;
  height: number;
  colors: readonly BeadColor[];
  cells: Int32Array;
  usage: readonly { color: BeadColor; quantity: number }[];
  total: number;
}
export const EMPTY_BEAD_CELL = -1;
const RGBA_CHANNELS = 4;
const RGB_BASE = 256;

/** One input pixel is one bead. Alpha zero is empty; input buffers are never written. */
export function mapBeadGrid(pixels: Readonly<PixelBuffer>, colors: readonly BeadColor[]): BeadGrid {
  if (!colors.length) throw new Error("Select a bead palette.");
  if (
    !Number.isSafeInteger(pixels.width) ||
    pixels.width < 1 ||
    !Number.isSafeInteger(pixels.height) ||
    pixels.height < 1 ||
    pixels.data.length !== pixels.width * pixels.height * RGBA_CHANNELS
  )
    throw new Error("Invalid bead source image.");
  const cells = new Int32Array(pixels.width * pixels.height).fill(EMPTY_BEAD_CELL);
  const counts = new Uint32Array(colors.length);
  const cache = new Map<number, number>();
  let total = 0;
  for (let index = 0; index < cells.length; index++) {
    const offset = index * RGBA_CHANNELS;
    if (pixels.data[offset + 3] === 0) continue;
    const r = pixels.data[offset],
      g = pixels.data[offset + 1],
      b = pixels.data[offset + 2];
    const key = (r * RGB_BASE + g) * RGB_BASE + b;
    let nearest = cache.get(key);
    if (nearest === undefined) {
      nearest = 0;
      let distance = Infinity;
      for (let candidate = 0; candidate < colors.length; candidate++) {
        const rgb = colors[candidate].rgb;
        const delta = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
        if (delta < distance) {
          distance = delta;
          nearest = candidate;
        }
      }
      cache.set(key, nearest);
    }
    cells[index] = nearest;
    counts[nearest]++;
    total++;
  }
  return {
    width: pixels.width,
    height: pixels.height,
    colors,
    cells,
    total,
    usage: colors.flatMap((color, index) =>
      counts[index] ? [{ color, quantity: counts[index] }] : [],
    ),
  };
}

export interface BeadBoard {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One color sample per bead for an inexpensive full-pattern overview. */
export function beadGridPixels(grid: BeadGrid): PixelBuffer {
  const data = new Uint8ClampedArray(grid.width * grid.height * RGBA_CHANNELS);
  for (let index = 0; index < grid.cells.length; index++) {
    const cell = grid.cells[index];
    if (cell === EMPTY_BEAD_CELL) continue;
    const offset = index * RGBA_CHANNELS;
    data.set(grid.colors[cell].rgb, offset);
    data[offset + 3] = UINT8_MAX;
  }
  return { width: grid.width, height: grid.height, data };
}

export function beadBoards(
  grid: Pick<BeadGrid, "width" | "height">,
  boardSize: number,
): BeadBoard[] {
  if (!Number.isSafeInteger(boardSize) || boardSize < 1)
    throw new Error("Invalid bead board size.");
  const boards: BeadBoard[] = [];
  for (let y = 0, row = 0; y < grid.height; y += boardSize, row++)
    for (let x = 0, column = 0; x < grid.width; x += boardSize, column++)
      boards.push({
        column,
        row,
        x,
        y,
        width: Math.min(boardSize, grid.width - x),
        height: Math.min(boardSize, grid.height - y),
      });
  return boards;
}
