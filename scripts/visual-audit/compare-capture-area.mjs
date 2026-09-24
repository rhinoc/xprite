// Diagnostic shared-area comparison; final certification additionally needs capture provenance.
import fs from "node:fs";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
const [reference, candidate, prefix, ...coords] = process.argv.slice(2),
  [x, y, width, height] = coords.map(Number);
if (
  !reference ||
  !candidate ||
  !prefix ||
  coords.length !== 4 ||
  ![x, y, width, height].every(Number.isInteger) ||
  x < 0 ||
  y < 0 ||
  width <= 0 ||
  height <= 0
)
  throw Error(
    "Usage: node scripts/visual-audit/compare-capture-area.mjs reference candidate prefix x y width height",
  );
const crop = (path) => {
  const im = PNG.sync.read(fs.readFileSync(path));
  if (x + width > im.width || y + height > im.height) throw Error("Area outside capture");
  const out = new PNG({ width, height });
  for (let row = 0; row < height; row++)
    im.data.copy(
      out.data,
      row * width * 4,
      ((y + row) * im.width + x) * 4,
      ((y + row) * im.width + x + width) * 4,
    );
  return out;
};
const a = crop(reference),
  b = crop(candidate),
  diff = new PNG({ width, height });
const differentPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
  threshold: 0.1,
  includeAA: true,
});
for (const [name, value] of [
  ["reference-crop", a],
  ["candidate-crop", b],
  ["crop-diff", diff],
])
  fs.writeFileSync(`${prefix}-${name}.png`, PNG.sync.write(value));
const report = {
  reference,
  candidate,
  area: { x, y, width, height },
  threshold: 0.1,
  includeAA: true,
  differentPixels,
  similarityPercent: 100 * (1 - differentPixels / (width * height)),
  qualification: "Diagnostic shared crop only; not provenance certification.",
};
fs.writeFileSync(`${prefix}-area.json`, JSON.stringify(report, null, 2));
console.log(report);
