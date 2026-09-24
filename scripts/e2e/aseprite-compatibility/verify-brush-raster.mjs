import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { transform } from "esbuild";

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
int main(){for(int t=0;t<3;t++)for(int s=1;s<=9;s++)for(int a=-180;a<=180;a++){Brush b;b.m_type=t;b.m_size=s;b.m_angle=a;b.regenerate();int n=b.m_image->n,w=std::min(9,n),offset=(w-n-1)/2;std::cout<<t<<","<<s<<","<<a<<","<<w<<",";for(int y=0;y<w;y++)for(int x=0;x<w;x++)std::cout<<b.m_image->p[(y-offset)*n+x-offset];std::cout<<"\\n";}}
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
    maxBuffer: 10 * 1024 * 1024,
  });
  const { code } = await transform(
    await readFile(
      new URL("../../../packages/editor-core/src/drawing/brush-preview.ts", import.meta.url),
      "utf8",
    ),
    { loader: "ts", format: "esm" },
  );
  const { asepriteBrushMask } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  const shapes = ["circle", "square", "line"];
  let count = 0;
  for (const row of oracle.trim().split("\n")) {
    const [type, size, angle, width, pixels] = row.split(",");
    const mask = asepriteBrushMask({ shape: shapes[+type], size: +size, angle: +angle });
    assert.equal(mask.width, +width);
    assert.equal(mask.height, +width);
    assert.equal(mask.pixels.join(""), pixels, `${shapes[+type]} size=${size} angle=${angle}`);
    count++;
  }
  for (const shape of shapes)
    for (const angle of [-180, -45, 0, 22, 45, 90, 180])
      assert.deepEqual(
        asepriteBrushMask({ shape, size: 64, angle }),
        asepriteBrushMask({ shape, size: 9, angle }),
      );
  console.log(
    `${count} thumbnail masks match compiled upstream C++ raster; 21 size-clamp checks pass. GUI popup capture remains separate.`,
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
