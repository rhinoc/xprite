import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
Error.stackTraceLimit = 0;
const { outputFiles } = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/image-editing/effects.ts";export * from "./packages/editor-core/src/color/samples.ts";export {paletteForColors} from "./packages/editor-core/src/color/operations/color-mode.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  write: false,
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const palette = Array.from({ length: 256 }, () => [0, 0, 0, 255]);
palette[2] = palette[5] = [255, 0, 0, 255];
palette[6] = [0, 0, 255, 255];
const spec = m.defaultEffect("replace-color", palette[5], palette[6], undefined, {
  foregroundIndex: 5,
  backgroundIndex: 6,
});
assert.equal(spec.fromIndex, 5);
assert.equal(spec.toIndex, 6);
assert.equal(
  m.updateEffectColor(spec, "from", [255, 0, 0, 255]),
  spec,
  "Equal RGBA picker value retains explicit duplicate index",
);
assert.equal(
  m.updateEffectColor(spec, "from", [254, 0, 0, 255]).fromIndex,
  undefined,
  "Different RGBA becomes an RGB color",
);
const asepriteSamples = { depth: 8, width: 4, height: 1, data: new Uint8Array([2, 5, 2, 5]) },
  pixels = {
    width: 4,
    height: 1,
    data: m.expandAsepriteSamples(asepriteSamples, m.paletteForColors(palette), 0),
  };
const doc = {
  name: "duplicates",
  width: 4,
  height: 1,
  palette,
  selection: null,
  layer: { name: "a", pixels, x: 0, y: 0, visible: true, locked: false },
  timeline: {
    colorDepth: 8,
    transparentIndex: 0,
    activeFrame: 0,
    activeLayer: 0,
    layers: [{ id: "a", name: "a", flags: 3, visible: true, locked: false, opacity: 255 }],
    frames: [
      {
        duration: 100,
        palette,
        cels: [{ pixels, asepriteSamples, x: 0, y: 0, opacity: 255, zIndex: 0 }],
      },
    ],
  },
};
const out = m.applyDocumentEffect(doc, spec),
  actual = [...out.timeline.frames[0].cels[0].asepriteSamples.data];
const root = resolve(".tmp/effects-oracle");
mkdirSync(root, { recursive: true });
writeFileSync(
  root + "/duplicates.lua",
  `local s=Sprite(4,1,ColorMode.INDEXED);local p=Palette(256);for i=0,255 do p:setColor(i,Color{r=0,g=0,b=0,a=255}) end;p:setColor(2,Color{r=255,g=0,b=0});p:setColor(5,Color{r=255,g=0,b=0});p:setColor(6,Color{r=0,g=0,b=255});s:setPalette(p);local values={2,5,2,5};for x=0,3 do s.cels[1].image:drawPixel(x,0,values[x+1]) end;app.command.ReplaceColor{ui=false,from=Color{index=5},to=Color{index=6},tolerance=0};local row={};for x=0,3 do row[#row+1]=s.cels[1].image:getPixel(x,0) end;local f=io.open('${root}/duplicates.txt','w');f:write(table.concat(row,','));f:close();s:close()`,
);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/duplicates.lua"]);
assert.deepEqual(
  actual,
  readFileSync(root + "/duplicates.txt", "utf8")
    .split(",")
    .map(Number),
);
assert.deepEqual(actual, [2, 6, 2, 6]);
const outline = m.defaultEffect("outline", palette[5], palette[6], undefined, {
  foregroundIndex: 5,
  outlineBackgroundIndex: 0,
});
assert.equal(outline.colorIndex, 5);
assert.equal(outline.bgIndex, 0);
console.log(
  "Aseprite's duplicate-palette replacement matches; host defaults preserve explicit indices and color edits clear only changed identity",
);
