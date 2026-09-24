import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const b = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/editor/RasterEditor.ts";export * from "./packages/editor-core/src/import-export/aseprite/project.ts";export * from "./packages/editor-core/src/import-export/aseprite/index.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const m = await import(
  "data:text/javascript;base64," + Buffer.from(b.outputFiles[0].contents).toString("base64")
);
const root = await mkdtemp(join(tmpdir(), "ase-mode-transforms-"));
const palette = {
    entries: [
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 128],
      [255, 255, 255, 0],
    ].map(([red, green, blue, alpha]) => ({ red, green, blue, alpha })),
  },
  header = {
    fileSize: 0,
    magic: 0xa5e0,
    speed: 100,
    next: 0,
    frit: 0,
    transparentIndex: 4,
    ncolors: 5,
    pixelWidth: 1,
    pixelHeight: 1,
    gridX: 0,
    gridY: 0,
    gridWidth: 16,
    gridHeight: 16,
    ignore: [0, 0, 0],
  },
  layer = {
    index: 0,
    type: "image",
    flags: 3,
    visible: true,
    editable: true,
    locked: false,
    background: false,
    collapsed: false,
    reference: false,
    continuous: false,
    name: "Layer",
    childLevel: 0,
    blendMode: 0,
    opacity: 255,
    defaultWidth: 0,
    defaultHeight: 0,
  };
const inputs = new Map();
for (const depth of [8, 16]) {
  const asepritePixels = new Uint8Array(
      depth === 8 ? [0, 1, 2, 3, 4, 0] : [0, 0, 17, 128, 255, 255, 44, 0, 83, 255, 200, 64],
    ),
    p1 = { entries: palette.entries.map((c, i) => (i === 1 ? { ...c, red: 0, green: 200 } : c)) },
    sprite = {
      width: 3,
      height: 2,
      depth,
      flags: 1,
      header,
      layers: [layer],
      palette,
      tags: [],
      chunks: [],
      format: "aseprite",
      frames: [
        {
          index: 0,
          duration: 100,
          palette,
          cels: [
            {
              layerIndex: 0,
              x: 0,
              y: 0,
              opacity: 255,
              zIndex: 0,
              type: "raw",
              rawType: 0,
              width: 3,
              height: 2,
              asepritePixels,
            },
          ],
        },
        {
          index: 1,
          duration: 100,
          palette: p1,
          cels: [
            {
              layerIndex: 0,
              x: 0,
              y: 0,
              opacity: 255,
              zIndex: 0,
              type: "linked",
              rawType: 1,
              width: 3,
              height: 2,
              linkedFrame: 0,
            },
          ],
        },
      ],
    },
    bytes = m.encodeAsepriteSync(sprite);
  inputs.set(depth, bytes);
  await writeFile(join(root, `in-${depth}.aseprite`), bytes);
}
const cases = [
  ...["nearest", "bilinear", "rotsprite"].flatMap((method) =>
    [
      [7, 5],
      [2, 1],
    ].map(([w, h]) => ({
      name: `${method}-${w}x${h}`,
      lua: `app.command.SpriteSize{ui=false,width=${w},height=${h},method='${method === "nearest" ? "nearest-neighbor" : method}'}`,
      apply: (e) => e.resizeSprite(w, h, method),
    })),
  ),
  ...[90, -90, 180].map((angle) => ({
    name: `rotate${angle}`,
    lua: `app.command.Rotate{ui=false,target='sprite',angle=${angle}}`,
    apply: (e) => e.rotateCanvas(angle),
  })),
  ...["horizontal", "vertical"].map((dir) => ({
    name: dir,
    lua: `app.command.Flip{target='sprite',orientation='${dir}'}`,
    apply: (e) => e.flipCanvas(dir),
  })),
  {
    name: "crop",
    lua: "app.command.CanvasSize{ui=false,bounds=Rectangle(1,0,2,2),trimOutside=true}",
    apply: (e) => e.resizeCanvas({ x: 1, y: 0, width: 2, height: 2 }, true),
  },
  {
    name: "expand",
    lua: "app.command.CanvasSize{ui=false,bounds=Rectangle(-1,-1,5,4),trimOutside=false}",
    apply: (e) => e.resizeCanvas({ x: -1, y: -1, width: 5, height: 4 }, false),
  },
];
cases.push(
  {
    name: "background",
    lua: "__BG__",
    apply: (e, depth) => {
      e.setSettings({ background: [255, 0, 0, 255], backgroundIndex: depth === 8 ? 1 : null });
      e.convertLayerBackground(true);
    },
  },
  {
    name: "background-expand",
    undoCount: 2,
    lua: "__BG__;app.command.CanvasSize{ui=false,bounds=Rectangle(-1,-1,5,4),trimOutside=true}",
    apply: (e, depth) => {
      e.setSettings({ background: [255, 0, 0, 255], backgroundIndex: depth === 8 ? 1 : null });
      e.convertLayerBackground(true);
      e.resizeCanvas({ x: -1, y: -1, width: 5, height: 4 }, true);
    },
  },
);
let lua = `local f=io.open('${root}/results.txt','w')\n`;
for (const depth of [8, 16])
  for (const c of cases)
    lua += `do local s=Sprite{fromFile='${root}/in-${depth}.aseprite'};${c.lua.replace("__BG__", `app.bgColor=${depth === 8 ? "Color{index=1}" : "Color{r=255,g=0,b=0,a=255}"};app.command.BackgroundFromLayer{}`)};for fi=1,#s.frames do local cel=s.layers[1]:cel(fi);local out={s.width,s.height};if cel then out[#out+1]=cel.position.x;out[#out+1]=cel.position.y;out[#out+1]=cel.image.width;out[#out+1]=cel.image.height;for y=0,cel.image.height-1 do for x=0,cel.image.width-1 do out[#out+1]=cel.image:getPixel(x,y) end end end f:write(table.concat(out,',')..'\\n') end;s:close() end\n`;
lua += "f:close()";
await writeFile(join(root, "oracle.lua"), lua);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", join(root, "oracle.lua")], {
  timeout: 30000,
  env: { ...process.env, ASEPRITE_USER_FOLDER: join(root, "profile") },
});
const expected = (await readFile(join(root, "results.txt"), "utf8"))
  .trim()
  .split("\n")
  .map((line) => line.split(",").map(Number));
let n = 0;
for (const depth of [8, 16])
  for (const c of cases) {
    const p = m.projectFromAseprite(m.decodeAsepriteSync(inputs.get(depth))),
      e = new m.RasterEditor();
    e.loadTimeline(p.timeline, 3, 2, c.name, p.palette);
    c.apply(e, depth);
    const doc = e.getSnapshot().document;
    for (const frame of doc.timeline.frames) {
      const cel = frame.cels[0],
        actual = [doc.width, doc.height];
      if (cel) {
        const raw = cel.asepriteSamples;
        actual.push(cel.x, cel.y, raw.width, raw.height);
        for (let i = 0; i < raw.width * raw.height; i++)
          actual.push(depth === 8 ? raw.data[i] : raw.data[i * 2] | (raw.data[i * 2 + 1] << 8));
      }
      assert.deepEqual(actual, expected[n++], `${depth} ${c.name} frame${n % 2}`);
    }
    assert.equal(
      doc.timeline.frames[0].cels[0]?.asepriteSamples,
      doc.timeline.frames[1].cels[0]?.asepriteSamples,
      `${depth} ${c.name} preserves linked Aseprite image`,
    );
    e.undo();
    if (c.undoCount === 2) e.undo();
    assert.deepEqual(
      [...e.getSnapshot().document.timeline.frames[0].cels[0].asepriteSamples.data],
      [...p.timeline.frames[0].cels[0].asepriteSamples.data],
    );
  }
console.log(
  `${n} aseprite8/16bit transform frames match exact samples+geometry: nearest/bilinear/RotSprite, 90/180rotation, flip,crop,expand; duplicate indices and linked images preserved; undo rawbytes exact.`,
);
