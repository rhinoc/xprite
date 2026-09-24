import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const { outputFiles } = await build({
  stdin: {
    contents: `export * from './packages/editor-core/src/image-editing/size.ts';export * from './packages/editor-core/src/tilemap/model.ts';`,
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
const root = process.cwd() + "/.tmp/tilemap-transforms-v2";
fs.mkdirSync(root, { recursive: true });
const cases = [];
for (const [tw, th] of [
  [2, 3],
  [3, 2],
  [2, 2],
])
  for (const op of [
    "rotate90",
    "rotate-90",
    "rotate180",
    "resize",
    "resize-bilinear",
    "resize-rotsprite",
    "crop",
  ])
    cases.push({ tw, th, op });
fs.writeFileSync(
  root + "/oracle.lua",
  cases
    .map(
      ({ tw, th, op }, i) => `do
local s=Sprite(13,11,ColorMode.RGB);s.gridBounds=Rectangle(0,0,${tw},${th});app.command.NewLayer{tilemap=true};local l=app.layer
app.useTool{tool='pencil',color=Color{r=200,g=40,b=10,a=255},layer=l,tilesetMode=TilesetMode.STACK,points={Point(0,0)}}
local im=Image(3,2,ColorMode.TILEMAP);local words={1,2147483649,0,1073741825,536870913,1};for y=0,1 do for x=0,2 do im:drawPixel(x,y,words[y*3+x+1]) end end
s:newCel(l,1,im,Point(-1,1))
${op.startsWith("resize") ? `app.command.SpriteSize{ui=false,width=20,height=7,method='${op === "resize" ? "nearest-neighbor" : op.slice(7)}'}` : op === "crop" ? "app.command.CanvasSize{ui=false,left=-1,top=-2,right=-6,bottom=-3,trimOutside=true}" : `app.command.Rotate{ui=false,angle=${op.slice(6)}}`}
local f=io.open('${root}/${i}.txt','w');local c=l:cel(1);f:write(s.width..','..s.height..','..l.tileset.grid.tileSize.width..','..l.tileset.grid.tileSize.height..',');if c then f:write(c.position.x..','..c.position.y..','..c.image.width..','..c.image.height..',');for y=0,c.image.height-1 do for x=0,c.image.width-1 do f:write(c.image:getPixel(x,y)..',') end end end;for n=0,#l.tileset-1 do local tile=l.tileset:getTile(n);for y=0,l.tileset.grid.tileSize.height-1 do for x=0,l.tileset.grid.tileSize.width-1 do local v=tile:getPixel(x,y);f:write(app.pixelColor.rgbaR(v)..','..app.pixelColor.rgbaG(v)..','..app.pixelColor.rgbaB(v)..','..app.pixelColor.rgbaA(v)..',') end end end;f:close();s:close()
end`,
    )
    .join("\n"),
);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/oracle.lua"], {
  timeout: 30000,
});
for (let i = 0; i < cases.length; i++) {
  const { tw, th, op } = cases[i],
    pixels = new Uint8Array(tw * th * 8);
  pixels.set([200, 40, 10, 255], tw * th * 4);
  const map = {
      width: 3,
      height: 2,
      tiles: Uint32Array.of(1, 2147483649, 0, 1073741825, 536870913, 1),
    },
    set = {
      id: 0,
      name: "Tiles",
      flags: 6,
      baseIndex: 1,
      tileWidth: tw,
      tileHeight: th,
      tileCount: 2,
      pixels,
    };
  const cel = {
      tilemap: map,
      pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      x: -1,
      y: 1,
      opacity: 255,
      zIndex: 0,
    },
    t = core.refreshTilemapProjections({
      colorDepth: 32,
      tilesets: [set],
      layers: [
        {
          id: "a",
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
        { duration: 100, cels: [cel] },
        { duration: 100, cels: [cel] },
      ],
      activeFrame: 0,
      activeLayer: 0,
    }),
    d = { width: 13, height: 11, timeline: t, selection: null, layer: { ...t.frames[0].cels[0] } };
  if (op.startsWith("resize"))
    core.resizeDocumentSprite(d, 20, 7, op === "resize" ? "nearest" : op.slice(7));
  else if (op === "crop") core.resizeDocumentCanvas(d, { x: 1, y: 2, width: 6, height: 6 }, true);
  else core.rotateDocumentCanvas(d, Number(op.slice(6)));
  const c = d.timeline.frames[0].cels[0],
    s = d.timeline.tilesets[0],
    actual = [
      d.width,
      d.height,
      s.tileWidth,
      s.tileHeight,
      ...(c ? [c.x, c.y, c.tilemap.width, c.tilemap.height, ...c.tilemap.tiles] : []),
      ...s.pixels,
    ],
    expected = fs
      .readFileSync(root + "/" + i + ".txt", "utf8")
      .split(",")
      .filter(Boolean)
      .map(Number);
  assert.deepEqual(actual, expected, JSON.stringify(cases[i]));
  assert.equal(c?.tilemap, d.timeline.frames[1].cels[0]?.tilemap);
  assert.deepEqual([...map.tiles], [1, 2147483649, 0, 1073741825, 536870913, 1]);
  assert.equal(set.tileWidth, tw);
  const old = d.timeline;
  assert.throws(() => core.resizeDocumentSprite(d, 32768, 32768));
  assert.equal(d.timeline, old);
}
console.log(
  `${cases.length} Aseprite Tilemap resize/rotate/crop fixtures match; links, immutable inputs and atomic limits pass.`,
);
// Indexed tile samples must retain identity even when two palette colors coincide.
for (const depth of [8, 16])
  for (const method of ["nearest", "bilinear", "rotsprite"]) {
    const tw = 2,
      th = 2,
      channels = depth / 8,
      asepritePixels = new Uint8Array(8 * channels);
    if (depth === 8) asepritePixels.set([1, 2, 2, 1], 4);
    else asepritePixels.set([50, 255, 150, 255, 150, 255, 50, 255], 8);
    const set = {
        id: 0,
        name: "Shared",
        flags: 6,
        baseIndex: 1,
        tileWidth: tw,
        tileHeight: th,
        tileCount: 2,
        pixels: new Uint8Array(32),
        asepritePixels,
      },
      map = { width: 2, height: 1, tiles: Uint32Array.of(1, 2147483649) },
      cel = {
        tilemap: map,
        pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
        x: -3,
        y: -1,
        opacity: 255,
        zIndex: 0,
      },
      palette = [
        [0, 0, 0, 0],
        [80, 80, 80, 255],
        [80, 80, 80, 255],
      ],
      layer = {
        id: "a",
        name: "Map",
        kind: "tilemap",
        tilesetId: 0,
        flags: 3,
        visible: true,
        locked: false,
        opacity: 255,
      },
      t = core.refreshTilemapProjections({
        colorDepth: depth,
        transparentIndex: 0,
        tilesets: [set],
        layers: [layer, { ...layer, id: "b" }],
        frames: [
          { duration: 100, palette, cels: [cel, cel] },
          { duration: 100, palette, cels: [cel, cel] },
        ],
        activeFrame: 0,
        activeLayer: 0,
      }),
      doc = {
        width: 8,
        height: 8,
        palette,
        timeline: t,
        selection: null,
        layer: { ...t.frames[0].cels[0] },
      };
    core.resizeDocumentSprite(doc, 16, 16, method);
    assert.equal(doc.timeline.tilesets.length, 1);
    assert.equal(doc.timeline.tilesets[0].asepritePixels.length, 32 * channels);
    assert.equal(doc.timeline.frames[0].cels[0].tilemap, map);
    assert.equal(doc.timeline.frames[1].cels[1].tilemap, map);
    assert.equal(doc.timeline.frames[0].cels[0].x, -6);
    assert.deepEqual(set.asepritePixels, asepritePixels);
    if (depth === 8 && method === "nearest")
      assert.deepEqual(
        doc.timeline.tilesets[0].asepritePixels.slice(16),
        [1, 1, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 1, 1],
      );
  }
console.log(
  "8/16-bit Aseprite samples, all resize methods, shared sets across layers/frames pass.",
);
