import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
Error.stackTraceLimit = 0;
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/editor/RasterEditor.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { RasterEditor } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const root = process.cwd() + "/.tmp/assistance-oracle";
fs.mkdirSync(root, { recursive: true });
const cases = [];
for (const tool of [
  "line",
  "rectangle",
  "filled_rectangle",
  "ellipse",
  "filled_ellipse",
  "eraser",
  "bucket",
  "marquee",
])
  for (const mode of [0, 1, 2, 3, 12, 15]) cases.push({ tool, mode });
const source = cases
  .map(
    (
      c,
      i,
    ) => `do local s=Sprite(12,10,ColorMode.RGB);app.preferences.symmetry_mode.enabled=true;local p=app.preferences.document(s);p.symmetry.mode=${c.mode};p.symmetry.x_axis=6;p.symmetry.y_axis=5
${c.tool === "eraser" ? `for y=0,9 do for x=0,11 do s.cels[1].image:drawPixel(x,y,app.pixelColor.rgba(0,0,255,255)) end end` : ""}
${c.tool === "bucket" ? `for y=0,9 do s.cels[1].image:drawPixel(5,y,app.pixelColor.rgba(0,0,255,255)) end` : ""}
app.useTool{tool='${c.tool === "marquee" ? "rectangular_marquee" : c.tool === "bucket" ? "paint_bucket" : c.tool}',brush=Brush{type=BrushType.CIRCLE,size=1},color=Color{r=255,g=0,b=0,a=255},points={Point(1,2),Point(3,4)}}
local f=io.open('${root}/tools-${i}.txt','w');local cel=s.cels[1];local image=cel.image;for y=0,9 do for x=0,11 do ${c.tool === "marquee" ? `if s.selection:contains(Point(x,y)) then f:write((y*12+x)..',') end` : `local xx=x-cel.position.x;local yy=y-cel.position.y;if xx>=0 and yy>=0 and xx<image.width and yy<image.height then local color=image:getPixel(xx,yy);if ${c.tool === "eraser" ? "app.pixelColor.rgbaA(color)==0" : "app.pixelColor.rgbaR(color)==255"} then f:write((y*12+x)..',') end ${c.tool === "eraser" ? `else f:write((y*12+x)..',')` : ""} end`} end end;f:close();s:close() end`,
  )
  .join("\n");
fs.writeFileSync(root + "/tools.lua", source);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/tools.lua"], {
  timeout: 30000,
});
const failures = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i],
    pixels = { width: 12, height: 10, data: new Uint8ClampedArray(480) };
  if (c.tool === "eraser") for (let n = 0; n < 120; n++) pixels.data.set([0, 0, 255, 255], n * 4);
  if (c.tool === "bucket")
    for (let y = 0; y < 10; y++) pixels.data.set([0, 0, 255, 255], (y * 12 + 5) * 4);
  const e = new RasterEditor(pixels);
  e.setSettings({
    tool: c.tool,
    symmetryEnabled: true,
    foreground: [255, 0, 0, 255],
    brush: { shape: "circle", size: 1, angle: 0 },
  });
  e.setView({ symmetryMode: c.mode, symmetryX: 6, symmetryY: 5 });
  e.pointerDown({ x: 1, y: 2 });
  e.pointerMove({ x: 3, y: 4 });
  e.pointerUp({ x: 3, y: 4 });
  const image = e.exportComposite(),
    m = e.getSnapshot().document.selection,
    actual = [];
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 12; x++) {
      const n = y * 12 + x;
      if (
        c.tool === "marquee"
          ? m &&
            x >= m.x &&
            y >= m.y &&
            x < m.x + m.width &&
            y < m.y + m.height &&
            m.data[(y - m.y) * m.width + x - m.x]
          : c.tool === "eraser"
            ? image.data[n * 4 + 3] === 0
            : image.data[n * 4] === 255
      )
        actual.push(n);
    }
  const expected = fs
    .readFileSync(root + "/tools-" + i + ".txt", "utf8")
    .split(",")
    .filter(Boolean)
    .map(Number);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    failures.push({ ...c, actual, expected });
}
fs.writeFileSync(
  root + "/tools-report.json",
  JSON.stringify({ cases: cases.length, failures }, null, 2),
);
if (failures.length) console.log(failures.map(({ tool, mode }) => ({ tool, mode })));
assert.equal(failures.length, 0, "Multi-tool symmetry Aseprite mismatch");
console.log(
  `${cases.length} Aseprite multi-tool symmetry cases match: line/rectangle/fill/ellipse/eraser/bucket/selection.`,
);
