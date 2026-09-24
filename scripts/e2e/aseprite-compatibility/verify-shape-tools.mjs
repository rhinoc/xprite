import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";
const source = resolveAsepriteSource();
const algo = await readFile(join(source, "src/doc/algo.cpp"), "utf8");
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
const dir = await mkdtemp(join(tmpdir(), "aseprite-shapes-"));
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/drawing/shapes/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { ellipsePixels, curvePath, paintShape, paintGradient, ShapeController } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
try {
  const cpp = `#include <algorithm>\n#include <cmath>\n#include <iostream>\n#include <set>\n#include <utility>\nusing AlgoPixel=void(*)(int,int,void*);using AlgoHLine=void(*)(int,int,int,void*);using AlgoLine=void(*)(int,int,int,int,void*);\n${fn(algo, "static int adjust_ellipse_args(")}\n${fn(algo, "void algo_ellipse(")}\n${fn(algo, "void algo_ellipsefill(")}\n${fn(algo, "void algo_spline(")}\nstd::set<std::pair<int,int>>pts;void plot(int x,int y,void*){pts.insert({x,y});}void span(int x,int y,int end,void*d){for(;x<=end;x++)plot(x,y,d);}void segment(int x,int y,int x1,int y1,void*){std::cout<<x1<<","<<y1<<";";}\nint main(){for(int f=0;f<2;f++)for(int w=1;w<=32;w++)for(int h=1;h<=32;h++){pts.clear();if(f)algo_ellipsefill(3,5,w+2,h+4,0,0,nullptr,span);else algo_ellipse(3,5,w+2,h+4,0,0,nullptr,plot);std::cout<<f<<","<<w<<","<<h<<":";for(auto p:pts)std::cout<<p.first<<","<<p.second<<";";std::cout<<"\\n";}for(int n=0;n<30;n++){std::cout<<"C:";algo_spline(-3,5,n,30-n,35-n,n,31,28,nullptr,segment);std::cout<<"\\n";}}`;
  await writeFile(join(dir, "oracle.cpp"), cpp);
  execFileSync("clang++", [
    "-std=c++17",
    "-O2",
    join(dir, "oracle.cpp"),
    "-o",
    join(dir, "oracle"),
  ]);
  const lines = execFileSync(join(dir, "oracle"), [], {
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  })
    .trim()
    .split("\n");
  let checks = 0,
    curve = 0;
  for (const row of lines) {
    const [header, data] = row.split(":");
    const expected = data.split(";").filter(Boolean);
    if (header === "C") {
      assert.deepEqual(
        curvePath([
          { x: -3, y: 5 },
          { x: curve, y: 30 - curve },
          { x: 35 - curve, y: curve },
          { x: 31, y: 28 },
        ])
          .slice(1)
          .map((p) => `${p.x},${p.y}`),
        expected,
      );
      curve++;
    } else {
      const [filled, w, h] = header.split(",").map(Number);
      const pts = ellipsePixels({ x: 3, y: 5 }, { x: w + 2, y: h + 4 }, !!filled);
      const actual = [...new Set(pts.map((p) => `${p.x},${p.y}`))].sort();
      assert.deepEqual(actual, expected.sort(), header);
      assert.deepEqual(
        [
          ...new Set(
            ellipsePixels({ x: w + 2, y: h + 4 }, { x: 3, y: 5 }, !!filled).map(
              (p) => `${p.x},${p.y}`,
            ),
          ),
        ].sort(),
        actual,
      );
    }
    checks++;
  }
  const blank = () => ({ width: 9, height: 9, data: new Uint8ClampedArray(9 * 9 * 4) }),
    opts = {
      color: [255, 0, 0, 255],
      background: [0, 0, 255, 255],
      brush: { shape: "circle", size: 1, angle: 0 },
    };
  for (const tool of ["filled_rectangle", "ellipse", "filled_ellipse", "curve", "polygon"]) {
    const im = blank();
    let captures = 0;
    paintShape(
      im,
      [
        { x: 1, y: 1 },
        { x: 6, y: 2 },
        { x: 7, y: 7 },
      ],
      tool,
      {
        ...opts,
        opacity: 128,
        selection: { x: 0, y: 0, width: 4, height: 9, data: new Uint8Array(36).fill(1) },
        beforeWrite: () => captures++,
      },
    );
    assert(captures > 0);
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) {
        const a = im.data[(y * 9 + x) * 4 + 3];
        assert(a === 0 || a === 128, `${tool} duplicate alpha`);
        if (x >= 4) assert.equal(a, 0);
      }
  }
  const im = blank();
  paintGradient(im, { x: 0, y: 0 }, { x: 8, y: 0 }, opts);
  assert.deepEqual(im.data.slice(4 * 4, 4 * 4 + 4), [127, 0, 127, 255]);
  const radial = blank();
  paintGradient(radial, { x: 0, y: 0 }, { x: 8, y: 8 }, { ...opts, gradientType: "radial" });
  assert.deepEqual(radial.data.slice(40 * 4, 41 * 4), [255, 0, 0, 255]);
  const transparent = blank();
  paintGradient(
    transparent,
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { ...opts, background: [0, 0, 255, 0] },
  );
  assert.deepEqual(transparent.data.slice(4 * 4, 5 * 4), [255, 0, 0, 127]);
  const bounded = blank();
  for (let y = 0; y < 9; y++) bounded.data.set([0, 255, 0, 255], (y * 9 + 4) * 4);
  paintGradient(bounded, { x: 1, y: 1 }, { x: 8, y: 1 }, opts);
  assert.equal(bounded.data[(1 * 9 + 7) * 4 + 3], 0, "gradient remains inside clicked region");
  assert.deepEqual(bounded.data.slice((1 * 9 + 4) * 4, (1 * 9 + 4) * 4 + 4), [0, 255, 0, 255]);
  paintGradient(bounded, { x: 7, y: 1 }, { x: 8, y: 1 }, { ...opts, contiguous: false });
  assert.equal(bounded.data[(1 * 9 + 7) * 4 + 3], 255);
  const largeBrush = blank();
  paintShape(
    largeBrush,
    [
      { x: 3, y: 3 },
      { x: 5, y: 5 },
    ],
    "filled_rectangle",
    { ...opts, brush: { shape: "square", size: 3, angle: 0 } },
  );
  assert.equal(
    [...largeBrush.data].filter((v, i) => i % 4 === 3 && v === 255).length,
    25,
    "filled shapes stamp the active brush",
  );
  const preview = blank();
  paintShape(
    preview,
    [
      { x: 1, y: 1 },
      { x: 7, y: 7 },
    ],
    "filled_rectangle",
    { ...opts, preview: true },
  );
  assert.equal(preview.data[(4 * 9 + 4) * 4 + 3], 0, "Aseprite fill preview defaults to outline");
  const polygon = new ShapeController("polygon");
  polygon.press({ x: 1, y: 1 });
  polygon.move({ x: 4, y: 1 });
  assert.equal(polygon.release({ x: 4, y: 1 }), true);
  polygon.move({ x: 4, y: 4 });
  polygon.press({ x: 4, y: 4 });
  assert.equal(polygon.release({ x: 4, y: 4 }), false);
  const controller = new ShapeController("curve");
  controller.press({ x: 1, y: 1 });
  controller.move({ x: 8, y: 8 });
  assert(controller.release({ x: 8, y: 8 }));
  controller.move({ x: 2, y: 6 });
  controller.press({ x: 2, y: 6 });
  assert(controller.release({ x: 2, y: 6 }));
  controller.move({ x: 6, y: 2 });
  controller.press({ x: 6, y: 2 });
  assert.equal(controller.release({ x: 6, y: 2 }), false);
  assert.deepEqual(controller.points, [
    { x: 1, y: 1 },
    { x: 2, y: 6 },
    { x: 6, y: 2 },
    { x: 8, y: 8 },
  ]);
  for (const kind of ["curve", "polygon"]) {
    const mover = new ShapeController(kind);
    mover.press({ x: 2, y: 3 });
    mover.move({ x: 8, y: 9 });
    mover.release({ x: 8, y: 9 });
    const original = mover.points.map((p) => ({ ...p }));
    mover.move({ x: 8, y: 9 }, { moveOrigin: true });
    assert.deepEqual(mover.points, original, "stationary Space retains points");
    mover.move({ x: 11, y: 7 }, { moveOrigin: true });
    assert.deepEqual(
      mover.points,
      original.map((p) => ({ x: p.x + 3, y: p.y - 2 })),
      "Space offsets every Aseprite controller point",
    );
    mover.press({ x: 20, y: 20 });
    const pressed = mover.points.map((p) => ({ ...p }));
    mover.move({ x: 21, y: 22 }, { moveOrigin: true });
    assert.deepEqual(
      mover.points,
      pressed.map((p) => ({ x: p.x + 1, y: p.y + 2 })),
      "press resets Aseprite MoveOrigin last pointer",
    );
  }
  console.log(
    `PASS ${checks} upstream C++ shape oracle cases, clipping/alpha/history, gradient and Aseprite multi-click controllers`,
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
