// Diagnostic shared-area comparison; final certification additionally needs capture provenance.
import fs from "node:fs";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import {
  assertSamePngColorSpace,
  cropPngBytes,
  preservePngColorSpace,
} from "../base/screenshot.mjs";

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
const referenceBytes = fs.readFileSync(reference),
  candidateBytes = fs.readFileSync(candidate);
assertSamePngColorSpace(referenceBytes, candidateBytes);
const rectangle = { x, y, width, height };
const a = PNG.sync.read(cropPngBytes(referenceBytes, rectangle)),
  b = PNG.sync.read(cropPngBytes(candidateBytes, rectangle)),
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
  fs.writeFileSync(
    `${prefix}-${name}.png`,
    preservePngColorSpace(referenceBytes, PNG.sync.write(value)),
  );
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
