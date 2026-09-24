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
const { projectTiledPixel } = await bundle("packages/editor-core/src/canvas/tiled-canvas.ts"),
  { snapStrokePoint } = await bundle("packages/editor-core/src/canvas/assistance/grid.ts"),
  { brushMask } = await bundle("packages/editor-core/src/canvas/raster/geometry.ts");
const root = process.cwd() + "/.tmp/assistance-oracle";
fs.mkdirSync(root, { recursive: true });
const cases = [];
for (const mode of [0, 1, 2, 3])
  for (const p of [
    [-1, -1],
    [0, 0],
    [7, 5],
    [9, 7],
  ])
    cases.push({ mode, p, brush: 4, grid: null });
for (const grid of [
  { x: 0, y: 0, width: 4, height: 3 },
  { x: 2, y: -2, width: 5, height: 4 },
])
  for (const p of [
    [1, 1],
    [3, 2],
    [5, 5],
    [-1, 2],
  ])
    for (const brush of [1, 4]) cases.push({ mode: 0, p, brush, grid });
const script = cases
  .map(
    (
      c,
      i,
    ) => `do local s=Sprite(8,6,ColorMode.RGB);local p=app.preferences.document(s);app.preferences.symmetry_mode.enabled=false;p.tiled.mode=${c.mode};p.grid.snap=${c.grid ? "true" : "false"}
${c.grid ? `s.gridBounds=Rectangle(${c.grid.x},${c.grid.y},${c.grid.width},${c.grid.height});p.grid.bounds=s.gridBounds` : ""}
app.useTool{tool='pencil',brush=Brush{type=BrushType.SQUARE,size=${c.brush}},color=Color{r=255,g=0,b=0,a=255},points={Point(${c.p[0]},${c.p[1]})}}
local f=io.open('${root}/tile-grid-${i}.txt','w');local cel=s.cels[1];local image=cel.image;for y=0,5 do for x=0,7 do local xx=x-cel.position.x;local yy=y-cel.position.y;if xx>=0 and yy>=0 and xx<image.width and yy<image.height and app.pixelColor.rgbaA(image:getPixel(xx,yy))>0 then f:write((y*8+x)..',') end end end;f:close();s:close() end`,
  )
  .join("\n");
fs.writeFileSync(root + "/tile-grid.lua", script);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/tile-grid.lua"], {
  timeout: 30000,
});
for (let i = 0; i < cases.length; i++) {
  const c = cases[i],
    mask = brushMask({ shape: "square", size: c.brush, angle: 0 }),
    point = c.grid
      ? snapStrokePoint({ x: c.p[0], y: c.p[1] }, c.grid, { x: -mask.x, y: -mask.y })
      : { x: c.p[0], y: c.p[1] },
    actual = new Set();
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const p = projectTiledPixel(point.x + mask.x + x, point.y + mask.y + y, {
        mode: c.mode,
        width: 8,
        height: 6,
        origin: { x: 0, y: 0 },
      });
      if (p.x >= 0 && p.y >= 0 && p.x < 8 && p.y < 6) actual.add(p.y * 8 + p.x);
    }
  const expected = fs
    .readFileSync(root + "/tile-grid-" + i + ".txt", "utf8")
    .split(",")
    .filter(Boolean)
    .map(Number);
  assert.deepEqual(
    [...actual].sort((a, b) => a - b),
    expected,
    JSON.stringify(c),
  );
}
console.log(
  `${cases.length} actual Aseprite tiled-edge/grid-origin/negative-coordinate/brush-center raster fixtures match.`,
);
