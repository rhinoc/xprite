import assert from "node:assert/strict";
import fs from "node:fs";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// Independent screen-space oracle for the 41x31 transparent fixture at 100%.
// Checks screenshot pixels, including the separate document-frame canvas.

const screen = PNG.sync.read(fs.readFileSync(".tmp/alignment-app.png"));
const report = JSON.parse(fs.readFileSync(".tmp/alignment-browser.json"));
const output = ".tmp/alignment-pixel-check";
fs.mkdirSync(output, { recursive: true });
const r = report.final;
assert.equal(screen.width, r.viewport[0]);
assert.equal(screen.height, r.viewport[1]);
assert.equal(r.dpr, 1);
const expected = new PNG({ width: 86, height: 66 }),
  actual = new PNG({ width: 86, height: 66 });
for (let y = 0; y < 66; y++)
  for (let x = 0; x < 86; x++) {
    const i = (y * 86 + x) * 4;
    let color = [0, 0, 0, 255];
    if (x >= 2 && x < 84 && y >= 2 && y < 64) {
      const px = Math.floor((x - 2) / 2),
        py = Math.floor((y - 2) / 2);
      const gray = (Math.floor(px / 16) + Math.floor(py / 16)) % 2 ? 192 : 128;
      color = px >= 18 && px < 23 && py >= 13 && py < 18 ? [0, 0, 0, 255] : [gray, gray, gray, 255];
    }
    expected.data.set(color, i);
    const q = ((r.y - 2 + y) * screen.width + r.x - 2 + x) * 4;
    actual.data.set(screen.data.subarray(q, q + 4), i);
  }
fs.writeFileSync(`${output}/expected.png`, PNG.sync.write(expected));
fs.writeFileSync(`${output}/crop.png`, PNG.sync.write(actual));
const diff = new PNG({ width: 86, height: 66 });
const differentPixels = pixelmatch(expected.data, actual.data, diff.data, 86, 66, {
  threshold: 0,
  includeAA: true,
});
fs.writeFileSync(`${output}/diff.png`, PNG.sync.write(diff));
const result = {
  passed: differentPixels === 0,
  differentPixels,
  totalPixels: 86 * 66,
  threshold: 0,
  candidate: "Unmodified DPR1 browser screenshot, integer crop only",
  scope:
    "Fixture checker, sprite marker, and all four outline edges; not a whole-window Aseprite parity claim",
};
fs.writeFileSync(`${output}/result.json`, JSON.stringify(result, null, 2));
console.log(result);
assert.equal(differentPixels, 0);
