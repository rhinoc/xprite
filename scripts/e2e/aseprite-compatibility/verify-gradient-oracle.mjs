import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";
const source = resolveAsepriteSource();
const gradient = await readFile(join(source, "src/render/gradient.cpp"), "utf8");
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
const dir = await mkdtemp(join(tmpdir(), "aseprite-gradient-"));
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/drawing/shapes/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { paintGradient } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
try {
  const cpp = `#include <algorithm>\n#include <cmath>\n#include <iostream>\n#include <vector>\n#include <cassert>\n#include <cstdint>\n#define ASSERT assert
namespace gfx{struct Point{int x,y;Point(int x_,int y_):x(x_),y(y_){}bool operator==(Point p)const{return x==p.x&&y==p.y;}};}
namespace base{template<typename T>struct Vector2d{T x=0,y=0;Vector2d(){}Vector2d(T X,T Y):x(X),y(Y){}Vector2d operator-(Vector2d v)const{return{x-v.x,y-v.y};}Vector2d operator+(Vector2d v)const{return{x+v.x,y+v.y};}Vector2d operator/(T v)const{return{x/v,y/v};}Vector2d&operator-=(Vector2d v){x-=v.x;y-=v.y;return *this;}T operator*(Vector2d v)const{return x*v.x+y*v.y;}T magnitude()const{return std::sqrt(x*x+y*y);}Vector2d normalize()const{return *this/magnitude();}};}
namespace doc{using color_t=uint32_t;constexpr int IMAGE_RGB=0;constexpr color_t rgba_rgb_mask=0xffffff;int rgba_getr(color_t c){return c&255;}int rgba_getg(color_t c){return(c>>8)&255;}int rgba_getb(color_t c){return(c>>16)&255;}int rgba_geta(color_t c){return c>>24;}color_t rgba(int r,int g,int b,int a){return r|(g<<8)|(b<<16)|(uint32_t(a)<<24);}struct Image{std::vector<color_t>data;Image():data(81){}int pixelFormat(){return IMAGE_RGB;}int width(){return 9;}int height(){return 9;}void clear(color_t c){std::fill(data.begin(),data.end(),c);}};struct RgbTraits{};template<typename T>struct LockImageBits{Image*i;LockImageBits(Image*p):i(p){}auto begin(){return i->data.begin();}};}
namespace render {int bayer(int n,int x,int y){if(n==1)return 0;int a[2][2]={{0,2},{3,1}};return 4*bayer(n/2,x%(n/2),y%(n/2))+a[y/(n/2)][x/(n/2)];}struct DitheringMatrix{int n;int rows()const{return n;}int cols()const{return n;}int maxValue()const{return n*n-1;}int operator()(int y,int x)const{return bayer(n,x%n,y%n);}};
${fn(gradient, "void render_rgba_linear_gradient(")}
${fn(gradient, "void render_rgba_radial_gradient(")}
}
int main(){for(int type=0;type<2;type++)for(int size: {1,2,4,8})for(int a=0;a<4;a++)for(int direction=0;direction<4;direction++){doc::Image image;gfx::Point p0(direction==3?8:0,direction==3?8:0),p1(direction==0?8:direction==1?0:direction==3?0:8,direction==0?0:direction==3?0:8);auto c0=doc::rgba(231,15,101,a==1||a==3?0:255),c1=doc::rgba(11,220,180,a==2||a==3?0:255);if(type)render::render_rgba_radial_gradient(&image,{0,0},p0,p1,c0,c1,{size});else render::render_rgba_linear_gradient(&image,{0,0},p0,p1,c0,c1,{size});std::cout<<type<<","<<size<<","<<a<<","<<direction<<":";for(auto c:image.data)std::cout<<doc::rgba_getr(c)<<","<<doc::rgba_getg(c)<<","<<doc::rgba_getb(c)<<","<<doc::rgba_geta(c)<<";";std::cout<<"\\n";}}`;
  await writeFile(join(dir, "oracle.cpp"), cpp);
  execFileSync("clang++", [
    "-std=c++17",
    "-O2",
    join(dir, "oracle.cpp"),
    "-o",
    join(dir, "oracle"),
  ]);
  const rows = execFileSync(join(dir, "oracle"), [], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  })
    .trim()
    .split("\n");
  for (const row of rows) {
    const [h, data] = row.split(":"),
      [type, size, a, direction] = h.split(",").map(Number);
    const image = { width: 9, height: 9, data: new Uint8ClampedArray(324) };
    const p0 = { x: direction === 3 ? 8 : 0, y: direction === 3 ? 8 : 0 },
      p1 = {
        x: direction === 0 ? 8 : direction === 1 ? 0 : direction === 3 ? 0 : 8,
        y: direction === 0 ? 0 : direction === 3 ? 0 : 8,
      };
    paintGradient(image, p0, p1, {
      color: [231, 15, 101, a === 1 || a === 3 ? 0 : 255],
      background: [11, 220, 180, a === 2 || a === 3 ? 0 : 255],
      gradientType: type ? "radial" : "linear",
      gradientDither: size === 1 ? "none" : `bayer${size}`,
      brush: { shape: "circle", size: 1, angle: 0 },
    });
    assert.deepEqual(
      [...image.data],
      data
        .split(";")
        .filter(Boolean)
        .flatMap((p) => p.split(",").map(Number)),
      h,
    );
  }
  console.log(
    `PASS ${rows.length} Aseprite C++ gradient cases: linear/radial, all Bayer sizes, transparent stops, reversed/degenerate vectors`,
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
