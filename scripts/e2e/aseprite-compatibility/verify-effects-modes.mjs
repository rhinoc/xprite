import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
Error.stackTraceLimit = 0;
const root = resolve(".tmp/effects-oracle");
mkdirSync(root, { recursive: true });
const { outputFiles } = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/image-editing/effects.ts";export * from "./packages/editor-core/src/color/samples.ts";export * from "./packages/editor-core/src/color/operations/color-mode.ts";export {activateTimelineCel} from "./packages/editor-core/src/timeline/timeline.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  write: false,
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const palette = Array.from({ length: 256 }, (_, i) => [i, (i * 3) % 256, (i * 7) % 256, 255]);
const specs = [
  [{ kind: "invert" }, "InvertColor{ui=false}"],
  [{ kind: "invert", channels: 8 }, "InvertColor{ui=false,channels=8}"],
  [
    { kind: "brightness-contrast", brightness: 30, contrast: 40 },
    "BrightnessContrast{ui=false,brightness=30,contrast=40}",
  ],
  [
    {
      kind: "hue-saturation",
      mode: "hsl-add",
      hue: 160,
      saturation: 55,
      lightness: 30,
      alpha: -50,
    },
    "HueSaturation{ui=false,mode='hsl_add',hue=160,saturation=55,lightness=30,alpha=-50}",
  ],
  [
    {
      kind: "hue-saturation",
      mode: "hsv-mul",
      hue: -90,
      saturation: -80,
      lightness: -30,
      alpha: 100,
    },
    "HueSaturation{ui=false,mode='hsv_mul',hue=-90,saturation=-80,lightness=-30,alpha=100}",
  ],
  [
    {
      kind: "outline",
      place: "outside",
      matrix: 495,
      color: [5, 15, 35, 255],
      bgColor: [0, 0, 0, 0],
      colorIndex: 5,
      bgIndex: 0,
    },
    "Outline{ui=false,place='outside',matrix='square',color=Color{index=5},bgColor=Color{index=0}}",
  ],
  [
    {
      kind: "replace-color",
      from: palette[2],
      to: palette[5],
      fromIndex: 2,
      toIndex: 5,
      tolerance: 2,
    },
    "ReplaceColor{ui=false,from=Color{index=2},to=Color{index=5},tolerance=2}",
  ],
];
const cases = [];
for (const depth of [8, 16])
  for (const [spec, cmd] of specs)
    for (const selected of [false, true]) {
      let s = spec,
        c = cmd;
      if (depth === 16 && (spec.kind === "outline" || spec.kind === "replace-color")) {
        s =
          spec.kind === "outline"
            ? { ...spec, color: [200, 40, 60, 180], bgColor: [0, 0, 0, 0] }
            : { ...spec, from: [80, 30, 20, 128], to: [200, 40, 60, 180], tolerance: 255 };
        c =
          spec.kind === "outline"
            ? "Outline{ui=false,place='outside',matrix='square',color=Color{r=200,g=40,b=60,a=180},bgColor=Color{gray=0,alpha=0}}"
            : "ReplaceColor{ui=false,from=Color{r=80,g=30,b=20,a=128},to=Color{r=200,g=40,b=60,a=180},tolerance=255}";
      }
      cases.push({ depth, spec: s, command: c, selected });
    }
const makeAsepriteSamples = (depth) => ({
  depth,
  width: 8,
  height: 8,
  data: Uint8Array.from(
    Array.from({ length: 64 }, (_, i) =>
      depth === 8
        ? [i % 16]
        : [(i * 17) % 256, i === 0 || i === 63 ? 255 : [0, 32, 128, 255][i % 4]],
    ).flat(),
  ),
});
const scripts = cases.map((c) => {
  const asepriteSamples = makeAsepriteSamples(c.depth);
  return `do local s=Sprite(8,8,ColorMode.${c.depth === 8 ? "INDEXED" : "GRAY"});local p=Palette(256);for i=0,255 do p:setColor(i,Color{r=i,g=(i*3)%256,b=(i*7)%256,a=255}) end;s:setPalette(p);local values={${[...asepriteSamples.data].join(",")}};for y=0,7 do for x=0,7 do local i=y*8+x;${c.depth === 8 ? "s.cels[1].image:drawPixel(x,y,values[i+1])" : "s.cels[1].image:drawPixel(x,y,app.pixelColor.graya(values[i*2+1],values[i*2+2]))"} end end;${c.selected ? "s.selection=Selection(Rectangle(1,1,5,5));s.selection:subtract(Rectangle(2,2,1,1));" : ""}app.command.${c.command};local cel=s.cels[1];if not cel then f:write('empty') else local im=cel.image;local row={cel.position.x,cel.position.y,im.width,im.height};for y=0,im.height-1 do for x=0,im.width-1 do local v=im:getPixel(x,y);${c.depth === 8 ? "row[#row+1]=v" : "row[#row+1]=app.pixelColor.grayaV(v);row[#row+1]=app.pixelColor.grayaA(v)"} end end;f:write(table.concat(row,',')) end;f:write('\\n');${c.depth === 8 ? "local out={};for i=0,255 do local col=s.palettes[1]:getColor(i);out[#out+1]=col.red;out[#out+1]=col.green;out[#out+1]=col.blue;out[#out+1]=col.alpha end;f:write(table.concat(out,','))" : "f:write('gray')"};f:write('\\n');s:close() end`;
});
writeFileSync(
  root + "/modes.lua",
  `local f=io.open('${root}/modes.txt','w')\n` + scripts.join("\n") + "\nf:close()",
);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/modes.lua"]);
const lines = readFileSync(root + "/modes.txt", "utf8")
  .trim()
  .split("\n");
cases.forEach((c, i) => {
  const asepriteSamples = makeAsepriteSamples(c.depth),
    pixels = {
      width: 8,
      height: 8,
      data: m.expandAsepriteSamples(asepriteSamples, m.paletteForColors(palette), 0),
    },
    cel = { pixels, asepriteSamples, x: 0, y: 0, opacity: 255, zIndex: 0 };
  const mask = c.selected
    ? {
        x: 1,
        y: 1,
        width: 5,
        height: 5,
        data: Uint8Array.from(Array.from({ length: 25 }, (_, j) => (j === 6 ? 0 : 1))),
      }
    : null;
  const d = {
    name: "aseprite-mode",
    width: 8,
    height: 8,
    selection: mask,
    palette,
    timeline: {
      colorDepth: c.depth,
      transparentIndex: 0,
      activeFrame: 0,
      activeLayer: 0,
      layers: [{ id: "a", name: "a", flags: 3, visible: true, locked: false, opacity: 255 }],
      frames: [{ duration: 100, palette, cels: [cel] }],
    },
    layer: { name: "a", visible: true, locked: false, pixels, x: 0, y: 0 },
  };
  const out = m.applyDocumentEffect(d, c.spec);
  m.normalizeAsepriteDocument(out);
  const nc = out.timeline.frames[0].cels[0];
  const actual = nc
    ? [nc.x, nc.y, nc.pixels.width, nc.pixels.height, ...nc.asepriteSamples.data].join(",")
    : "empty";
  assert.equal(actual, lines[i * 2], `${i} ${JSON.stringify(c)}`);
  if (c.depth === 8)
    assert.equal(
      (out.timeline.frames[0].palette ?? out.palette).flat().join(","),
      lines[i * 2 + 1],
      `${i} palette`,
    );
});
console.log(
  `${cases.length} actual Aseprite indexed/grayscale filter cases byte-exact (indices, palettes, gray+alpha, selected mask and full image)`,
);
