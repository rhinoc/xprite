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
const { resizeSpritePixels } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const root = process.cwd() + "/.tmp/dimensions-oracle";
fs.mkdirSync(root, { recursive: true });
const cases = [];
let seed = 7321;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
const dimensions = [
  [3, 3, 7, 8],
  [4, 5, 2, 3],
  [2, 3, 5, 2],
  [1, 4, 3, 7],
  [5, 5, 1, 1],
  [7, 9, 16, 13],
  [3, 3, 3, 3],
];
for (let i = 0; i < 50; i++)
  dimensions.push([
    1 + (random() % 19),
    1 + (random() % 19),
    1 + (random() % 29),
    1 + (random() % 29),
  ]);
for (const method of ["nearest", "bilinear", "rotsprite"])
  for (const [w, h, dw, dh] of dimensions) {
    const data = Array.from({ length: w * h }, () => {
      const c = random() % 5;
      return c === 0 ? [0, 0, 0, 0] : [c * 50, c * 20, 255 - c * 40, c === 3 ? 128 : 255];
    }).flat();
    cases.push({ w, h, dw, dh, method, data });
  }
fs.writeFileSync(
  root + "/oracle.lua",
  cases
    .map(
      (c, i) => `do
local s=Sprite(${c.w},${c.h},ColorMode.RGB)
local image=s.cels[1].image
local data={${c.data.join(",")}}
for y=0,${c.h - 1} do for x=0,${c.w - 1} do local k=(y*${c.w}+x)*4+1;image:drawPixel(x,y,app.pixelColor.rgba(data[k],data[k+1],data[k+2],data[k+3])) end end
app.command.SpriteSize{ui=false,width=${c.dw},height=${c.dh},method='${c.method === "nearest" ? "nearest-neighbor" : c.method}'}
local image=s.cels[1].image
local f=io.open('${root}/${i}.txt','w')
for y=0,image.height-1 do for x=0,image.width-1 do local c=image:getPixel(x,y);f:write(app.pixelColor.rgbaR(c)..','..app.pixelColor.rgbaG(c)..','..app.pixelColor.rgbaB(c)..','..app.pixelColor.rgbaA(c)..',') end end
f:close();s:close()
end`,
    )
    .join("\n"),
);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/oracle.lua"], {
  timeout: 30000,
});
let failures = 0;
for (let i = 0; i < cases.length; i++) {
  const c = cases[i],
    actual = resizeSpritePixels(
      { width: c.w, height: c.h, data: new Uint8ClampedArray(c.data) },
      c.dw,
      c.dh,
      c.method,
    ),
    expected = fs
      .readFileSync(root + "/" + i + ".txt", "utf8")
      .split(",")
      .filter(Boolean)
      .map(Number);
  const deltas = expected
    .map((n, j) => (n === actual.data[j] ? null : [j, n, actual.data[j]]))
    .filter(Boolean);
  if (deltas.length) {
    console.log(i, c.method, c.w, c.h, c.dw, c.dh, deltas.length, deltas.slice(0, 10));
    failures++;
  }
}
assert.equal(failures, 0, "Aseprite resize oracle mismatch");
console.log(`${cases.length} Aseprite resize fixtures match byte-for-byte.`);
