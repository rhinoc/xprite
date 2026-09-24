import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const root = resolve(".tmp/selection-edge-oracle");
mkdirSync(root, { recursive: true });
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/selection/operations.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const rect = (x, y, width, height) => ({
  x,
  y,
  width,
  height,
  data: new Uint8Array(width * height).fill(1),
});
const cases = [];
for (const [name, mask] of [
  ["edge", rect(0, 0, 1, 1)],
  ["negative", rect(-2, -1, 2, 2)],
  ["outside", rect(-8, -8, 2, 2)],
])
  for (const operation of ["expand", "contract", "border"])
    for (const brush of ["square", "circle"])
      cases.push({
        name: `${name}-${operation}-${brush}`,
        setup: `s.selection=Selection(Rectangle(${mask.x},${mask.y},${mask.width},${mask.height}))`,
        command: `app.command.ModifySelection{ui=false,modifier='${operation}',quantity=1,brush='${brush}'}`,
        expected: api.modifySelection(mask, operation, 1, brush, 4, 4),
      });
for (const base of [null, rect(-3, -2, 2, 2), rect(-1, 0, 3, 2)])
  for (const mode of ["replace", "add", "subtract", "intersect"])
    for (const matches of [true, false])
      cases.push({
        name: `color-${base ? base.x : "none"}-${mode}-${matches}`,
        setup: `local image=Image(3,2,ColorMode.RGB);image:clear(app.pixelColor.rgba(255,0,0,255));s:newCel(s.layers[1],s.frames[1],image,Point(-2,-1));${base ? `s.selection=Selection(Rectangle(${base.x},${base.y},${base.width},${base.height}))` : "s.selection:deselect()"}`,
        command: `app.command.MaskByColor{ui=false,color=Color{r=${matches ? 255 : 0},g=0,b=0,a=255},tolerance=0,mode='${mode}'}`,
        expected: api.combineColorRangeSelection(base, matches ? rect(-2, -1, 3, 2) : null, mode),
      });
for (const base of [null, rect(-3, -2, 2, 2)])
  for (const [mode, selection] of [
    ["replace", 0],
    ["add", 1],
    ["subtract", 2],
    ["intersect", 3],
  ])
    cases.push({
      name: `gesture-${base ? "outside" : "none"}-${mode}`,
      setup: base
        ? `s.selection=Selection(Rectangle(${base.x},${base.y},${base.width},${base.height}))`
        : "s.selection:deselect()",
      command: `app.useTool{tool='rectangular_marquee',points={Point(1,1),Point(2,2)},selection=${selection}}`,
      expected: api.combineSelection(base, rect(1, 1, 2, 2), mode, 4, 4),
    });
const dump = `local b=s.selection.bounds;local row={b.x,b.y,b.width,b.height};for y=b.y,b.y+b.height-1 do for x=b.x,b.x+b.width-1 do row[#row+1]=s.selection:contains(Point(x,y)) and 1 or 0 end end;f:write(table.concat(row,',')..'\\n');s:close()`;
const lua =
  `local f=io.open('${root}/aseprite-edges.txt','w')\n` +
  cases
    .map((c) => `do local s=Sprite(4,4,ColorMode.RGB);${c.setup};${c.command};${dump} end`)
    .join("\n") +
  "\nf:close()";
writeFileSync(root + "/aseprite-edges.lua", lua);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/aseprite-edges.lua"]);
const lines = readFileSync(root + "/aseprite-edges.txt", "utf8")
  .trim()
  .split("\n");
for (let i = 0; i < cases.length; i++) {
  const m = cases[i].expected,
    wanted = m ? [m.x, m.y, m.width, m.height, ...m.data] : [0, 0, 0, 0];
  assert.deepEqual(lines[i].split(",").map(Number), wanted, cases[i].name);
}
assert.throws(
  () => api.combineColorRangeSelection(rect(-32768, 0, 1, 1), rect(32767, 0, 1, 1), "add"),
  /selection width/,
  "Unbounded source semantics still respect allocation limits",
);
console.log(
  `${cases.length} masks match actual Aseprite CLI byte-for-byte: edge/negative/outside morphology, off-canvas color range, all modes with/without old mask/matches; allocation bound checked`,
);
