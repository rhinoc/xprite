import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { transform, build } from "esbuild";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";
// This compiles the real upstream raster algorithms, isolated from the GUI.
const source = resolveAsepriteSource();
const algo = await readFile(join(source, "src/doc/algo.cpp"), "utf8");
const brush = await readFile(join(source, "src/doc/brush.cpp"), "utf8");
const polygon = await readFile(join(source, "src/doc/algorithm/polygon.cpp"), "utf8");
const fn = (text, name) => {
  const start = text.indexOf(name);
  assert(start >= 0, name);
  const begin = text.indexOf("{", start);
  let depth = 1,
    end = begin + 1;
  for (; depth; end++) {
    if (text[end] === "{") depth++;
    if (text[end] === "}") depth--;
  }
  return text.slice(start, end);
};
const body = fn(brush, "void Brush::regenerate()").replace(
  "void Brush::regenerate()",
  "void regenerate()",
);
const cpp = `#include <algorithm>
#include <vector>
#include <cmath>
#include <memory>
#include <cassert>
#include <iostream>
#define ASSERT assert
#define ABS std::abs
constexpr double PI=3.14159265358979323846;
using AlgoPixel=void(*)(int,int,void*);
using AlgoHLine=void(*)(int,int,int,void*);
namespace gfx {struct Point {int x=0,y=0;Point(){}Point(int X,int Y):x(X),y(Y){}bool operator!=(const Point&p)const{return x!=p.x||y!=p.y;}};}
${fn(algo, "void algo_line_continuous(")}
${fn(algo, "static int adjust_ellipse_args(")}
${fn(algo, "void algo_ellipsefill(")}
namespace doc {namespace algorithm {bool createUnion(std::vector<int>&,int,int&);void polygon(int,const int*,void*,AlgoHLine);}}
${polygon.slice(polygon.indexOf("namespace doc {"))}
struct Image {int n;std::vector<int> p;Image(int N):n(N),p(N*N){}static Image* create(int,int n,int){return new Image(n);}};
struct BitmapTraits {static const int min_value=0,max_value=1;};
constexpr int IMAGE_BITMAP=0,kCircleBrushType=0,kSquareBrushType=1,kLineBrushType=2;
void pixel(int x,int y,void*data){auto im=(Image*)data;if(x>=0&&y>=0&&x<im->n&&y<im->n)im->p[y*im->n+x]=1;}
void algo_hline(int x,int y,int end,void*d){for(;x<=end;x++)pixel(x,y,d);}
void clear_image(Image*i,int v){std::fill(i->p.begin(),i->p.end(),v);}
void fill_ellipse(Image*i,int x,int y,int x1,int y1,int h,int v,int){algo_ellipsefill(x,y,x1,y1,h,v,i,algo_hline);}
void draw_line(Image*i,int x,int y,int x1,int y1,int){algo_line_continuous(x,y,x1,y1,i,pixel);}
struct Brush {int m_type,m_size,m_angle;std::unique_ptr<Image>m_image,m_maskBitmap;gfx::Point m_center;void clean(){}void resetBounds(){m_center=gfx::Point(m_image->n/2,m_image->n/2);}
${body}
};
int main(){for(int t=0;t<3;t++)for(int s=1;s<=64;s++)for(int a=-180;a<=180;a+=15){Brush b;b.m_type=t;b.m_size=s;b.m_angle=a;b.regenerate();int n=b.m_image->n,w=n,offset=0;std::cout<<t<<","<<s<<","<<a<<","<<w<<",";for(int y=0;y<w;y++)for(int x=0;x<w;x++)std::cout<<b.m_image->p[(y-offset)*n+x-offset];std::cout<<"\\n";}}
`;
const dir = await mkdtemp(join(tmpdir(), "aseprite-brush-parity-"));
try {
  await writeFile(join(dir, "oracle.cpp"), cpp);
  execFileSync("clang++", [
    "-std=c++17",
    "-O2",
    join(dir, "oracle.cpp"),
    "-o",
    join(dir, "oracle"),
  ]);
  const oracle = execFileSync(join(dir, "oracle"), [], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
  const { code } = await transform(
    await readFile(
      new URL("../../../packages/editor-core/src/canvas/raster/geometry.ts", import.meta.url),
      "utf8",
    ),
    { loader: "ts", format: "esm" },
  );
  const { brushMask } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  const shapes = ["circle", "square", "line"];
  let count = 0;
  for (const row of oracle.trim().split("\n")) {
    const [type, size, angle, width, pixels] = row.split(",");
    const mask = brushMask({ shape: shapes[+type], size: +size, angle: +angle });
    assert.equal(mask.width, +width);
    assert.equal(mask.height, +width);
    assert.equal(
      Array.from(mask.data).join(""),
      pixels,
      `${shapes[+type]} size=${size} angle=${angle}`,
    );
    count++;
  }
  console.log(`${count} full brush masks match compiled upstream C++ (sizes 1..64, 25 angles).`);
} finally {
  await rm(dir, { recursive: true, force: true });
}

const bundle = await build({
  entryPoints: ["packages/editor-core/src/canvas/raster/index.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const raster = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const image = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});
const options = { color: [255, 0, 0, 255], brush: { shape: "circle", size: 1, angle: 0 } };
let im = image(5, 5),
  before = [];
raster.paintLine(
  im,
  { x: 0, y: 0 },
  { x: 4, y: 4 },
  { ...options, beforeWrite: (r) => before.push(raster.samplePixel(im, r)) },
);
assert.deepEqual(before, Array(5).fill([0, 0, 0, 0]));
assert.deepEqual(raster.alphaBounds(im), { x: 0, y: 0, width: 5, height: 5 });
for (let y = 0; y < 5; y++)
  for (let x = 0; x < 5; x++) assert.equal(im.data[(y * 5 + x) * 4 + 3], x === y ? 255 : 0);
assert.deepEqual(raster.paintLine(im, { x: 0, y: 0 }, { x: 4, y: 4 }, options), { dirty: null });
raster.eraseStroke(im, [{ x: 2, y: 2 }], options);
assert.equal(raster.samplePixel(im, { x: 2, y: 2 })[3], 0);
im = image(4, 4);
const mask = raster.polygonMask(
  [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
  ],
  4,
  4,
);
assert.deepEqual(Array.from(mask.data), [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
raster.paintLine(im, { x: 0, y: 1 }, { x: 3, y: 1 }, { ...options, selection: mask });
assert.deepEqual(raster.alphaBounds(im), { x: 1, y: 1, width: 2, height: 1 });
im = image(3, 3);
raster.paintLine(im, { x: 1, y: 0 }, { x: 1, y: 2 }, options);
raster.floodFill(
  im,
  { x: 0, y: 0 },
  { ...options, color: [0, 255, 0, 255], tolerance: 0, contiguous: true },
);
assert.deepEqual(raster.samplePixel(im, { x: 2, y: 0 }), [0, 0, 0, 0]);
raster.floodFill(
  im,
  { x: 2, y: 0 },
  { ...options, color: [0, 0, 255, 255], tolerance: 0, contiguous: false },
);
assert.deepEqual(raster.samplePixel(im, { x: 2, y: 2 }), [0, 0, 255, 255]);
im = image(3, 3);
raster.paintStroke(im, [{ x: 1, y: 1 }], options);
raster.blurStroke(im, [{ x: 1, y: 1 }], options);
assert.deepEqual(raster.samplePixel(im, { x: 1, y: 1 }), [255, 0, 0, 28]);
assert.deepEqual(raster.normalBlend([0, 0, 255, 255], [255, 0, 0, 128], 255), [128, 0, 127, 255]);
assert.deepEqual(raster.mergeBlend([255, 0, 0, 255], [0, 0, 255, 255], 128), [127, 0, 128, 255]);
assert.deepEqual(
  raster.polygonMask(
    [
      { x: -8, y: 1 },
      { x: -4, y: 1 },
      { x: -4, y: 3 },
    ],
    4,
    4,
  ).data,
  new Uint8Array(16),
);
console.log(
  "Raster fixtures pass: diagonal coverage, before-write ordering, tight dirty/no-op, eraser, polygon, selection, fill connectivity, blur alpha, blend rounding, offscreen polygon.",
);
const textBundle = await build({
  entryPoints: ["packages/editor-core/src/drawing/text/text.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { paintText } = await import(
  `data:text/javascript;base64,${Buffer.from(textBundle.outputFiles[0].text).toString("base64")}`
);
im = image(8, 8);
const font = {
  height: 2,
  lineHeight: 3,
  glyphs: { A: { width: 2, height: 2, advance: 3, alpha: Uint8Array.from([255, 0, 255, 255]) } },
};
paintText(im, { x: 0, y: 0 }, "A\nA", font, 2, options);
assert.deepEqual(raster.samplePixel(im, { x: 0, y: 6 }), [0, 0, 0, 0]);
assert.deepEqual(raster.samplePixel(im, { x: 6, y: 0 }), [255, 0, 0, 255]);
assert.deepEqual(raster.samplePixel(im, { x: 3, y: 0 }), [0, 0, 0, 0]);
assert.deepEqual(raster.samplePixel(im, { x: 3, y: 3 }), [255, 0, 0, 255]);
im = image(3, 1);
const coverage = new Set();
raster.paintStroke(
  im,
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
  { ...options, opacity: 128, coverage },
);
raster.paintStroke(
  im,
  [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ],
  { ...options, opacity: 128, coverage },
);
assert.deepEqual([im.data[3], im.data[7], im.data[11]], [128, 128, 128]);
console.log(
  "Bitmap text integer-scale/source single-run and cross-segment opacity coverage checks pass.",
);
// Independent immutable-source four-neighbour reachability oracle for scanline optimization.
let seed = 42;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
for (let test = 0; test < 150; test++) {
  const actual = image(11, 9);
  for (let i = 0; i < actual.data.length; i += 4) {
    actual.data[i] = (random() % 5) * 20;
    actual.data[i + 3] = random() % 3 ? 255 : 0;
  }
  const original = actual.data.slice(),
    expected = original.slice(),
    start = { x: random() % 11, y: random() % 9 },
    selection = {
      x: 0,
      y: 0,
      width: 11,
      height: 9,
      data: Uint8Array.from({ length: 99 }, () => (random() % 5 ? 1 : 0)),
    },
    tolerance = random() % 45;
  const target = Array.from(
      original.slice((start.y * 11 + start.x) * 4, (start.y * 11 + start.x) * 4 + 4),
    ),
    seen = new Set(),
    queue = [start.y * 11 + start.x];
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h];
    if (seen.has(k)) continue;
    seen.add(k);
    if (!selection.data[k]) continue;
    const c = Array.from(original.slice(k * 4, k * 4 + 4));
    if (!((!c[3] && !target[3]) || c.every((v, i) => Math.abs(v - target[i]) <= tolerance)))
      continue;
    expected.set([9, 8, 7, 255], k * 4);
    const x = k % 11,
      y = Math.floor(k / 11);
    if (x) queue.push(k - 1);
    if (x < 10) queue.push(k + 1);
    if (y) queue.push(k - 11);
    if (y < 8) queue.push(k + 11);
  }
  raster.floodFill(actual, start, {
    ...options,
    color: [9, 8, 7, 255],
    selection,
    tolerance,
    contiguous: true,
  });
  assert.deepEqual(actual.data, expected, `flood oracle ${test}`);
}
console.log("150 scanline fill fixtures match independent immutable-source reachability oracle.");
