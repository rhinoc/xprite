import fs from "node:fs";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
const [refPath, candidatePath, prefix, x, y, width, height] = process.argv.slice(2);
if (!height) throw Error("reference candidate prefix GUI-x y width height");
const a = PNG.sync.read(fs.readFileSync(refPath)),
  b = PNG.sync.read(fs.readFileSync(candidatePath));
if (a.width !== b.width || a.height !== b.height) throw Error("Dimensions differ");
const sx = 1405 / 960,
  sy = 768 / 525,
  left = Math.floor(Number(x) * sx),
  top = Math.floor(Number(y) * sy);
const regions = [
  { id: "whole-window", x: 0, y: 0, width: a.width, height: a.height },
  {
    id: "dialog",
    x: left,
    y: top,
    width: Math.ceil((Number(x) + Number(width)) * sx) - left,
    height: Math.ceil((Number(y) + Number(height)) * sy) - top,
  },
];
const crop = (p, r) => {
  const q = new PNG({ width: r.width, height: r.height });
  for (let yy = 0; yy < r.height; yy++)
    p.data.copy(
      q.data,
      yy * r.width * 4,
      ((yy + r.y) * p.width + r.x) * 4,
      ((yy + r.y) * p.width + r.x + r.width) * 4,
    );
  return q;
};
const results = [];
for (const r of regions) {
  const aa = crop(a, r),
    bb = crop(b, r),
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
    fs.writeFileSync(`${prefix}-${r.id}-${kind}.png`, PNG.sync.write(p));
}
fs.writeFileSync(prefix + ".json", JSON.stringify(results, null, 2));
console.log(results);
