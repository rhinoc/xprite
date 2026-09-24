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
      'export * from "./packages/editor-core/src/image-editing/effects.ts";export {ensureTimeline} from "./packages/editor-core/src/timeline/timeline.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  write: false,
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const source = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
for (let y = 0; y < 8; y++)
  for (let x = 0; x < 8; x++)
    source.data.set(
      [
        (31 * x + 11 * y) % 256,
        (9 * x + 37 * y) % 256,
        (x * 53 + y * 23) % 256,
        (x === 0 && y === 0) || (x === 7 && y === 7) ? 255 : [0, 32, 128, 255][(x + y) % 4],
      ],
      (y * 8 + x) * 4,
    );
const color = (c) => `Color{r=${c[0]},g=${c[1]},b=${c[2]},a=${c[3]}}`;
const cases = [];
for (const channels of [7, 15, 1, 8])
  cases.push({
    spec: { kind: "invert", channels },
    lua: `InvertColor{ui=false,channels=${channels}}`,
  });
for (const [brightness, contrast] of [
  [0, 0],
  [25, 50],
  [-65, -100],
  [100, 100],
  [-100, 30],
  [0, 99],
])
  for (const channels of [7, 5])
    cases.push({
      spec: { kind: "brightness-contrast", brightness, contrast, channels },
      lua: `BrightnessContrast{ui=false,brightness=${brightness},contrast=${contrast},channels=${channels}}`,
    });
for (const mode of ["hsv-mul", "hsl-mul", "hsv-add", "hsl-add"])
  for (const [hue, saturation, lightness, alpha] of [
    [120, 30, -20, 0],
    [-180, -100, 40, -50],
    [17, 0, 0, 100],
    [0, 0, 0, 0],
  ])
    cases.push({
      spec: { kind: "hue-saturation", mode, hue, saturation, lightness, alpha },
      lua: `HueSaturation{ui=false,mode='${mode.replace("-", "_")}',hue=${hue},saturation=${saturation},lightness=${lightness},alpha=${alpha}}`,
    });
for (const tolerance of [0, 25, 255])
  for (const channels of [7, 15, 8]) {
    const from = [0, 0, 0, 255],
      to = [200, 20, 70, 128];
    cases.push({
      spec: { kind: "replace-color", from, to, tolerance, channels },
      lua: `ReplaceColor{ui=false,from=${color(from)},to=${color(to)},tolerance=${tolerance},channels=${channels}}`,
    });
  }
for (const place of ["outside", "inside"])
  for (const matrix of [170, 495, 40, 130, 1])
    for (const tiledMode of [0, 3]) {
      const c = [0, 255, 127, 200],
        bg = [0, 0, 0, 0];
      cases.push({
        spec: { kind: "outline", place, matrix, tiledMode, color: c, bgColor: bg },
        lua: `Outline{ui=false,place='${place}',matrix=${matrix},tiledMode=${tiledMode},color=${color(c)},bgColor=${color(bg)}}`,
      });
    }
const selections = [false, true];
const all = cases.flatMap((c) => selections.map((selection) => ({ ...c, selection })));
const setup = `local s=Sprite(8,8,ColorMode.RGB);local im=s.cels[1].image;local values={${[...source.data].join(",")}};for y=0,7 do for x=0,7 do local i=(y*8+x)*4+1;im:drawPixel(x,y,app.pixelColor.rgba(values[i],values[i+1],values[i+2],values[i+3])) end end;`;
const dump = `local cel=s.cels[1];if not cel then f:write('empty\\n') else local im=cel.image;local row={cel.position.x,cel.position.y,im.width,im.height};for y=0,im.height-1 do for x=0,im.width-1 do local p=im:getPixel(x,y);row[#row+1]=app.pixelColor.rgbaR(p);row[#row+1]=app.pixelColor.rgbaG(p);row[#row+1]=app.pixelColor.rgbaB(p);row[#row+1]=app.pixelColor.rgbaA(p) end end;f:write(table.concat(row,',')..'\\n') end;s:close()`;
const lua =
  `local f=io.open('${root}/aseprite.txt','w')\n` +
  all
    .map(
      (c) =>
        `do ${setup}${c.selection ? "s.selection=Selection(Rectangle(1,1,5,5));s.selection:subtract(Rectangle(2,2,2,2));" : ""}app.command.${c.lua};${dump} end`,
    )
    .join("\n") +
  "\nf:close()";
writeFileSync(root + "/effects.lua", lua);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/effects.lua"], {
  maxBuffer: 5e6,
});
const lines = readFileSync(root + "/aseprite.txt", "utf8")
  .trim()
  .split("\n");
all.forEach((c, i) => {
  const mask = c.selection
    ? {
        x: 1,
        y: 1,
        width: 5,
        height: 5,
        data: Uint8Array.from(
          Array.from({ length: 25 }, (_, j) => {
            const x = (j % 5) + 1,
              y = Math.floor(j / 5) + 1;
            return x >= 2 && x < 4 && y >= 2 && y < 4 ? 0 : 1;
          }),
        ),
      }
    : null;
  const doc = {
    width: 8,
    height: 8,
    name: "effect",
    selection: mask,
    layer: {
      name: "Layer 1",
      pixels: { ...source, data: source.data.slice() },
      x: 0,
      y: 0,
      visible: true,
      locked: false,
    },
  };
  api.ensureTimeline(doc);
  const next = api.applyDocumentEffect(doc, c.spec),
    cel = next.timeline.frames[0].cels[0],
    expected = cel
      ? [cel.x, cel.y, cel.pixels.width, cel.pixels.height, ...cel.pixels.data].join(",")
      : "empty";
  assert.equal(expected, lines[i], `${i} ${JSON.stringify(c)}`);
  assert.deepEqual(doc.layer.pixels.data, source.data, "Pure filter never mutates source");
});
console.log(
  `${all.length} Aseprite CLI filter cases byte-exact, including channels/alpha/selection holes/HSL-HSV modes/outline kernels/tiled edges`,
);
