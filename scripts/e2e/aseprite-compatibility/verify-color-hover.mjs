import assert from "node:assert/strict";

import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["apps/editor/src/managers/colors/color-hover.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { asepriteColorHoverSample: sample, asepriteColorHoverDescription: describe } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const color = [30, 60, 90, 128];
assert.deepEqual(sample("main", color, 0, 0.5, 0.5, 0, 0, 136, 126), [255, 255, 255, 128]);
assert.deepEqual(sample("main", color, 0, 0.5, 0.5, 135, 0, 136, 126), [255, 0, 0, 128]);
assert.deepEqual(sample("main", color, 0, 0.5, 0.5, 135, 125, 136, 126), [0, 0, 0, 128]);
assert.deepEqual(sample("hue", color, 0, 1, 1, 45, 0, 136, 16), [0, 255, 0, 128]);
assert.deepEqual(sample("alpha", color, 0, 0.5, 0.5, 0, 0, 136, 16), [30, 60, 90, 0]);
assert.deepEqual(sample("alpha", color, 0, 0.5, 0.5, 135, 0, 136, 16), [30, 60, 90, 255]);
assert.equal(
  describe("main", [255, 0, 0, 128], 0, 0.5, 0.5, 135, 0, 136, 126),
  "HSV 0° 100% 100% (RGB 255 0 0)",
);
assert.equal(
  describe("hue", [0, 255, 0, 128], 0, 1, 1, 45, 0, 136, 16),
  "HSV 120° 100% 100% (RGB 0 255 0)",
);
assert.equal(describe("alpha", color, 0, 0.5, 0.5, 45, 0, 136, 16), undefined);
assert.deepEqual(color, [30, 60, 90, 128]);
console.log(
  "Aseprite color-selector hover sampling passes main, hue, alpha endpoints and preserves the selected color.",
);
