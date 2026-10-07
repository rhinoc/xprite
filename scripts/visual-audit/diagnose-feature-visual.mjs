import fs from "node:fs";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import {
  assertSamePngColorSpace,
  cropPngBytes,
  preservePngColorSpace,
} from "../base/screenshot.mjs";

const [refPath, candidatePath, prefix, x, y, width, height] = process.argv.slice(2);
if (!height) throw Error("reference candidate prefix PNG-pixel-x PNG-pixel-y width height");
const referenceBytes = fs.readFileSync(refPath),
  candidateBytes = fs.readFileSync(candidatePath);
assertSamePngColorSpace(referenceBytes, candidateBytes);
const a = PNG.sync.read(referenceBytes),
  b = PNG.sync.read(candidateBytes);
if (a.width !== b.width || a.height !== b.height) throw Error("Dimensions differ");
const rectangle = { x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
const regions = [
  { id: "whole-window", x: 0, y: 0, width: a.width, height: a.height },
  {
    id: "dialog",
    ...rectangle,
  },
];
const results = [];
for (const r of regions) {
  const aa = PNG.sync.read(cropPngBytes(referenceBytes, r)),
    bb = PNG.sync.read(cropPngBytes(candidateBytes, r)),
    diff = new PNG({ width: r.width, height: r.height });
  const count = pixelmatch(aa.data, bb.data, diff.data, r.width, r.height, {
    threshold: 0.1,
    includeAA: true,
  });
  results.push({ ...r, similarity: 100 * (1 - count / (r.width * r.height)), count });
  for (const [kind, p] of [
    ["reference", aa],
    ["candidate", bb],
    ["diff", diff],
  ])
    fs.writeFileSync(
      `${prefix}-${r.id}-${kind}.png`,
      preservePngColorSpace(referenceBytes, PNG.sync.write(p)),
    );
}
fs.writeFileSync(prefix + ".json", JSON.stringify(results, null, 2));
console.log(results);
