import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const b = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/import-export/aseprite/index.ts";export * from "./packages/editor-core/src/import-export/aseprite/project.ts";export * from "./packages/editor-core/src/color/operations/color-mode.ts";export * from "./packages/editor-core/src/timeline/timeline.ts";',
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
const root = await mkdtemp(join(tmpdir(), "ase-modes-"));
const output = ".tmp/aseprite-modes";
await mkdir(output, { recursive: true });
const pal = (colors, frameIndex) => ({
  frameIndex,
  entries: colors.map(([red, green, blue, alpha = 255], i) => ({
    red,
    green,
    blue,
    alpha,
    name: "Color " + i,
  })),
});
const p0 = pal(
    [
      [0, 0, 0, 0],
      [255, 0, 0],
      [255, 0, 0],
      [0, 0, 255],
    ],
    0,
  ),
  p1 = pal(
    [
      [0, 0, 0, 0],
      [0, 0, 255],
      [0, 255, 0],
      [255, 255, 255],
    ],
    1,
  );
const layer = {
  index: 0,
  type: "image",
  flags: 3,
  visible: true,
  editable: true,
  locked: false,
  background: false,
  collapsed: false,
  reference: false,
  continuous: true,
  name: "Pixels",
  childLevel: 0,
  blendMode: 0,
  opacity: 255,
  defaultWidth: 0,
  defaultHeight: 0,
};
const header = {
  fileSize: 0,
  magic: 0xa5e0,
  speed: 100,
  next: 0,
  frit: 0,
  transparentIndex: 0,
  ncolors: 4,
  pixelWidth: 1,
  pixelHeight: 1,
  gridX: 1,
  gridY: -2,
  gridWidth: 3,
  gridHeight: 5,
  ignore: [0, 0, 0],
};
const seed = (depth) => ({
  width: 4,
  height: 1,
  depth,
  flags: 1,
  header,
  layers: [layer],
  palette: p0,
  tags: [],
  chunks: [],
  format: "aseprite",
  frames: [
    {
      index: 0,
      duration: 100,
      palette: p0,
      cels: [
        {
          layerIndex: 0,
          x: 0,
          y: 0,
          opacity: 255,
          zIndex: 0,
          type: "raw",
          rawType: 0,
          width: 4,
          height: 1,
          asepritePixels: new Uint8Array(
            depth === 8 ? [0, 1, 2, 3] : [0, 0, 17, 128, 255, 255, 44, 0],
          ),
        },
      ],
    },
    {
      index: 1,
      duration: 150,
      palette: p1,
      cels: [
        {
          layerIndex: 0,
          x: 0,
          y: 0,
          opacity: 255,
          zIndex: 0,
          type: "linked",
          rawType: 1,
          width: 4,
          height: 1,
          linkedFrame: 0,
        },
      ],
    },
  ],
});
for (const depth of [8, 16])
  await writeFile(join(root, `seed-${depth}.aseprite`), m.encodeAsepriteSync(seed(depth)));
const lua =
  `local f=io.open('${root}/pixels.json','w');f:write('[')\n` +
  [8, 16]
    .map(
      (depth, i) =>
        `do local s=Sprite{fromFile='${root}/seed-${depth}.aseprite'};s:saveCopyAs('${root}/aseprite-${depth}.aseprite');${i ? 'f:write(",")' : ""}f:write('[');for frame=1,#s.frames do if frame>1 then f:write(',') end local im=Image(s.width,s.height,ColorMode.RGB);im:drawSprite(s,frame);f:write('[');for x=0,s.width-1 do if x>0 then f:write(',') end local c=im:getPixel(x,0);f:write(string.format('[%d,%d,%d,%d]',app.pixelColor.rgbaR(c),app.pixelColor.rgbaG(c),app.pixelColor.rgbaB(c),app.pixelColor.rgbaA(c))) end f:write(']') end f:write(']');s:close() end`,
    )
    .join("\n") +
  `\nf:write(']');f:close()`;
await writeFile(join(root, "aseprite.lua"), lua);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", join(root, "aseprite.lua")], {
  timeout: 30000,
});
const expected = JSON.parse(await readFile(join(root, "pixels.json"), "utf8"));
for (const [i, depth] of [8, 16].entries()) {
  const bytes = await readFile(join(root, `aseprite-${depth}.aseprite`));
  await writeFile(join(output, `aseprite-${depth}.aseprite`), bytes);
  const sprite = await m.decodeAseprite(bytes, { inflate: inflateSync }),
    project = m.projectFromAseprite(sprite);
  assert.equal(sprite.depth, depth);
  assert.equal(project.timeline.colorDepth, depth);
  assert.deepEqual(project.timeline.gridBounds, { x: 1, y: -2, width: 3, height: 5 });
  for (let f = 0; f < 2; f++) {
    const image = m.renderTimelineFrame(project.timeline, 4, 1, f);
    const actual = Array.from({ length: 4 }, (_, j) => image.data.slice(j * 4, j * 4 + 4));
    assert.deepEqual(actual, expected[i][f], `Aseprite ${depth} frame${f}`);
  }
  assert.equal(
    project.timeline.frames[0].cels[0].asepriteSamples,
    project.timeline.frames[1].cels[0].asepriteSamples,
    "Aseprite linked identity",
  );
  const doc = {
    name: "Aseprite",
    width: 4,
    height: 1,
    selection: null,
    timeline: project.timeline,
    palette: project.palette,
    layer: { name: "", visible: true, locked: false, x: 0, y: 0, pixels: project.image },
  };
  m.activateTimelineCel(doc, 0, 0);
  doc.layer.pixels.data.set(depth === 8 ? [0, 0, 255, 255] : [255, 0, 0, 255], 4);
  m.syncTimeline(doc);
  m.normalizeAsepriteDocument(doc);
  const saved = m.asepriteFromProject(m.projectFromDocument(doc)),
    round = await m.decodeAseprite(m.encodeAsepriteSync(saved));
  assert.equal(round.depth, depth);
  assert.equal(round.frames[1].cels[0].type, "linked");
  assert.equal(
    round.frames[0].cels[0].asepritePixels[depth === 8 ? 2 : 4],
    depth === 8 ? 2 : 255,
    "untouched Aseprite source sample retained",
  );
  assert.equal(
    round.frames[0].cels[0].asepritePixels[depth === 8 ? 1 : 2],
    depth === 8 ? 3 : 54,
    "changed pixel quantized with Aseprite bestfit/luminance",
  );
  if (depth === 8) {
    assert.deepEqual(round.frames[1].palette.entries[2], sprite.frames[1].palette.entries[2]);
    assert.deepEqual(
      doc.timeline.frames[1].cels[0].pixels.data.slice(4, 8),
      [255, 255, 255, 255],
      "linked edit uses later frame palette",
    );
  }
  await writeFile(join(output, `edited-${depth}.aseprite`), m.encodeAsepriteSync(saved));
}
console.log(
  "Real Aseprite indexed/grayscale fixtures: per-frame palettes, duplicate indices, transparent mask, linked projections, source frame pixels, changed-only quantization, original-depth save/reopen and grid header roundtrip pass.",
);
