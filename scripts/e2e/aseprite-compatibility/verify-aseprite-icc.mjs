import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

import { resolveSkiaRoot } from "../../base/reference-paths.mjs";
const b = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/color/icc-profile.ts";export * from "./packages/editor-core/src/import-export/aseprite/project.ts";export * from "./packages/editor-core/src/import-export/aseprite/index.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const m = await import(
  "data:text/javascript;base64," + Buffer.from(b.outputFiles[0].contents).toString("base64")
);
const skia = resolveSkiaRoot(),
  root = await mkdtemp(join(tmpdir(), "ase-icc-"));
const cpp = `#include <fstream>\n#include <iostream>\n#include <iterator>\n#include <vector>\n#include "modules/skcms/skcms.h"\nint main(int argc,char**argv){std::ifstream f(argv[1],std::ios::binary);std::vector<char>icc((std::istreambuf_iterator<char>(f)),{});std::vector<unsigned char>in((std::istreambuf_iterator<char>(std::cin)),{}),out(in.size());skcms_ICCProfile p,q;std::vector<char>target;const skcms_ICCProfile*dst=skcms_sRGB_profile();if(argc>2){std::ifstream g(argv[2],std::ios::binary);target.assign(std::istreambuf_iterator<char>(g),{});if(!skcms_Parse(target.data(),target.size(),&q)||!skcms_MakeUsableAsDestination(&q))return 4;dst=&q;}if(!skcms_Parse(icc.data(),icc.size(),&p))return 2;if(!skcms_Transform(in.data(),skcms_PixelFormat_RGBA_8888,skcms_AlphaFormat_Unpremul,&p,out.data(),skcms_PixelFormat_RGBA_8888,skcms_AlphaFormat_Unpremul,dst,in.size()/4))return 3;std::cout.write((char*)out.data(),out.size());}`;
try {
  await writeFile(join(root, "icc.cpp"), cpp);
  execFileSync("clang++", [
    "-std=c++17",
    "-O2",
    "-I" + skia,
    join(root, "icc.cpp"),
    join(skia, "out/Release-arm64/libskcms.a"),
    "-o",
    join(root, "icc"),
  ]);
  let compared = 0,
    worst = 0;
  for (const file of [
    "Display P3.icc",
    "AdobeRGB1998.icc",
    "sRGB Profile.icc",
    "Generic Gray Gamma 2.2 Profile.icc",
    "Generic Gray Profile.icc",
  ]) {
    const path = join("/System/Library/ColorSync/Profiles", file),
      bytes = new Uint8Array(await readFile(path)),
      profile = { type: "icc", data: bytes },
      parsed = m.parseMatrixIcc(bytes),
      data = new Uint8ClampedArray(1024 * 4);
    for (let i = 0; i < 1024; i++) {
      const r = (i * 71) & 255;
      data.set(
        [
          r,
          parsed.space === "GRAY" ? r : (i * 137) & 255,
          parsed.space === "GRAY" ? r : (i * 199) & 255,
          255,
        ],
        i * 4,
      );
    }
    const expected = execFileSync(join(root, "icc"), [path], { input: data }),
      image = { width: 1024, height: 1, data },
      copy = data.slice(),
      actual = m.convertPixelsToSrgb(image, profile);
    assert.deepEqual(data, copy);
    let max = 0;
    for (let j = 0; j < data.length; j++)
      max = Math.max(max, Math.abs(actual.data[j] - expected[j]));
    assert.ok(max <= 2, `${file}: SkCMS max channel error ${max}`);
    worst = Math.max(worst, max);
    compared += 1024;
    console.log(`${file}: SkCMS reference max channel error ${max}`);
    const project = {
      image,
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        colorDepth: 32,
        composeGroups: false,
        layers: [
          { id: "layer", name: "Layer", visible: true, locked: false, opacity: 255, flags: 3 },
        ],
        frames: [{ duration: 100, cels: [{ pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 }] }],
      },
    };
    if (parsed.space === "RGB") {
      const sprite = m.asepriteFromProject(project);
      sprite.colorProfile = profile;
      const decoded = await m.decodeAseprite(m.encodeAsepriteSync(sprite));
      const opened = m.projectFromAseprite(decoded),
        again = m.asepriteFromProject(opened);
      assert.deepEqual(again.colorProfile.data, bytes);
      assert.deepEqual(
        again.frames[0].cels[0].pixels,
        new Uint8Array(data),
        "ICC working pixels preserved",
      );
    }
  }
  for (const [fromName, toName] of [
    ["Display P3.icc", "AdobeRGB1998.icc"],
    ["AdobeRGB1998.icc", "Display P3.icc"],
    ["sRGB Profile.icc", "Display P3.icc"],
  ]) {
    const path = (n) => join("/System/Library/ColorSync/Profiles", n),
      from = { type: "icc", data: new Uint8Array(await readFile(path(fromName))) },
      to = { type: "icc", data: new Uint8Array(await readFile(path(toName))) },
      data = new Uint8ClampedArray(1024 * 4);
    for (let i = 0; i < 1024; i++)
      data.set([(i * 37) & 255, (i * 61) & 255, (i * 137) & 255, 255], i * 4);
    const image = { width: 1024, height: 1, data },
      actual = m.convertPixelsBetweenProfiles(image, from, to),
      expected = execFileSync(join(root, "icc"), [path(fromName), path(toName)], { input: data });
    let max = 0;
    for (let i = 0; i < data.length; i++)
      max = Math.max(max, Math.abs(actual.data[i] - expected[i]));
    assert.ok(max <= 2, `Cross-profile ${fromName} to ${toName}: ${max}`);
    assert.equal(
      m.convertPixelsBetweenProfiles(image, from, { ...from, data: from.data.slice() }),
      image,
      "same profile preserves exact working samples",
    );
    console.log(`${fromName} -> ${toName}: SkCMS reference max channel error${max}`);
  }
  const cmyk = new Uint8Array(
    await readFile("/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc"),
  );
  assert.throws(() => m.parseMatrixIcc(cmyk), /not RGB or Gray/);
  const invalid = new Uint8Array(132);
  assert.throws(() => m.parseMatrixIcc(invalid), /invalid ICC header/);
  console.log(
    `ICC: ${compared} SkCMS reference colors, max error${worst}/255; working pixels/profile bytes retained exactly, unsupported CMYK and malformed ICC explicitly rejected.`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
