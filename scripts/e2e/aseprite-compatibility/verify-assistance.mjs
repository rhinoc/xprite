import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
Error.stackTraceLimit = 0;
const bundle = async (path) => {
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
const symmetry = await bundle("packages/editor-core/src/canvas/assistance/symmetry.ts"),
  geometry = await bundle("packages/editor-core/src/canvas/raster/geometry.ts"),
  grid = await bundle("packages/editor-core/src/canvas/assistance/grid.ts"),
  tiled = await bundle("packages/editor-core/src/canvas/tiled-canvas.ts");
const root = process.cwd() + "/.tmp/assistance-oracle";
fs.mkdirSync(root, { recursive: true });
const cases = [];
for (const mode of [0, 1, 2, 3, 4, 8, 12, 15, 5])
  for (const [shape, size, angle] of [
    ["circle", 1, 0],
    ["square", 4, 0],
    ["line", 5, 35],
    ["square", 5, 30],
  ])
    for (const axes of [
      [6, 5],
      [5.5, 4.5],
    ])
      cases.push({ mode, shape, size, angle, axes });
const code = cases
  .map(
    (c, i) => `do local s=Sprite(12,10,ColorMode.RGB)
app.preferences.symmetry_mode.enabled=true
local p=app.preferences.document(s);p.symmetry.mode=${c.mode};p.symmetry.x_axis=${c.axes[0]};p.symmetry.y_axis=${c.axes[1]}
app.useTool{tool='pencil',brush=Brush{type=BrushType.${c.shape.toUpperCase()},size=${c.size},angle=${c.angle}},color=Color{r=255,g=0,b=0,a=255},points={Point(2,3)}}
local f=io.open('${root}/${i}.txt','w');local cel=s.cels[1];local image=cel.image
for y=0,9 do for x=0,11 do local xx=x-cel.position.x;local yy=y-cel.position.y;if xx>=0 and yy>=0 and xx<image.width and yy<image.height and app.pixelColor.rgbaA(image:getPixel(xx,yy))>0 then f:write((y*12+x)..',') end end end
f:close();s:close() end`,
  )
  .join("\n");
fs.writeFileSync(root + "/symmetry.lua", code);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/symmetry.lua"], {
  timeout: 30000,
});
for (let i = 0; i < cases.length; i++) {
  const c = cases[i],
    mask = geometry.brushMask({ shape: c.shape, size: c.size, angle: c.angle }),
    strokes = symmetry.generateSymmetryStrokes(
      [
        { x: 2, y: 3 },
        { x: 2, y: 3 },
      ],
      { mode: c.mode, x: c.axes[0], y: c.axes[1], enabled: true },
      { width: mask.width, height: mask.height, center: { x: -mask.x, y: -mask.y } },
    ),
    pixels = new Set();
  for (const stroke of strokes) {
    const brush = symmetry.symmetryBrushMask(mask, stroke[0].symmetry);
    geometry.line(stroke[0].x, stroke[0].y, stroke[1].x, stroke[1].y, (x, y) => {
      for (let yy = 0; yy < brush.height; yy++)
        for (let xx = 0; xx < brush.width; xx++)
          if (brush.data[yy * brush.width + xx]) {
            const px = x + brush.x + xx,
              py = y + brush.y + yy;
            if (px >= 0 && py >= 0 && px < 12 && py < 10) pixels.add(py * 12 + px);
          }
    });
  }
  const expected = fs
    .readFileSync(root + "/" + i + ".txt", "utf8")
    .split(",")
    .filter(Boolean)
    .map(Number);
  assert.deepEqual(
    [...pixels].sort((a, b) => a - b),
    expected,
    JSON.stringify(c),
  );
}
assert.deepEqual(grid.snapPointToGrid({ x: 0, y: 0, width: 8, height: 8 }, { x: -5, y: 4 }), {
  x: 0,
  y: 0,
});
assert.deepEqual(
  grid.snapPointToGrid({ x: 0, y: 0, width: 8, height: 8 }, { x: -8, y: 8 }, "floor"),
  { x: -16, y: 8 },
);
assert.deepEqual(
  tiled.projectTiledPixel(-3, 4, { mode: 3, width: 4, height: 3, origin: { x: 1, y: -1 } }),
  { x: 1, y: 1 },
);
assert.equal(tiled.tiledCanvasLayout(4, 3, 3).tiles.length, 9);
assert.equal(tiled.tiledCanvasLayout(4, 3, 1).tiles.length, 3);
console.log(
  `${cases.length} Aseprite symmetry raster fixtures match, including odd/even/angled brushes and diagonal/all mode; grid/tile boundary contracts pass.`,
);
