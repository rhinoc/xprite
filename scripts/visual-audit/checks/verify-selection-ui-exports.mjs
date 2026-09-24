import assert from "node:assert/strict";
import fs from "node:fs";

import { PNG } from "pngjs";

const names = ["original", "cancel", "move", "undo", "redo", "right-selection"];
const images = Object.fromEntries(
  names.map((name) => [name, PNG.sync.read(fs.readFileSync(`.tmp/qa-selection-${name}.png`))]),
);
for (const value of Object.values(images))
  assert.deepEqual([value.width, value.height], [509, 396]);
assert.deepEqual(
  images.cancel.data,
  images.original.data,
  "Undo cancels pending transform and restores exact original pixels",
);
assert.notDeepEqual(
  images.move.data,
  images.original.data,
  "Moving marquee interior changes pixels",
);
assert.deepEqual(images.undo.data, images.original.data, "Undo restores exact original pixels");
assert.deepEqual(images.redo.data, images.move.data, "Redo restores exact moved pixels");
assert.deepEqual(
  images["right-selection"].data,
  images.move.data,
  "Right drag changes mask without moving pixels",
);
console.log(
  "Five real exported PNG pixel checks passed: transform cancel/move/undo/redo/right-selection.",
);
