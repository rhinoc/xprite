import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
/** Compile the local Aseprite algo_ellipsefill as an independent pixel oracle. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";
const root = resolveAsepriteSource();
const asepriteSource = readFileSync(join(root, "src/doc/algo.cpp"), "utf8");
const adjust = asepriteSource.slice(
  asepriteSource.indexOf("static int adjust_ellipse_args"),
  asepriteSource.indexOf("// Ellipse code based"),
);
const ellipse = asepriteSource.slice(
  asepriteSource.indexOf("void algo_ellipsefill("),
  asepriteSource.indexOf("static void draw_quad_rational_bezier_seg"),
);
const dir = mkdtempSync(join(tmpdir(), "selection-aseprite-"));
try {
  writeFileSync(
    join(dir, "oracle.cpp"),
    `#include <algorithm>\n#include <cstdlib>\n#include <iostream>\nusing AlgoHLine=void(*)(int,int,int,void*);\n${adjust}\n${ellipse}\nint main(){for(int h=1;h<=40;h++)for(int w=1;w<=40;w++){int pixels[1600]={};int* data[2]={pixels,&w};algo_ellipsefill(0,0,w-1,h-1,0,0,data,[](int x,int y,int end,void* p){auto d=(int**)p;for(int u=x;u<=end;u++)d[0][y*(*d[1])+u]=1;});for(int i=0;i<w*h;i++)std::cout<<pixels[i];std::cout<<'\\n';}}`,
  );
  execFileSync("c++", ["-std=c++17", join(dir, "oracle.cpp"), "-o", join(dir, "oracle")]);
  const lines = execFileSync(join(dir, "oracle"), { maxBuffer: 10_000_000 })
    .toString()
    .trim()
    .split("\n");
  const { outputFiles } = await build({
    entryPoints: ["packages/editor-core/src/selection/operations.ts"],
    bundle: true,
    format: "esm",
    write: false,
  });
  const { selectionEllipseSpans } = await import(
    `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
  );
  let i = 0;
  for (let h = 1; h <= 40; h++)
    for (let w = 1; w <= 40; w++) {
      const pixels = new Uint8Array(w * h);
      selectionEllipseSpans(0, 0, w - 1, h - 1, (x, y, end) => {
        for (let u = x; u <= end; u++) pixels[y * w + u] = 1;
      });
      assert.equal([...pixels].join(""), lines[i++], `Aseprite ellipse ${w}x${h}`);
    }
  console.log("Aseprite C++ ellipse oracle: 1600 rectangular dimensions pixel-exact");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
