import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";
const bundle = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/timeline/viewport-renderer.ts";export * from "./packages/editor-core/src/timeline/timeline.ts";export * from "./packages/editor-core/src/editor/RasterEditor.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);
const sourcePath = resolveAsepriteSource();
const cpp = await readFile(join(sourcePath, "src/render/render.cpp"), "utf8");
const a = cpp.lastIndexOf(
    "template<class DstTraits, class SrcTraits>",
    cpp.indexOf("void composite_image_general("),
  ),
  b = cpp.indexOf("template<class DstTraits, class SrcTraits>", a + 10);
const asepriteSource = cpp.slice(a, b);
const header = `#include <algorithm>\n#include <cmath>\n#include <cstdint>\n#include <iostream>\n#include <vector>\n#include <cassert>\n#include "gfx/clip.h"\n#include "render/projection.h"\n#define ASSERT(x) assert(x)\nusing BlendMode=int;using tile_flags=int;struct Palette{};struct Traits {static const int pixel_format=0;};\nnamespace render {Zoom::Zoom(int num,int den):m_num(num),m_den(den),m_internalScale(double(num)/den){}}\nstruct Image {int w,h;std::vector<uint32_t> p;Image(int w,int h):w(w),h(h),p(w*h){}int width()const{return w;}int height()const{return h;}int pixelFormat()const{return 0;}gfx::Rect bounds()const{return gfx::Rect(0,0,w,h);}};\ntemplate<class T> uint32_t* get_pixel_address_fast(Image* i,int x,int y){return i->p.data()+y*i->w+x;}template<class T> const uint32_t* get_pixel_address_fast(const Image* i,int x,int y){return i->p.data()+y*i->w+x;}\ntemplate<class D,class S> struct BlenderHelper {BlenderHelper(Image*,const Image*,const Palette*,BlendMode,bool){}uint32_t operator()(uint32_t,uint32_t s,int){return s;}};\n`;
const main = `int main(){int num,den,sw,sh,cx,cy,w,h;float bx,by,bw,bh;while(std::cin>>num>>den>>bx>>by>>bw>>bh>>sw>>sh>>cx>>cy>>w>>h){Image src(sw,sh),dst(w,h);for(int i=0;i<sw*sh;i++)src.p[i]=0xff000000u|((i+1)&0xffffff);render::Projection proj(doc::PixelRatio(1,1),render::Zoom(num,den));gfx::RectF bounds(bx,by,bw,bh),scaled=proj.apply(bounds),clip=gfx::RectF(gfx::Rect(cx,cy,w,h)).createIntersection(scaled);if(!clip.isEmpty())composite_image_general<Traits,Traits>(&dst,&src,nullptr,gfx::ClipF(double(clip.x)-cx,double(clip.y)-cy,clip.x-scaled.x,clip.y-scaled.y,clip.w,clip.h),255,0,proj.scaleX()*bounds.w/double(sw),proj.scaleY()*bounds.h/double(sh),true,0);std::cout.write(reinterpret_cast<const char*>(dst.p.data()),dst.p.size()*4);}}`;
const layer = (id, extra = {}) => ({
  id,
  name: id,
  visible: true,
  locked: false,
  opacity: 255,
  flags: 3,
  ...extra,
});
const pixels = (w, h) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const n = i + 1;
    data.set([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, 255], i * 4);
  }
  return { width: w, height: h, data };
};
const cases = [];
let seed = 77321;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
for (const [num, den] of [
  ...[64, 48, 32, 24, 16, 12, 8, 6, 5, 4, 3, 2].map((d) => [1, d]),
  ...[1, 2, 3, 4, 5, 6, 8, 12, 16, 24, 32, 48, 64].map((n) => [n, 1]),
])
  for (let i = 0; i < 18; i++) {
    const bx = ((rnd() % 151) - 75) / 7,
      by = ((rnd() % 151) - 75) / 11,
      bw = ((rnd() % 200) + 1) / 3,
      bh = ((rnd() % 180) + 1) / 7,
      sw = (rnd() % 131) + 1,
      sh = (rnd() % 97) + 1;
    const cx = Math.trunc((bx * num) / den) + (i % 3 === 0 ? 7 : -5),
      cy = Math.trunc((by * num) / den) + (i % 4 === 0 ? 11 : -3);
    cases.push([num, den, bx, by, bw, bh, sw, sh, cx, cy, 79, 67]);
  }
const dir = await mkdtemp(join(tmpdir(), "ase-viewport-oracle-"));
try {
  await writeFile(join(dir, "oracle.cpp"), header + asepriteSource + main);
  execFileSync("clang++", [
    "-std=c++17",
    "-O2",
    "-D_DEBUG",
    "-I" + join(sourcePath, "src"),
    "-I" + join(sourcePath, "laf"),
    join(dir, "oracle.cpp"),
    "-o",
    join(dir, "oracle"),
  ]);
  const raw = execFileSync(join(dir, "oracle"), {
    input: cases.map((c) => c.join(" ")).join("\n") + "\n",
    maxBuffer: 32 * 1024 * 1024,
  });
  let offset = 0;
  cases.forEach(([num, den, bx, by, bw, bh, sw, sh, x, y, width, height], i) => {
    const image = pixels(sw, sh),
      t = {
        activeLayer: 0,
        activeFrame: 0,
        layers: [layer("ref", { flags: 67 })],
        frames: [
          {
            duration: 100,
            cels: [
              {
                pixels: image,
                x: Math.floor(bx),
                y: Math.floor(by),
                opacity: 255,
                zIndex: 0,
                preciseBounds: { x: bx, y: by, width: bw, height: bh },
              },
            ],
          },
        ],
      };
    const actual = m.renderTimelineViewport(t, { x, y, width, height, zoom: num / den }),
      expected = raw.subarray(offset, offset + width * height * 4);
    offset += width * height * 4;
    const at = actual.data.findIndex((v, j) => v !== expected[j]);
    assert.equal(
      at,
      -1,
      `Upstream sampling case${i} ${JSON.stringify(cases[i])} byte${at}, actual${actual.data.slice(at, at + 4)}, expected${expected.subarray(at, at + 4)}`,
    );
  });
} finally {
  await rm(dir, { recursive: true, force: true });
}
// High-resolution source recovers individual original pixels when zoom compensates fitting.
const photo = pixels(128, 128),
  t = {
    composeGroups: true,
    activeLayer: 1,
    activeFrame: 0,
    layers: [layer("group", { kind: "group" }), layer("ref", { flags: 67, parentId: "group" })],
    frames: [
      {
        duration: 100,
        cels: [
          null,
          {
            pixels: photo,
            x: 0,
            y: 0,
            opacity: 255,
            zIndex: 0,
            preciseBounds: { x: 0, y: 0, width: 4, height: 4 },
          },
        ],
      },
    ],
  };
const stats = {};
const high = m.renderTimelineViewport(
  t,
  { x: 0, y: 0, width: 128, height: 128, zoom: 32 },
  0,
  undefined,
  stats,
);
assert.deepEqual(high.data, photo.data);
assert.equal(stats.outputBytes, 128 * 128 * 4);
assert.ok(stats.scratchBytes <= 2 * 32 * 32 * 4);
assert.equal(stats.tiles, 16);
const crop = m.renderTimelineViewport(t, { x: 23, y: 41, width: 53, height: 37, zoom: 32 });
for (let y = 0; y < 37; y++)
  assert.deepEqual(
    crop.data.slice(y * 53 * 4, (y + 1) * 53 * 4),
    photo.data.slice(((y + 41) * 128 + 23) * 4, ((y + 41) * 128 + 76) * 4),
  );
// Modern group/blend composition and overlays use exactly the same engine as existing image output at1x.
for (let mode = 0; mode < 19; mode++) {
  const g = {
    ...t,
    layers: [
      layer("base"),
      layer("group", { kind: "group", opacity: 137, blendMode: mode }),
      layer("ref", { flags: 67, parentId: "group", blendMode: mode }),
    ],
    activeLayer: 0,
    frames: [
      {
        duration: 100,
        cels: [
          { pixels: pixels(4, 4), x: 0, y: 0, opacity: 199, zIndex: 0 },
          null,
          t.frames[0].cels[1],
        ],
      },
    ],
  };
  const overlay = { pixels: pixels(2, 2), x: 1, y: 1 };
  const v = m.renderTimelineViewport(g, { x: 0, y: 0, width: 4, height: 4, zoom: 1 }, 0, overlay),
    normal = m.renderTimelineFrame(g, 4, 4, 0, overlay);
  assert.deepEqual(v.data, normal.data, `Group mode${mode}`);
}
// A huge projected canvas still allocates only visible output + fixed scratch.
const giant = {
  ...t,
  layers: t.layers,
  frames: [
    {
      duration: 100,
      cels: [
        null,
        { ...t.frames[0].cels[1], preciseBounds: { x: 0, y: 0, width: 16384, height: 16384 } },
      ],
    },
  ],
};
const budget = {};
m.renderTimelineViewport(
  giant,
  { x: 500_000, y: 400_000, width: 257, height: 193, zoom: 64 },
  0,
  undefined,
  budget,
);
assert.equal(budget.outputBytes, 257 * 193 * 4);
assert.ok(budget.scratchBytes <= 8192);
// Browser-independent actual editor: deferred shape preview is retained and never mutates pixels.
const e = new m.RasterEditor({ width: 4, height: 4, data: new Uint8ClampedArray(64) });
e.addReferenceLayer(photo);
e.addLayer("Ink");
e.setSettings({ tool: "filled_rectangle", foreground: [255, 0, 0, 255] });
e.pointerDown({ x: 1, y: 1 });
e.pointerMove({ x: 2, y: 2 });
const preview = e.previewViewport({ x: 0, y: 0, width: 128, height: 128, zoom: 32 });
assert.deepEqual(
  preview.data.slice((40 * 128 + 40) * 4, (40 * 128 + 40) * 4 + 4),
  [255, 0, 0, 255],
);
e.cancelGesture();
assert.notDeepEqual(
  e
    .previewViewport({ x: 0, y: 0, width: 128, height: 128, zoom: 32 })
    .data.slice((40 * 128 + 40) * 4, (40 * 128 + 40) * 4 + 4),
  [255, 0, 0, 255],
);
console.log(
  `Reference viewport: ${cases.length} actual upstream sampling cases, photo detail32x, cropped tile seams, bounded scratch,19 blend/group/overlay cases and actual-editor preview/cancel pass.`,
);
