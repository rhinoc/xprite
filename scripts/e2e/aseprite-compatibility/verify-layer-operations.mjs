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
      'export * from "./packages/editor-core/src/timeline/timeline.ts";export * from "./packages/editor-core/src/timeline/layer-operations.ts";export * from "./packages/editor-core/src/canvas/blend-modes.ts";export * from "./packages/editor-core/src/import-export/aseprite/project.ts";export * from "./packages/editor-core/src/import-export/aseprite/index.ts";',
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
const p = (r, g, b, a = 255) => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([r, g, b, a]),
});
const cel = (pixels) => ({ pixels, x: 0, y: 0, opacity: 255, zIndex: 0 });
const layer = (id, extra = {}) => ({
  id,
  name: id,
  visible: true,
  locked: false,
  opacity: 255,
  flags: 3,
  ...extra,
});
let t = {
  composeGroups: true,
  activeLayer: 2,
  activeFrame: 0,
  layers: [
    layer("base"),
    layer("group", { kind: "group", opacity: 128 }),
    layer("child", { parentId: "group" }),
  ],
  frames: [{ duration: 100, cels: [cel(p(255, 0, 0)), null, cel(p(0, 0, 255))] }],
};
assert.deepEqual([...m.renderTimelineFrame(t, 1, 1, 0).data], [127, 0, 128, 255]);
assert.deepEqual(m.visibleTimelineLayers(t), [1, 2, 0]);
const hidden = {
  ...t,
  layers: t.layers.map((l) =>
    l.id === "group" ? { ...l, visible: false, locked: true, flags: l.flags | 32 } : l,
  ),
};
assert.deepEqual([...m.renderTimelineFrame(hidden, 1, 1, 0).data], [255, 0, 0, 255]);
assert.equal(m.layerEditable(hidden, 2), false);
assert.deepEqual(m.visibleTimelineLayers(hidden), [1, 0]);
const legacy = {
  ...t,
  composeGroups: false,
  layers: t.layers.map((l, i) => (i === 2 ? { ...l, blendMode: 1 } : l)),
};
assert.deepEqual(
  [...m.renderTimelineFrame(legacy, 1, 1, 0).data],
  [0, 0, 0, 255],
  "legacy group child blends into underlying root",
);
const refs = {
  ...t,
  layers: [layer("ref", { flags: 67 })],
  activeLayer: 0,
  frames: [
    {
      duration: 100,
      cels: [{ ...cel(p(1, 2, 3)), preciseBounds: { x: 1, y: 0, width: 2, height: 1 } }],
    },
  ],
};
assert.deepEqual(
  [...m.renderTimelineFrame(refs, 3, 1, 0).data],
  [0, 0, 0, 0, 1, 2, 3, 255, 1, 2, 3, 255],
);
assert.equal(m.renderTimelineFrame(refs, 3, 1, 0, undefined, false).data.some(Boolean), false);
const dup = m.duplicateLayers({ ...t, activeLayer: 1 });
assert.equal(dup.layers.length, 5);
assert.equal(dup.layers[4].parentId, dup.layers[3].id);
assert.notEqual(dup.frames[0].cels[4].pixels, t.frames[0].cels[2].pixels);
assert.equal(m.removeLayers(t, [1]).layers.length, 1);
const flat = m.flattenLayers(t, 1, 1);
assert.equal(flat.layers.length, 1);
assert.deepEqual([...flat.frames[0].cels[0].pixels.data], [127, 0, 128, 255]);
const merge = {
  ...t,
  layers: [layer("a"), layer("b")],
  activeLayer: 1,
  frames: [{ duration: 100, cels: [cel(p(255, 0, 0)), { ...cel(p(0, 0, 255)), x: 2 }] }],
};
const merged = m.mergeDown(merge);
assert.equal(merged.layers.length, 1);
assert.equal(merged.frames[0].cels[0].pixels.width, 3);
assert.deepEqual(
  [...merged.frames[0].cels[0].pixels.data],
  [255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255],
);
const bg = m.convertBackground(merge, 3, 1, [0, 255, 0, 255], true);
assert.equal(bg.activeLayer, 0);
assert.equal(bg.layers[0].name, "Background");
assert.deepEqual(
  [...bg.frames[0].cels[0].pixels.data],
  [0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
);
const reference = m.insertLayer(t, "Reference", "image", p(1, 2, 3));
assert.equal(m.layerEditable(reference, reference.activeLayer), false);
const image = m.renderTimelineFrame(t, 1, 1, 0);
const sprite = m.asepriteFromProject({ timeline: t, image });
assert.equal(sprite.layers[1].type, "group");
assert.equal(sprite.layers[2].childLevel, 1);
const encoded = await m.encodeAseprite(sprite);
const decoded = await m.decodeAseprite(encoded);
const project = m.projectFromAseprite(decoded);
assert.equal(project.timeline.composeGroups, false);
assert.deepEqual(
  [...m.renderTimelineFrame({ ...project.timeline, composeGroups: true }, 1, 1, 0).data],
  [...image.data],
);
assert.equal(project.timeline.layers[2].parentId, project.timeline.layers[1].id);
// Compile the actual upstream RGBA function bodies, supplying only their packed-color ABI.
const sourcePath = resolveAsepriteSource();
const source = await readFile(join(sourcePath, "src/doc/blend_funcs.cpp"), "utf8");
let asepriteSource =
  source.slice(
    source.indexOf("namespace {"),
    source.indexOf(
      "//////////////////////////////////////////////////////////////////////\n// GRAY blenders",
    ),
  ) + "\n}\n";
const header = `#include <algorithm>\n#include <cmath>\n#include <cstdint>\n#include <iostream>\n#define ABS(x) std::abs(x)\n#define MUL_UN8(a,b,t) ((t)=(a)*(uint16_t)(b)+128,(((t)>>8)+(t))>>8)\n#define DIV_UN8(a,b) (((uint16_t)(a)*255+((b)/2))/(b))\nnamespace doc {using color_t=uint32_t; const uint32_t rgba_a_mask=0xff000000,rgba_rgb_mask=0xffffff;const int rgba_a_shift=24;int rgba_getr(color_t c){return c&255;}int rgba_getg(color_t c){return (c>>8)&255;}int rgba_getb(color_t c){return (c>>16)&255;}int rgba_geta(color_t c){return c>>24;}int rgba_luma(color_t c){return (rgba_getr(c)*2126+rgba_getg(c)*7152+rgba_getb(c)*722)/10000;}color_t rgba(int r,int g,int b,int a){return (r&255)|((g&255)<<8)|((b&255)<<16)|((uint32_t)(a&255)<<24);}color_t rgba_blender_normal(color_t,color_t,int=255);}\n`;
const names = [
  "normal",
  "multiply_n",
  "screen_n",
  "overlay_n",
  "darken_n",
  "lighten_n",
  "color_dodge_n",
  "color_burn_n",
  "hard_light_n",
  "soft_light_n",
  "difference_n",
  "exclusion_n",
  "hsl_hue_n",
  "hsl_saturation_n",
  "hsl_color_n",
  "hsl_luminosity_n",
  "addition_n",
  "subtract_n",
  "divide_n",
];
const main = `int main(){using namespace doc; color_t(*fn[])(color_t,color_t,int)={${names.map((n) => "rgba_blender_" + n).join(",")}};uint32_t b,s;int m,o;while(std::cin>>m>>b>>s>>o)std::cout<<fn[m](b,s,o)<<'\\n';}`;
const dir = await mkdtemp(join(tmpdir(), "ase-layer-oracle-"));
try {
  await writeFile(join(dir, "oracle.cpp"), header + asepriteSource + main);
  execFileSync("clang++", [
    "-std=c++17",
    "-O2",
    join(dir, "oracle.cpp"),
    "-o",
    join(dir, "oracle"),
  ]);
  let seed = 91323;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const cases = [];
  for (let mode = 0; mode < 19; mode++)
    for (let i = 0; i < 300; i++) cases.push([mode, rnd(), rnd(), rnd() % 256]);
  const results = execFileSync(join(dir, "oracle"), {
    input: cases.map((c) => c.join(" ")).join("\n") + "\n",
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map(Number);
  const unpack = (v) =>
    new Uint8ClampedArray([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24]);
  cases.forEach(([mode, b, s, o], i) => {
    const d = unpack(b);
    m.blendAt(d, 0, unpack(s), 0, o, mode);
    assert.deepEqual(d, unpack(results[i]), `Aseprite mode ${mode}, ${b}, ${s}, ${o}`);
  });
  console.log(
    `Layers: grouping, isolated opacity, visibility/lock, hierarchy, duplicate/delete, dynamic merge, flatten, background conversion, reference insertion, ASE encode/decode, ${cases.length} upstream C++ blend oracle cases passed.`,
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
// BlenderHelper mask skip is separate from blender_normal: a fully-zero upper
// cel must not erase hidden RGB already held by a transparent lower image.
const hiddenRgb = {
  activeFrame: 0,
  activeLayer: 0,
  layers: [layer("hidden-rgb"), layer("mask")],
  frames: [{ duration: 100, cels: [cel(p(61, 61, 61, 0)), cel(p(0, 0, 0, 0))] }],
};
assert.deepEqual([...m.renderTimelineFrame(hiddenRgb, 1, 1, 0).data], [61, 61, 61, 0]);
