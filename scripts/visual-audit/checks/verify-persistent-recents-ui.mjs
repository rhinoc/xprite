import assert from "node:assert/strict";
import fs from "node:fs";

import { PNG } from "pngjs";

for (const [index, folder] of [
  [0, "b"],
  [2, "a"],
]) {
  const input = PNG.sync.read(fs.readFileSync(`/tmp/ase-persistent/${folder}/same-qa.png`));
  const output = PNG.sync.read(fs.readFileSync(`.tmp/qa-persistent-recent-${index}.png`));
  assert.deepEqual([input.width, input.height], [output.width, output.height]);
  assert.equal(
    Buffer.compare(input.data, output.data),
    0,
    `Recent ${index} must preserve its original bytes`,
  );
}
const path = ".tmp/qa-persistent-recents.json",
  report = JSON.parse(fs.readFileSync(path));
report.pixelChecksPassed = true;
report.pixelChecks = [
  "first reloaded recent retains second import RGBA",
  "second reloaded recent retains first import RGBA despite matching filenames",
];
fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
console.log("Two same-name recent files retain distinct exact RGBA after reload and reopening.");
