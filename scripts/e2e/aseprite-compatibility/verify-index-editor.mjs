import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
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
const root = await mkdtemp(join(tmpdir(), "ase-index-editor-")),
  cases = [];
for (const variant of ["normal", "opaque-mask", "partial-color"])
  for (const ink of ["simple", "alpha-compositing", "copy-color", "lock-alpha"])
    for (const index of [0, 1, 2])
      for (const opacity of [0, 128, 255]) cases.push({ ink, index, opacity, variant });
const constants = {
  simple: "SIMPLE",
  "alpha-compositing": "ALPHA_COMPOSITING",
  "copy-color": "COPY_COLOR",
  "lock-alpha": "LOCK_ALPHA",
};
const lua =
  `local f=io.open('${root}/indices.txt','w')\n` +
  cases
    .map(
      (c) =>
        `do local s=Sprite(3,1,ColorMode.INDEXED);s.transparentColor=2;local p=Palette(4);p:setColor(0,Color{r=255,g=0,b=0,a=255});p:setColor(1,Color{r=255,g=0,b=0,a=${c.variant === "partial-color" ? 128 : 255}});p:setColor(2,Color{r=0,g=0,b=${c.variant === "opaque-mask" ? 255 : 0},a=${c.variant === "opaque-mask" ? 255 : 0}});p:setColor(3,Color{r=0,g=0,b=255,a=255});s:setPalette(p);local im=s.cels[1].image;for x=0,2 do im:drawPixel(x,0,0) end;app.useTool{tool='pencil',color=Color{index=${c.index}},ink=Ink.${constants[c.ink]},opacity=${c.opacity},points={Point(1,0)}};f:write(tostring(s.cels[1].image:getPixel(1-s.cels[1].position.x,0))..'\\n');s:close() end`,
    )
    .join("\n") +
  "\nf:close()";
await writeFile(join(root, "oracle.lua"), lua);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", join(root, "oracle.lua")], {
  timeout: 30000,
});
const expected = (await readFile(join(root, "indices.txt"), "utf8")).trim().split("\n").map(Number);
const palette = [
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 0, 0, 0],
  ],
  pixels = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([...palette[0], ...palette[0], ...palette[0]]),
  };
const timeline = (palette) => ({
  colorDepth: 8,
  transparentIndex: 2,
  composeGroups: false,
  activeFrame: 0,
  activeLayer: 0,
  layers: [{ id: "l", name: "Layer", visible: true, locked: false, opacity: 255, flags: 3 }],
  frames: [
    {
      duration: 100,
      palette,
      cels: [
        {
          pixels: { ...pixels, data: pixels.data.slice() },
          asepriteSamples: { depth: 8, width: 3, height: 1, data: new Uint8Array([0, 0, 0]) },
          x: 0,
          y: 0,
          opacity: 255,
          zIndex: 0,
        },
      ],
    },
  ],
});
const mismatches = [];
for (const [i, c] of cases.entries()) {
  const p = palette.map((v) => [...v]);
  p.push([0, 0, 255, 255]);
  if (c.variant === "opaque-mask") p[2] = [0, 0, 255, 255];
  if (c.variant === "partial-color") p[1] = [255, 0, 0, 128];
  const e = new m.RasterEditor();
  e.loadTimeline(timeline(p), 3, 1, "Aseprite", p);
  e.setSettings({
    tool: "pencil",
    foreground: p[c.index],
    foregroundIndex: c.index,
    ink: c.ink,
    opacity: c.opacity,
  });
  e.markSaved();
  e.pointerDown({ x: 1, y: 0 });
  e.pointerUp();
  const t = e.getSnapshot().document.timeline,
    cel = t.frames[0].cels[0],
    index = cel.asepriteSamples.data[1 - cel.x];
  if (index !== expected[i]) mismatches.push({ ...c, expected: expected[i], actual: index });
  if (c.variant === "normal" && c.ink === "simple" && c.index === 1 && c.opacity === 255) {
    assert.equal(e.getSnapshot().dirty, true);
    e.undo();
    assert.equal(e.getSnapshot().document.timeline.frames[0].cels[0].asepriteSamples.data[1], 0);
    e.redo();
    assert.equal(e.getSnapshot().document.timeline.frames[0].cels[0].asepriteSamples.data[1], 1);
  }
}
assert.deepEqual(mismatches, []);
console.log(
  `${cases.length} actual Aseprite indexed ink cases pass: duplicate index, transparent index,Simple/Alpha/Copy withopacity0/128/255 and actual-editor dirty/undo/redo.`,
);
