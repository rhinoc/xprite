import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/image-editing/size.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const root = process.cwd() + "/.tmp/dimensions-oracle";
fs.mkdirSync(root, { recursive: true });
const pixels = {
  width: 3,
  height: 2,
  data: new Uint8ClampedArray([
    1, 0, 0, 255, 2, 0, 0, 255, 0, 0, 0, 0, 3, 0, 0, 255, 4, 0, 0, 128, 5, 0, 0, 255,
  ]),
};
const cases = [
  [
    "grow",
    `app.command.CanvasSize{ui=false,bounds=Rectangle(-3,-2,13,11),trimOutside=false}`,
    (d) => api.resizeDocumentCanvas(d, { x: -3, y: -2, width: 13, height: 11 }),
  ],
  [
    "crop",
    `app.command.CanvasSize{ui=false,bounds=Rectangle(0,2,2,1),trimOutside=true}`,
    (d) => api.resizeDocumentCanvas(d, { x: 0, y: 2, width: 2, height: 1 }, true),
  ],
  [
    "rotate90",
    `app.command.Rotate{ui=false,target='sprite',angle=90}`,
    (d) => api.rotateDocumentCanvas(d, 90),
  ],
  [
    "rotate-90",
    `app.command.Rotate{ui=false,target='sprite',angle=-90}`,
    (d) => api.rotateDocumentCanvas(d, -90),
  ],
  [
    "rotate180",
    `app.command.Rotate{ui=false,target='sprite',angle=180}`,
    (d) => api.rotateDocumentCanvas(d, 180),
  ],
  [
    "resize",
    `app.command.SpriteSize{ui=false,width=13,height=11,method='nearest-neighbor'}`,
    (d) => api.resizeDocumentSprite(d, 13, 11),
  ],
  [
    "downsize",
    `app.command.SpriteSize{ui=false,width=3,height=2,method='nearest-neighbor'}`,
    (d) => api.resizeDocumentSprite(d, 3, 2),
  ],
  ["trim", `app.command.AutocropSprite{ui=false}`, (d) => api.trimDocumentCanvas(d)],
];
const fixture = `local s=Sprite(8,6,ColorMode.RGB)
local image=Image(3,2,ColorMode.RGB)
local pixels={${[...pixels.data].join(",")}}
for y=0,1 do for x=0,2 do local i=(y*3+x)*4+1;image:drawPixel(x,y,app.pixelColor.rgba(pixels[i],pixels[i+1],pixels[i+2],pixels[i+3])) end end
s:newCel(s.layers[1],s.frames[1],image,Point(-1,2))
s.selection=Selection(Rectangle(-1,1,3,3))
s.selection:subtract(Rectangle(0,2,1,1))`;
const dump = String.raw`local function row(...) local args={...};for _,n in ipairs(args) do f:write(tostring(n)..',') end;f:write('\n') end
row(s.width,s.height)
local cel=s.cels[1];row(cel.position.x,cel.position.y,cel.image.width,cel.image.height)
local image=cel.image
for y=0,image.height-1 do for x=0,image.width-1 do local c=image:getPixel(x,y);f:write(app.pixelColor.rgbaR(c)..','..app.pixelColor.rgbaG(c)..','..app.pixelColor.rgbaB(c)..','..app.pixelColor.rgbaA(c)..',') end end;f:write('\n')
local b=s.selection.bounds;row(b.x,b.y,b.width,b.height)
for y=b.y,b.y+b.height-1 do for x=b.x,b.x+b.width-1 do f:write((s.selection:contains(Point(x,y)) and '255' or '0')..',') end end;f:write('\n')
f:close();s:close()`;
fs.writeFileSync(
  root + "/document.lua",
  cases
    .map(
      ([name, command]) =>
        `do\n${fixture}\n${command}\nlocal f=io.open('${root}/${name}.txt','w')\n${dump}\nend`,
    )
    .join("\n"),
);
fs.appendFileSync(
  root + "/document.lua",
  `
do
local s=Sprite(4,4,ColorMode.RGB)
s:saveAs('${root}/unchanged.aseprite')
assert(not s.isModified)
app.command.CanvasSize{ui=false,bounds=Rectangle(0,0,4,4),trimOutside=false}
assert(s.isModified,'Unchanged Canvas Size still executes SetSpriteSize')
app.undo();assert(not s.isModified)
for y=0,3 do for x=0,3 do s.cels[1].image:drawPixel(x,y,app.pixelColor.rgba(1+y*4+x,20,30,255)) end end
s:saveAs('${root}/tight.aseprite')
assert(not s.isModified)
app.command.AutocropSprite{ui=false}
assert(s.isModified and s.width==4 and s.height==4,'Tight nonempty Trim still records a size command')
s:close()
end`,
);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/document.lua"], {
  timeout: 30000,
});
for (const [name, , operation] of cases) {
  const layer = { name: "a", pixels, x: -1, y: 2, visible: true, locked: false };
  const doc = {
    width: 8,
    height: 6,
    name: "fixture",
    layer,
    selection: {
      x: -1,
      y: 1,
      width: 3,
      height: 3,
      data: new Uint8Array([255, 255, 255, 255, 0, 255, 255, 255, 255]),
    },
    timeline: {
      activeFrame: 0,
      activeLayer: 0,
      layers: [{ id: "a", name: "a", visible: true, locked: false, opacity: 255, flags: 3 }],
      frames: [{ duration: 100, cels: [{ pixels, x: -1, y: 2, opacity: 255, zIndex: 0 }] }],
    },
  };
  operation(doc);
  const cel = doc.timeline.frames[0].cels[0],
    mask = doc.selection;
  const expected = fs
    .readFileSync(root + "/" + name + ".txt", "utf8")
    .trimEnd()
    .split("\n")
    .map((row) => row.split(",").filter(Boolean).map(Number));
  const actual = [
    [doc.width, doc.height],
    [cel.x, cel.y, cel.pixels.width, cel.pixels.height],
    [...cel.pixels.data],
    mask ? [mask.x, mask.y, mask.width, mask.height] : [0, 0, 0, 0],
    mask ? [...mask.data] : [],
  ];
  if (expected.length === 4) expected.push([]);
  assert.deepEqual(
    actual.map((row) => row.map((n) => n || 0)),
    expected,
    name,
  );
}
console.log(
  `${cases.length} Aseprite document transforms match geometry, raster and irregular selection byte-for-byte; unchanged Canvas/Tight Trim dirty semantics verified.`,
);
