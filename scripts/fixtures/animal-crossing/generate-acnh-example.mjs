import { createHash } from "node:crypto";
// Reconstruct a 3x3 path from the author's ACNH slot previews, not ACNL QR data.
// Usage: node scripts/fixtures/animal-crossing/generate-acnh-example.mjs <slots.png>
import { readFile, writeFile } from "node:fs/promises";

import { PNG } from "pngjs";

const sourceBytes = await readFile(process.argv[2]);
const source = PNG.sync.read(sourceBytes);
const root = new URL("../../../apps/growth/public/tools/animal-crossing/acnh/", import.meta.url);
const SIZE = 32;
const CHANNELS = 4;
const COLORS = 15;
const columns = [71, 166, 260, 355, 450];
const rows = [114, 212, 309];
const THUMB_SIZE = 77;
const layout = [
  [0, 3],
  [0, 2],
  [0, 4],
  [0, 0],
  [2, 2],
  [0, 1],
  [1, 3],
  [1, 2],
  [1, 4],
];
const samples = layout.map(([row, column]) => {
  const data = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const sx = columns[column] + Math.floor(((x + 0.5) * THUMB_SIZE) / SIZE);
      const sy = rows[row] + Math.floor(((y + 0.5) * THUMB_SIZE) / SIZE);
      const offset = (sy * source.width + sx) * CHANNELS;
      const color = [...source.data.subarray(offset, offset + 3)];
      // The author's pink / white hatch indicates transparent pixels.
      data.push(color[0] > 185 && color[2] > 110 ? null : color);
    }
  return data;
});
const opaque = samples.flat().filter(Boolean);
const distance = (a, b) => a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
const palette = [opaque[0]];
while (palette.length < COLORS) {
  let best = opaque[0],
    maximum = -1;
  for (const color of opaque) {
    const error = Math.min(...palette.map((entry) => distance(color, entry)));
    if (error > maximum) {
      maximum = error;
      best = color;
    }
  }
  palette.push(best);
}
const closest = (color) =>
  palette
    .map((entry) => distance(color, entry))
    .reduce((best, error, i, errors) => (error < errors[best] ? i : best), 0);
for (let iteration = 0; iteration < 24; iteration++) {
  const sums = palette.map(() => [0, 0, 0, 0]);
  for (const color of opaque) {
    const sum = sums[closest(color)];
    color.forEach((value, i) => (sum[i] += value));
    sum[3]++;
  }
  sums.forEach((sum, i) => {
    if (sum[3]) palette[i] = sum.slice(0, 3).map((value) => Math.round(value / sum[3]));
  });
}
const map = new PNG({ width: SIZE * 3, height: SIZE * 3 });
let squaredError = 0,
  transparentPixels = 0;
samples.forEach((tile, index) =>
  tile.forEach((color, pixel) => {
    const x = (index % 3) * SIZE + (pixel % SIZE);
    const y = Math.floor(index / 3) * SIZE + Math.floor(pixel / SIZE);
    const offset = (y * map.width + x) * CHANNELS;
    if (!color) {
      transparentPixels++;
      return;
    }
    const reconstructed = palette[closest(color)];
    squaredError += distance(color, reconstructed);
    map.data.set([...reconstructed, 255], offset);
  }),
);
await writeFile(new URL("winding-cobblestone.png", root), PNG.sync.write(map));
await writeFile(
  new URL("provenance.json", root),
  JSON.stringify(
    {
      game: "Animal Crossing: New Horizons (Nintendo Switch)",
      author: "Amy / A Forest Life",
      creatorId: "MA-0515-5045-1390",
      source:
        "https://aforestlife.com/2021/11/11/winding-cobblestone-path-from-bywater-shire-themed-island/",
      image:
        "https://aforestlife.com/wp-content/uploads/2021/11/acnh-winding-cobblestone-bywater-path-pieces.png",
      creditPolicy: "https://aforestlife.com/designs/",
      sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
      sourceDimensions: [source.width, source.height],
      layout,
      columns,
      rows,
      thumbnailSize: THUMB_SIZE,
      method:
        "Sample thumbnail cell centers to 32x32; pink hatch becomes transparent; shared 15-color RGB k-means palette. Rearrange nine published pieces into a 3x3 path.",
      limitation:
        "Reconstruction from scaled previews, not original game data. Thumbnail resampling and palette reduction cannot establish exact original pixel equality.",
      transparentPixels,
      palette,
      sampledOpaqueRgbRmse: Math.sqrt(squaredError / (opaque.length * 3)),
    },
    null,
    2,
  ) + "\n",
);

// Independently generated seasonal ground approximations, not Nintendo texture rips.
const seasons = { green: [92, 148, 70], spring: [149, 155, 73], autumn: [174, 132, 65] };
for (const [season, base] of Object.entries(seasons)) {
  const grass = new PNG({ width: 128, height: 128 });
  for (let y = 0; y < grass.height; y++)
    for (let x = 0; x < grass.width; x++) {
      const noise = (((x * 17 + y * 31 + x * y * 7) % 13) - 6) * 0.45;
      const tx = (x + Math.floor(y / 16) * 5) % 16,
        ty = y % 16;
      const triangle = ty >= 4 && ty <= 11 && Math.abs(tx - 8) < (ty - 3) * 0.6;
      const spot = (x * 43 + y * 97) % 997 < 3;
      const delta = triangle ? -9 : spot ? 21 : 0;
      const offset = (y * grass.width + x) * CHANNELS;
      grass.data.set([...base.map((value) => Math.round(value + noise + delta)), 255], offset);
    }
  await writeFile(new URL(`grass-${season}.png`, root), PNG.sync.write(grass));
}
console.log({
  transparentPixels,
  opaquePixels: opaque.length,
  sampledOpaqueRgbRmse: Math.sqrt(squaredError / (opaque.length * 3)),
});
