import assert from "node:assert/strict";
import fs from "node:fs";
import { inflateSync } from "node:zlib";

import { build } from "esbuild";
import { PNG } from "pngjs";
const bundle = await build({
  entryPoints: ["packages/editor-core/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);
const input = process.env.ASEPRITE_ORACLE_INPUT,
  oracle = process.env.ASEPRITE_ORACLE_OUTPUT || ".tmp/aseprite-frame-oracle/output";
const specs = [["xprite", "apps/editor/assets/examples/xprite/xprite.ase"]];
const results = [];
for (const [id, originalPath] of specs) {
  const path = input ? `${input}/${id}.aseprite` : originalPath;
  const sprite = await api.decodeAseprite(new Uint8Array(fs.readFileSync(path)), {
    inflate: (bytes) => new Uint8Array(inflateSync(bytes)),
    fileName: path,
  });
  const project = api.projectFromAseprite(sprite),
    editor = new api.RasterEditor();
  editor.loadTimeline(
    project.timeline,
    project.image.width,
    project.image.height,
    path,
    project.palette,
  );
  const frames = [];
  for (let frame = 0; frame < sprite.frames.length; frame++) {
    editor.selectFrame(frame);
    const actual = editor.composite(),
      reference = PNG.sync.read(
        fs.readFileSync(`${oracle}/${id}-${String(frame + 1).padStart(3, "0")}.png`),
      );
    assert.deepEqual([actual.width, actual.height], [reference.width, reference.height]);
    let different = 0,
      visibleDifferent = 0;
    for (let i = 0; i < actual.data.length; i += 4) {
      if (!actual.data.subarray(i, i + 4).every((v, c) => v === reference.data[i + c])) {
        different++;
        if (actual.data[i + 3] || reference.data[i + 3]) visibleDifferent++;
      }
    }
    frames.push({ frame, differentPixels: different, visibleDifferentPixels: visibleDifferent });
  }
  results.push({ id, path, frames, layers: sprite.layers.length });
}
fs.writeFileSync(`${oracle}/frame-comparison.json`, JSON.stringify({ results }, null, 2));
for (const result of results) {
  console.log(
    `${result.id}: ${result.frames.length} frames, ${result.layers} layers, ${result.frames.reduce((n, f) => n + f.differentPixels, 0)} RGBA differences, ${result.frames.reduce((n, f) => n + f.visibleDifferentPixels, 0)} visible differences`,
  );
  assert.equal(
    result.frames.reduce((n, f) => n + f.differentPixels, 0),
    0,
    "Every RGBA pixel must match Aseprite",
  );
}
