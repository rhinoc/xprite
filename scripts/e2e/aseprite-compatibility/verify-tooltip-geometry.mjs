import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { transform } from "esbuild";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";

// Compile the actual source branches, rather than a second handwritten port.
const sourceRoot = resolveAsepriteSource();
const [tips, theme, rect, base, ts] = await Promise.all([
  readFile(join(sourceRoot, "src/ui/tooltips.cpp"), "utf8"),
  readFile(join(sourceRoot, "src/ui/theme.cpp"), "utf8"),
  readFile(join(sourceRoot, "laf/gfx/rect.h"), "utf8"),
  readFile(join(sourceRoot, "src/ui/base.h"), "utf8"),
  readFile(
    new URL("../../../packages/ui/src/components/tooltip/geometry.ts", import.meta.url),
    "utf8",
  ),
]);
function block(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing upstream marker: ${marker}`);
  const open = source.indexOf("{", start);
  let depth = 1,
    end = open + 1;
  for (; depth && end < source.length; end++) {
    if (source[end] === "{") depth++;
    if (source[end] === "}") depth--;
  }
  assert.equal(depth, 0);
  return source.slice(open + 1, end - 1);
}
const pointAt = block(tips, "bool TipWindow::pointAt");
const placements = block(pointAt, "switch (arrowAlign)");
const retry = block(pointAt, "switch (trycount)");
const intersection = block(rect, "bool intersects(const RectT& rc) const");
const paint = block(theme, "void Theme::paintTooltip");
const arrowStart = paint.indexOf("gfx::Rect clip,");
const arrowEnd = paint.indexOf("IntersectClip intClip");
assert.ok(arrowStart >= 0 && arrowEnd > arrowStart);
const arrowCode = paint.slice(arrowStart, arrowEnd);
const alignments = Object.fromEntries(
  ["LEFT", "RIGHT", "TOP", "BOTTOM"].map((name) => {
    const match = base.match(new RegExp(`\\b${name} = (0x[0-9a-fA-F]+)`));
    assert.ok(match, name);
    return [name, Number(match[1])];
  }),
);
const names = [
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
const flag = (name) => name.split("-").reduce((a, b) => a | alignments[b.toUpperCase()], 0);
const code = `#include <algorithm>
#include <iostream>
${Object.entries(alignments)
  .map(([k, v]) => `constexpr int ${k}=${v};`)
  .join("\n")}
namespace gfx {
struct Rect { int x=0,y=0,w=0,h=0; Rect(){} Rect(int X,int Y,int W,int H):x(X),y(Y),w(W),h(H){} int x2()const{return x+w;} int y2()const{return y+h;} bool isEmpty()const{return w<=0||h<=0;} bool intersects(const Rect& rc)const { ${intersection} } };
struct Size {int w,h;};
}
int main(){
 int a;
 gfx::Rect m_target, work, bounds;
 int w,h;
 while(std::cin>>a>>m_target.x>>m_target.y>>m_target.w>>m_target.h>>w>>h>>work.x>>work.y>>work.w>>work.h>>bounds.x>>bounds.y>>bounds.w>>bounds.h){
  int arrowAlign=a,x=m_target.x,y=m_target.y,trycount=0;
  for(;trycount<4;++trycount){
   switch(arrowAlign){${placements}}
   const gfx::Rect displayBounds=work;
   ${pointAt.match(/x = std::clamp\(x, displayBounds[^\n]+/)[0]}
   ${pointAt.match(/y = std::clamp\(y, displayBounds[^\n]+/)[0]}
   if(m_target.intersects(gfx::Rect(x,y,w,h))){switch(trycount){${retry}}} else break;
  }
  std::cout<<(trycount<4)<<' '<<arrowAlign<<' '<<x<<' '<<y<<' ';
  arrowAlign=a;
  const gfx::Rect target=m_target;
  const gfx::Size topLeft{10,10},center{12,10},bottomRight{10,12};
  ${arrowCode}
  std::cout<<clip.x<<' '<<clip.y<<' '<<clip.w<<' '<<clip.h<<' '<<rc.x<<' '<<rc.y<<' '<<rc.w<<' '<<rc.h<<'\\n';
 }
}`;
const compiled = await transform(ts, { loader: "ts", format: "esm" });
const { tooltipPosition: position, tooltipArrow: arrow } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`
);
let seed = 0x73ac0021;
function random(n) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}
const cases = [];
for (const preferred of names) {
  // Odd dimensions, negative origins, empty targets, workarea too small,
  // targets partly outside workarea, and targets entirely covering it.
  for (let i = 0; i < 1250; i++)
    cases.push({
      preferred,
      target: {
        x: random(2400) - 400,
        y: random(1500) - 300,
        width: random(250),
        height: random(180),
      },
      size: { width: random(900) + 1, height: random(500) + 1 },
      work: {
        x: random(301) - 150,
        y: random(301) - 150,
        width: random(2100) + 1,
        height: random(1200) + 1,
      },
      bounds: {
        x: random(1000) - 500,
        y: random(1000) - 500,
        width: random(600) + 32,
        height: random(400) + 32,
      },
    });
}
const fields = (r) => [r.x, r.y, r.width, r.height];
const temp = await mkdtemp(join(tmpdir(), "aseprite-tooltip-oracle-"));
try {
  await writeFile(join(temp, "oracle.cpp"), code);
  const build = spawnSync(
    "c++",
    ["-std=c++17", "-O2", join(temp, "oracle.cpp"), "-o", join(temp, "oracle")],
    { encoding: "utf8" },
  );
  assert.equal(build.status, 0, build.stderr);
  const input = cases
    .map((c) =>
      [
        flag(c.preferred),
        ...fields(c.target),
        c.size.width,
        c.size.height,
        ...fields(c.work),
        ...fields(c.bounds),
      ].join(" "),
    )
    .join("\n");
  const result = spawnSync(join(temp, "oracle"), [], {
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split("\n");
  assert.equal(rows.length, cases.length);
  let absent = 0,
    flipped = 0;
  rows.forEach((row, i) => {
    const [ok, align, x, y, ...coords] = row.split(" ").map(Number);
    const c = cases[i],
      actual = position(c.target, c.size, c.work, c.preferred);
    const expected = ok
      ? { bounds: { x, y, ...c.size }, placement: names.find((n) => flag(n) === align) }
      : null;
    assert.deepEqual(actual, expected, `position case ${i}: ${JSON.stringify(c)}`);
    if (!ok) absent++;
    else if (actual.placement !== c.preferred) flipped++;
    const actualArrow = arrow(c.bounds, c.target, c.preferred);
    assert.deepEqual(
      [...fields(actualArrow.clip), ...fields(actualArrow.atlas)],
      coords,
      `arrow case ${i}`,
    );
  });
  assert.ok(absent > 0 && flipped > 0, "Exercise placement failure and retries");
  console.log(
    `Tooltip geometry: ${cases.length} positions and ${cases.length} arrow rectangles match extracted C++; ${flipped} retries, ${absent} no-fit results.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
