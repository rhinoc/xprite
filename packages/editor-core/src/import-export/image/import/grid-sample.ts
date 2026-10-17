import type { PixelBuffer } from "$/base/primitives";
import { MAX_RECOVERED_GRID_SIZE, pixelGridCuts } from "$/import-export/image/import/grid";
import type { PixelGridGeometry } from "$/import-export/image/import/types";

/**
 * Per-cell colour choice and output colour merging follow KennethJAllen/proper-pixel-art (MIT):
 * the dominant colour of a cell is the median of the fullest bin of two offset RGB binnings, and
 * near-duplicate output colours then collapse to the most frequent one. No quantise-first step.
 */
const CHANNELS = 4;
const BIN_SIZE = 52;
const BINS = Math.floor(255 / BIN_SIZE) + 1;
const BIN_OFFSET = Math.floor(BIN_SIZE / 2);
const MERGE_DISTANCE = 12;
const MIN_OPAQUE_SHARE = 0.5;

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const mid = values.length >> 1;
  return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}
/** RGBA of one cell, or null when it is mostly transparent. */
function dominantColor(
  image: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number, number] | null {
  const pixels: number[] = [];
  let total = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      total++;
      const o = (y * image.width + x) * CHANNELS;
      if (image.data[o + 3] > 0) pixels.push(o);
    }
  if (!total || pixels.length < MIN_OPAQUE_SHARE * total) return null;
  const channel = (list: number[], c: number) => list.map((o) => image.data[o + c]);
  const pick = (list: number[]): [number, number, number, number] => [
    median(channel(list, 0)),
    median(channel(list, 1)),
    median(channel(list, 2)),
    Math.round(channel(list, 3).reduce((a, b) => a + b, 0) / list.length),
  ];
  if (pixels.length <= 3) return pick(pixels);
  const counts = [new Uint32Array(BINS ** 3), new Uint32Array(BINS ** 3)];
  const keys = [new Int32Array(pixels.length), new Int32Array(pixels.length)];
  pixels.forEach((o, i) => {
    for (let grid = 0; grid < 2; grid++) {
      const shift = grid ? BIN_OFFSET : 0;
      const bin = (c: number) => Math.floor(Math.min(255, image.data[o + c] + shift) / BIN_SIZE);
      const key = (bin(0) * BINS + bin(1)) * BINS + bin(2);
      keys[grid][i] = key;
      counts[grid][key]++;
    }
  });
  const best = counts.map((table) => {
    let key = 0;
    for (let i = 1; i < table.length; i++) if (table[i] > table[key]) key = i;
    return key;
  });
  const grid = counts[0][best[0]] >= counts[1][best[1]] ? 0 : 1;
  return pick(pixels.filter((_, i) => keys[grid][i] === best[grid]));
}
/** Map every colour to the most frequent colour within MERGE_DISTANCE of it. */
function mergeColors(data: Uint8ClampedArray): void {
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += CHANNELS) {
    if (!data[i + 3]) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ordered = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([key]) => key);
  const reps: number[] = [];
  const mapping = new Map<number, number>();
  for (const key of ordered) {
    const r = key >> 16,
      g = (key >> 8) & 255,
      b = key & 255;
    const rep = reps.find((candidate) => {
      const dr = (candidate >> 16) - r,
        dg = ((candidate >> 8) & 255) - g,
        db = (candidate & 255) - b;
      return dr * dr + dg * dg + db * db <= MERGE_DISTANCE * MERGE_DISTANCE;
    });
    if (rep === undefined) reps.push(key);
    mapping.set(key, rep ?? key);
  }
  for (let i = 0; i < data.length; i += CHANNELS) {
    if (!data[i + 3]) continue;
    const to = mapping.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])!;
    data[i] = to >> 16;
    data[i + 1] = (to >> 8) & 255;
    data[i + 2] = to & 255;
  }
}
/** One RGBA pixel per grid cell: explicit cuts when the grid carries them, else one regular lattice. */
export function recoverGrid(image: PixelBuffer, grid: PixelGridGeometry): PixelBuffer {
  const x = grid.cutsX ?? pixelGridCuts(image.width, grid.cellWidth, grid.offsetX),
    y = grid.cutsY ?? pixelGridCuts(image.height, grid.cellHeight, grid.offsetY);
  const width = x.length - 1,
    height = y.length - 1;
  if (width > MAX_RECOVERED_GRID_SIZE || height > MAX_RECOVERED_GRID_SIZE)
    throw new RangeError("Choose larger cells to restore this image.");
  if (grid.width !== width || grid.height !== height)
    throw new RangeError("The grid no longer matches this image.");
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const color = dominantColor(image, x[column], y[row], x[column + 1], y[row + 1]);
      if (color) data.set(color, (row * width + column) * CHANNELS);
    }
  mergeColors(data);
  return { width, height, data };
}
