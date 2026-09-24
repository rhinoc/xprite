import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const binary = process.env.ASEPRITE_BINARY ?? resolveAsepriteExecutable();
const output = fs.mkdtempSync(path.join(os.tmpdir(), "tilemap-transfer-oracle-"));
const { outputFiles } = await build({
  stdin: {
    contents: `export * from './packages/editor-core/src/import-export/aseprite/index.ts';export * from './packages/editor-core/src/import-export/aseprite/project.ts';export * from './packages/editor-core/src/timeline/operations/timeline-range.ts';export * from './packages/editor-core/src/tilemap/model.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const core = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const read = async (name) =>
  core.projectFromAseprite(
    await core.decodeAseprite(new Uint8Array(fs.readFileSync(path.join(output, name))), {
      inflate: (b) => new Uint8Array(inflateSync(b)),
    }),
  ).timeline;
try {
  for (const [name, mode] of [
    ["rgb", "RGB"],
    ["indexed", "INDEXED"],
    ["gray", "GRAY"],
  ]) {
    const script = `local s=Sprite(12,8,ColorMode.${mode})
s.gridBounds=Rectangle(0,0,2,2)
app.command.NewLayer{tilemap=true}
local src=app.activeLayer
local color=${mode === "INDEXED" ? "2" : mode === "GRAY" ? "Color{gray=128,alpha=255}" : "Color(255,0,0,255)"}
app.useTool{tool='pencil',color=color,layer=src,tilesetMode=TilesetMode.STACK,points={Point(3,3),Point(4,3)}}
local c=src:cel(1)
c.image:drawPixel(0,0,app.pixelColor.tile(1,app.pixelColor.TILE_XFLIP))
s.gridBounds=Rectangle(0,0,1,1)
app.command.NewLayer{tilemap=true}
local dst=app.activeLayer
s:saveAs('${output}/${name}-before.aseprite')
app.activeLayer=src
app.command.ConvertLayer{to='layer',ui=false}
s:saveAs('${output}/${name}-raster.aseprite')
s.gridBounds=Rectangle(c.position.x,c.position.y,1,1)
app.command.ConvertLayer{to='tilemap',ui=false}
s:saveAs('${output}/${name}-retiled.aseprite')
`;
    // Cache position before ConvertLayer removes the old cel.
    const fixed = script
      .replace(
        "local dst=app.activeLayer",
        "local dst=app.activeLayer\nlocal cx,cy=c.position.x,c.position.y",
      )
      .replace("Rectangle(c.position.x,c.position.y,1,1)", "Rectangle(cx,cy,1,1)");
    const file = path.join(output, `${name}.lua`);
    fs.writeFileSync(file, fixed);
    const run = spawnSync(binary, ["--batch", "--script", file], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const before = await read(`${name}-before.aseprite`),
      asepriteRaster = await read(`${name}-raster.aseprite`),
      asepriteRetiled = await read(`${name}-retiled.aseprite`);
    const result = core.transferTimelineRange(
        before,
        { kind: "cels", frames: [0], layers: [1] },
        0,
        1,
        true,
      ),
      raster = core.transferTimelineRange(
        before,
        { kind: "cels", frames: [0], layers: [1] },
        0,
        -1,
        true,
      );
    const a = raster.frames[0].cels[0],
      b = asepriteRaster.frames[0].cels[1];
    assert.equal(a.x, b.x);
    assert.equal(a.y, b.y);
    assert.equal(a.pixels.width, b.pixels.width);
    assert.equal(a.pixels.height, b.pixels.height);
    assert.deepEqual(a.pixels.data, b.pixels.data);
    if (a.asepriteSamples) assert.deepEqual(a.asepriteSamples.data, b.asepriteSamples.data);
    // Retiling may retain transparent border cells: compare pixel content in canvas coordinates.
    const paint = (c) => {
      const out = new Uint8Array(12 * 8 * 4);
      for (let y = 0; y < c.pixels.height; y++)
        for (let x = 0; x < c.pixels.width; x++) {
          const dx = c.x + x,
            dy = c.y + y;
          if (dx >= 0 && dy >= 0 && dx < 12 && dy < 8)
            out.set(
              c.pixels.data.subarray(
                (y * c.pixels.width + x) * 4,
                (y * c.pixels.width + x + 1) * 4,
              ),
              (dy * 12 + dx) * 4,
            );
        }
      return out;
    };
    assert.deepEqual(paint(result.frames[0].cels[2]), paint(asepriteRetiled.frames[0].cels[1]));
    assert.equal(result.layers[2].kind, "tilemap");
    console.log(
      `${name}: Aseprite create_cel_copy crop bounds/Aseprite samples and cross-size retiling pixels match.`,
    );
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
