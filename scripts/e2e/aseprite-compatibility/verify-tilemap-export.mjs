import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { build } from "esbuild";
import { PNG } from "pngjs";

import { resolveAsepriteExecutable, resolveAsepriteSource } from "../../base/reference-paths.mjs";
const output = fs.mkdtempSync(path.join(os.tmpdir(), "tilemap-export-"));
const binary = process.env.ASEPRITE_BINARY ?? resolveAsepriteExecutable();
const load = async (path) => {
  const { outputFiles } = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
  );
};
const codec = await load("packages/editor-core/src/import-export/aseprite/index.ts"),
  proj = await load("packages/editor-core/src/import-export/aseprite/project.ts"),
  sheet = await load("packages/editor-core/src/import-export/image/export-sheet.ts");
for (const file of ["2x2tilemap2x2tile", "2x3tilemap-indexed", "3x2tilemap-grayscale"]) {
  const source = path.join(resolveAsepriteSource(), "tests/sprites", `${file}.aseprite`);
  const sprite = await codec.decodeAseprite(new Uint8Array(fs.readFileSync(source)), {
    inflate: (bytes) => new Uint8Array(inflateSync(bytes)),
  });
  const project = proj.projectFromAseprite(sprite);
  const doc = {
    name: file + ".aseprite",
    width: project.image.width,
    height: project.image.height,
    palette: project.palette,
    timeline: project.timeline,
    selection: null,
    layer: { name: "x", pixels: project.image, x: 0, y: 0, visible: true, locked: false },
  };
  const o = {
    ...sheet.defaultSpriteSheetOptions(doc),
    source: "tilesets",
    layout: "horizontal",
    dataFormat: "array",
    filenameFormat: "{frame}",
  };
  const result = sheet.renderSpriteSheet(doc, o);
  const run = spawnSync(
    binary,
    [
      "--batch",
      "--export-tileset",
      "--sheet-type",
      "horizontal",
      "--format",
      "json-array",
      "--filename-format",
      "{frame}",
      source,
      "--sheet",
      `${output}/${file}.png`,
      "--data",
      `${output}/${file}.json`,
    ],
    { encoding: "utf8" },
  );
  if (run.status) throw Error(run.stderr);
  const aseprite = PNG.sync.read(fs.readFileSync(`${output}/${file}.png`)),
    data = JSON.parse(fs.readFileSync(`${output}/${file}.json`));
  assert.equal(aseprite.width, result.pixels.width);
  assert.equal(aseprite.height, result.pixels.height);
  assert.deepEqual(Buffer.from(result.pixels.data), aseprite.data);
  // Aseprite emits repeated frame-0 names for individual tiles; our exported names
  // are unique so hash-format JSON retains every tile. Geometry follows Aseprite.
  assert.deepEqual(
    result.data.frames.map(({ filename: _filename, ...frame }) => frame),
    data.frames.map(({ filename: _filename, ...frame }) => frame),
  );
  console.log(`${file}: Aseprite tileset PNG pixels and JSON frame geometry match.`);
}
fs.rmSync(output, { recursive: true, force: true });
