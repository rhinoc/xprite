import assert from "node:assert/strict";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
Error.stackTraceLimit = 0;
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { build } from "esbuild";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";
const { outputFiles } = await build({
  stdin: {
    contents:
      'export * from "./packages/editor-core/src/image-editing/effects.ts";export * from "./packages/editor-core/src/tilemap/model.ts";export * from "./packages/editor-core/src/timeline/timeline.ts";export * from "./packages/editor-core/src/import-export/aseprite/index.ts";export * from "./packages/editor-core/src/import-export/aseprite/project.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "tilemap-effects-"));
const load = async (file) => {
  const p = m.projectFromAseprite(await m.decodeAseprite(fs.readFileSync(file)));
  const d = {
    name: "effect",
    width: p.image.width,
    height: p.image.height,
    palette: p.palette,
    timeline: p.timeline,
    selection: null,
    layer: { name: "tile", pixels: p.image, x: 0, y: 0, visible: true, locked: false },
  };
  const li = p.timeline.layers.findIndex((l) => l.kind === "tilemap");
  m.activateTimelineCel(d, 0, li);
  return d;
};
const cases = [
  [{ kind: "invert" }, "InvertColor{ui=false}"],
  [
    { kind: "brightness-contrast", brightness: 25, contrast: 10 },
    "BrightnessContrast{ui=false,brightness=25,contrast=10}",
  ],
  [
    {
      kind: "outline",
      place: "outside",
      matrix: 495,
      color: [255, 0, 0, 255],
      bgColor: [0, 0, 0, 0],
    },
    "Outline{ui=false,place='outside',matrix='square',color=Color{r=255,g=0,b=0,a=255},bgColor=Color{r=0,g=0,b=0,a=0}}",
  ],
];
for (const [effect, command] of cases)
  for (const fixture of ["2x2tilemap2x2tile", "2x3tilemap-indexed", "3x2tilemap-grayscale"])
    for (const mask of [false, true]) {
      const source = path.join(resolveAsepriteSource(), "tests/sprites", `${fixture}.aseprite`),
        doc = await load(source),
        before = structuredClone(doc);
      const indexedOutline = fixture.includes("indexed") && effect.kind === "outline";
      const effective = indexedOutline ? { ...effect, colorIndex: 2, bgIndex: 0 } : effect;
      const commandForCase = indexedOutline
        ? "Outline{ui=false,place='outside',matrix='square',color=Color{index=2},bgColor=Color{index=0}}"
        : command;
      if (mask)
        doc.selection = {
          x: 0,
          y: 0,
          width: Math.min(2, doc.width),
          height: Math.min(2, doc.height),
          data: new Uint8Array(Math.min(2, doc.width) * Math.min(2, doc.height)).fill(1),
        };
      const script = path.join(root, "run.lua"),
        output = path.join(root, "out.aseprite");
      fs.writeFileSync(
        script,
        `local s=app.open(${JSON.stringify(source)});app.layer=s.layers[${doc.timeline.activeLayer + 1}];${mask ? "s.selection=Selection(Rectangle(0,0,2,2));" : ""}app.command.${commandForCase};s:saveAs(${JSON.stringify(output)});s:close()`,
      );
      execFileSync(process.env.ASEPRITE_BINARY ?? resolveAsepriteExecutable(), [
        "--batch",
        "--script",
        script,
      ]);
      const actual = m.applyDocumentEffect(doc, effective, "selected", false, "manual"),
        expected = await load(output);
      assert.deepEqual(
        actual.timeline.tilesets.map((s) => Array.from(s.asepritePixels ?? s.pixels)),
        expected.timeline.tilesets.map((s) => Array.from(s.asepritePixels ?? s.pixels)),
        `${fixture} mask=${mask} Tileset samples`,
      );
      assert.deepEqual(
        actual.timeline.frames.map((f) => f.palette),
        expected.timeline.frames.map((f) => f.palette),
        "frame palettes",
      );
      assert.deepEqual(
        actual.timeline.frames.map((f) => f.cels.map((c) => c?.tilemap)),
        expected.timeline.frames.map((f) => f.cels.map((c) => c?.tilemap)),
        `${fixture} maps`,
      );
      assert.deepEqual(structuredClone(doc.timeline), before.timeline, "source remains immutable");
      assert.deepEqual(
        m.previewDocumentEffect(doc, effective, "manual").timeline,
        actual.timeline,
        "preview equals selected commit",
      );
      console.log(
        `${fixture}, mask=${mask}: Aseprite Manual ${effect.kind} tileset samples + maps match`,
      );
    }
// Mode semantics, repeated references, linked cels, exact duplicate palette indices.
const palette = [
  [0, 0, 0, 0],
  [255, 0, 0, 255],
  [255, 0, 0, 255],
  [0, 0, 255, 255],
];
let t = m.createTilemapLayer(
  {
    layers: [],
    frames: [{ duration: 100, palette, cels: [] }],
    activeLayer: 0,
    activeFrame: 0,
    colorDepth: 8,
    transparentIndex: 0,
  },
  { tileWidth: 1, tileHeight: 1 },
);
t = {
  ...t,
  tilesets: [
    {
      ...t.tilesets[0],
      tileCount: 3,
      asepritePixels: Uint8Array.of(0, 1, 2),
      pixels: Uint8Array.from(palette.slice(0, 3).flat()),
    },
  ],
};
t = m.setTilesAt(t, 0, 0, [
  { x: 0, y: 0, tile: 1 },
  { x: 1, y: 0, tile: 2 },
  { x: 2, y: 0, tile: 2 },
]);
t = { ...t, frames: [t.frames[0], { ...t.frames[0] }] };
const doc = {
    name: "duplicate",
    width: 3,
    height: 1,
    palette,
    timeline: t,
    selection: { x: 1, y: 0, width: 1, height: 1, data: Uint8Array.of(1) },
    layer: {
      name: "x",
      pixels: t.frames[0].cels[0].pixels,
      x: 0,
      y: 0,
      visible: true,
      locked: false,
    },
  },
  spec = {
    kind: "replace-color",
    from: palette[2],
    to: palette[3],
    fromIndex: 2,
    toIndex: 3,
    tolerance: 0,
  };
for (const mode of ["manual", "auto", "stack"]) {
  const d = m.applyDocumentEffect(doc, spec, "all", false, mode),
    c = d.timeline.frames[0].cels[0],
    n = m.rasterizeTilemapSamples(c.tilemap, d.timeline.tilesets[0], 8);
  assert.deepEqual([...n.data], mode === "manual" ? [1, 3, 3] : [1, 3, 2]);
  assert.equal(c.tilemap, d.timeline.frames[1].cels[0].tilemap);
  assert.deepEqual([...t.tilesets[0].asepritePixels], [0, 1, 2]);
}
fs.rmSync(root, { recursive: true, force: true });
console.log(
  "Manual/Auto/Stack: duplicate indices, mask, repeated references and linked cel exact-once semantics pass.",
);
