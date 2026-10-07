import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { PNG } from "pngjs";

const TILE_SIZE = 16;
const SHEET_COLUMNS = 12;
const MAP_COLUMNS = 12;
const MAP_ROWS = 10;
const CHANNELS = 4;
const OPAQUE = 255;
const GRASS = 1;
const ROAD = 43;
const assetRoot = new URL("../../../apps/growth/public/tools/animal-crossing/", import.meta.url);
const sourceBytes = await readFile(new URL("kenney-tiny-town/tileset.png", assetRoot));
const source = PNG.sync.read(sourceBytes);
const layers = [Array.from({ length: MAP_ROWS }, () => Array(MAP_COLUMNS).fill(GRASS))];
const decorations = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLUMNS).fill(null));
layers.push(decorations);
const stamp = (grid, x, y, tiles) =>
  tiles.forEach((row, dy) =>
    row.forEach((tile, dx) => {
      grid[y + dy][x + dx] = tile;
    }),
  );
for (let x = 0; x < MAP_COLUMNS; x++) layers[0][5][x] = ROAD;
for (let y = 0; y < MAP_ROWS; y++) layers[0][y][5] = ROAD;
stamp(layers[0], 1, 7, [
  [12, 13, 14],
  [36, 37, 38],
]);
// Original Kenney tiles, placed on a new map without recoloring or rescaling.
stamp(decorations, 1, 1, [
  [48, 49, 50],
  [60, 63, 62],
  [72, 84, 75],
  [72, 86, 75],
]);
stamp(decorations, 7, 1, [
  [52, 53, 54],
  [64, 65, 66],
  [76, 88, 79],
  [76, 90, 79],
]);
stamp(decorations, 0, 6, [
  [44, 45, 45, 45, 46],
  [56, null, null, null, 58],
  [56, null, null, null, 58],
  [68, 69, null, 69, 70],
]);
stamp(decorations, 8, 7, [
  [6, 7, 8],
  [18, 19, 20],
  [30, 31, 32],
]);
for (const [x, y] of [
  [0, 0],
  [11, 0],
  [0, 3],
  [11, 3],
  [6, 7],
])
  stamp(decorations, x, y, [[4], [16]]);
for (const [x, y, tile] of [
  [2, 0, 2],
  [8, 0, 2],
  [6, 4, 83],
  [10, 5, 83],
  [2, 7, 131],
  [3, 8, 94],
  [7, 7, 2],
  [7, 9, 29],
  [11, 8, 5],
  [4, 2, 17],
  [10, 1, 28],
])
  decorations[y][x] = tile;
const map = new PNG({ width: MAP_COLUMNS * TILE_SIZE, height: MAP_ROWS * TILE_SIZE });
for (const grid of layers)
  for (let y = 0; y < MAP_ROWS; y++)
    for (let x = 0; x < MAP_COLUMNS; x++) {
      const tile = grid[y][x];
      if (tile === null) continue;
      const sx = (tile % SHEET_COLUMNS) * TILE_SIZE,
        sy = Math.floor(tile / SHEET_COLUMNS) * TILE_SIZE;
      for (let py = 0; py < TILE_SIZE; py++)
        for (let px = 0; px < TILE_SIZE; px++) {
          const from = ((sy + py) * source.width + sx + px) * CHANNELS;
          const to = ((y * TILE_SIZE + py) * map.width + x * TILE_SIZE + px) * CHANNELS;
          const alpha = source.data[from + CHANNELS - 1];
          if (!alpha) continue;
          if (alpha !== OPAQUE)
            throw new Error("The source contains unexpected partially transparent tiles.");
          map.data.set(source.data.subarray(from, from + CHANNELS), to);
        }
    }
await writeFile(new URL("kenney-village.png", assetRoot), PNG.sync.write(map));
await writeFile(
  new URL("kenney-tiny-town/map.json", assetRoot),
  JSON.stringify(
    {
      author: "Kenney",
      asset: "Tiny Town 1.1",
      license: "CC0-1.0",
      source: "https://kenney.nl/assets/tiny-town",
      sourceDownload:
        "https://kenney.nl/media/pages/assets/tiny-town/a415fbeb49-1735736916/kenney_tiny-town.zip",
      sourceTilesetSha256: createHash("sha256").update(sourceBytes).digest("hex"),
      tileSize: TILE_SIZE,
      columns: MAP_COLUMNS,
      rows: MAP_ROWS,
      layers,
      modifications:
        "New village map assembled from unmodified original tiles; no recoloring or rescaling. Each exported 32x32 design contains a 2x2 block of original 16x16 tiles.",
    },
    null,
    2,
  ) + "\n",
);
console.log(`Composed Kenney Tiny Town village: ${map.width} × ${map.height}, 30 design cells.`);
