import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const { outputFiles } = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/index.ts";export * from "./packages/editor-core/src/tilemap/model.ts";export * from "./packages/editor-core/src/image-editing/transform.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  write: false,
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const binary = process.env.ASEPRITE_BINARY ?? resolveAsepriteExecutable();
const dir = mkdtempSync(join(tmpdir(), "aseprite-tile-flip-"));
try {
  writeFileSync(
    join(dir, "flip.lua"),
    `local s=app.open(app.params.input)\napp.command.Flip{target='canvas',orientation=app.params.orientation}\ns:saveAs(app.params.output)\n`,
  );
  for (const [tw, th] of [
    [2, 3],
    [3, 2],
    [2, 2],
  ])
    for (const orientation of ["horizontal", "vertical"]) {
      const set = {
        id: 0,
        name: "flags",
        flags: 6,
        baseIndex: 1,
        tileWidth: tw,
        tileHeight: th,
        tileCount: 2,
        pixels: new Uint8Array(2 * tw * th * 4),
      };
      for (let i = 0; i < tw * th; i++) set.pixels.set([i * 20, 100, 200, 255], (tw * th + i) * 4);
      const map = {
        width: 4,
        height: 2,
        tiles: Uint32Array.from({ length: 8 }, (_, i) => (1 | (i << 29)) >>> 0),
      };
      const t = m.refreshTilemapProjections({
        colorDepth: 32,
        tilesets: [set],
        layers: [
          {
            id: "map",
            name: "Map",
            kind: "tilemap",
            tilesetId: 0,
            flags: 3,
            visible: true,
            locked: false,
            opacity: 255,
          },
        ],
        frames: [
          {
            duration: 100,
            cels: [
              {
                x: -3,
                y: 5,
                opacity: 255,
                zIndex: 0,
                tilemap: map,
                pixels: {
                  width: 4 * tw,
                  height: 2 * th,
                  data: new Uint8ClampedArray(4 * tw * 2 * th * 4),
                },
              },
            ],
          },
        ],
        activeFrame: 0,
        activeLayer: 0,
      });
      const e = new m.RasterEditor();
      e.loadTimeline(t, 37, 29, "Aseprite flip");
      const source = m.asepriteFromProject(m.projectFromDocument(e.getSnapshot().document));
      writeFileSync(join(dir, "in.aseprite"), m.encodeAsepriteSync(source));
      execFileSync(binary, [
        "--batch",
        "--script-param",
        `input=${join(dir, "in.aseprite")}`,
        "--script-param",
        `output=${join(dir, "out.aseprite")}`,
        "--script-param",
        `orientation=${orientation}`,
        "--script",
        join(dir, "flip.lua"),
      ]);
      const aseprite = m.projectFromAseprite(
        m.decodeAsepriteSync(readFileSync(join(dir, "out.aseprite"))),
      ).timeline.frames[0].cels[0];
      e.flipCanvas(orientation);
      const actual = e.getSnapshot().document.timeline.frames[0].cels[0];
      assert.deepEqual(
        actual.tilemap,
        aseprite.tilemap,
        `${tw}x${th} ${orientation}: packed words`,
      );
      assert.deepEqual(
        [actual.x, actual.y],
        [aseprite.x, aseprite.y],
        `${tw}x${th} ${orientation}: cel offset`,
      );
      assert.deepEqual(
        actual.pixels,
        aseprite.pixels,
        `${tw}x${th} ${orientation}: projected pixels`,
      );
      console.log(
        `${tw}x${th} ${orientation}: Aseprite words, flags, position (${aseprite.x},${aseprite.y}), pixels match.`,
      );
    }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
