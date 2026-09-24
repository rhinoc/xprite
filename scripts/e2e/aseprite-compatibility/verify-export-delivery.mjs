import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { build } from "esbuild";
import { PNG } from "pngjs";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const binary = process.env.ASEPRITE_BINARY ?? resolveAsepriteExecutable();
const fixture = ".tmp/features-7-12/animation-fixture.aseprite";
if (!fs.existsSync(fixture))
  throw Error("Run root Aseprite fixture capture first: missing " + fixture);
async function load(file) {
  const r = await build({
    entryPoints: [file],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString("base64")}`
  );
}
const encoder = await load("packages/editor-core/src/import-export/image/encoders.ts");
const core = await load("packages/editor-core/src/index.ts"),
  sheetApi = await load("packages/editor-core/src/import-export/image/export-sheet.ts");
const sprite = await core.decodeAseprite(new Uint8Array(fs.readFileSync(fixture)), {
    inflate: (b) => new Uint8Array(inflateSync(b)),
  }),
  project = core.projectFromAseprite(sprite),
  editor = new core.RasterEditor();
editor.loadTimeline(
  project.timeline,
  sprite.width,
  sprite.height,
  "fixture.aseprite",
  project.palette,
);
const doc = editor.getSnapshot().document;
const output = ".tmp/features-7-12/aseprite-export-oracle";
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ase-export-oracle-"));
const cases = [
  ...["horizontal", "vertical", "rows", "columns", "packed"].map((layout) => ({
    id: layout,
    options: { layout },
    args: [],
  })),
  {
    id: "rows-padding",
    options: {
      layout: "rows",
      borderPadding: 1,
      shapePadding: 2,
      innerPadding: 1,
      extrude: true,
      trimCels: true,
    },
    args: [
      "--border-padding",
      "1",
      "--shape-padding",
      "2",
      "--inner-padding",
      "1",
      "--extrude",
      "--trim",
    ],
  },
  {
    id: "packed-padding",
    options: {
      layout: "packed",
      borderPadding: 1,
      shapePadding: 2,
      innerPadding: 1,
      extrude: true,
      trimCels: true,
    },
    args: [
      "--border-padding",
      "1",
      "--shape-padding",
      "2",
      "--inner-padding",
      "1",
      "--extrude",
      "--trim",
    ],
  },
  { id: "trim-sprite", options: { layout: "rows", trimSprite: true }, args: ["--trim-sprite"] },
  {
    id: "trim-grid",
    options: { layout: "rows", trimCels: true, trimByGrid: true },
    args: ["--trim", "--trim-by-grid"],
  },
  {
    id: "power-two",
    options: { layout: "rows", trimCels: true, powerOfTwo: true },
    args: ["--trim", "--power-of-two-size"],
  },
  {
    id: "rows-two-columns",
    options: { layout: "rows", constraint: "columns", constraintWidth: 2 },
    args: ["--sheet-columns", "2"],
  },
];
const results = [];
try {
  for (const test of cases) {
    const base = path.resolve(output, test.id),
      args = [
        "--batch",
        "--sheet-type",
        test.options.layout,
        "--format",
        "json-array",
        "--filename-format",
        "{frame}",
        ...test.args,
        fixture,
        "--sheet",
        base + ".png",
        "--data",
        base + ".json",
      ];
    const command = spawnSync(binary, args, {
      encoding: "utf8",
      env: { ...process.env, ASEPRITE_USER_FOLDER: profile },
      timeout: 30000,
    });
    if (command.status) throw Error(command.stderr || command.stdout);
    const expected = PNG.sync.read(fs.readFileSync(base + ".png")),
      metadata = JSON.parse(fs.readFileSync(base + ".json"));
    const candidate = sheetApi.renderSpriteSheet(doc, {
      ...sheetApi.defaultSpriteSheetOptions(doc),
      filenameFormat: "{frame}",
      dataFormat: "array",
      ...test.options,
    });
    const equal =
      expected.width === candidate.pixels.width &&
      expected.height === candidate.pixels.height &&
      Buffer.compare(expected.data, Buffer.from(candidate.pixels.data)) === 0;
    const framesEqual = JSON.stringify(metadata.frames) === JSON.stringify(candidate.data.frames);
    const result = {
      id: test.id,
      pixelsEqual: equal,
      framesEqual,
      asepriteSize: [expected.width, expected.height],
      candidateSize: [candidate.pixels.width, candidate.pixels.height],
    };
    results.push(result);
    if (!equal || !framesEqual) {
      fs.writeFileSync(base + "-candidate.json", JSON.stringify(candidate.data, null, 2));
      const png = new PNG({ width: candidate.pixels.width, height: candidate.pixels.height });
      png.data.set(candidate.pixels.data);
      fs.writeFileSync(base + "-candidate.png", PNG.sync.write(png));
    }
    console.log(JSON.stringify(result));
  }
  const alphaPixels = {
    width: 5,
    height: 1,
    data: new Uint8ClampedArray([
      255, 0, 0, 0, 0, 255, 0, 1, 0, 0, 255, 127, 255, 255, 0, 128, 255, 0, 255, 255,
    ]),
  };
  const alphaPng = new PNG({ width: 5, height: 1 });
  alphaPng.data.set(alphaPixels.data);
  const alphaBase = path.resolve(output, "gif-alpha");
  fs.writeFileSync(alphaBase + ".png", PNG.sync.write(alphaPng));
  const asepriteGif = spawnSync(
    binary,
    ["--batch", alphaBase + ".png", "--save-as", alphaBase + "-aseprite.gif"],
    { encoding: "utf8", env: { ...process.env, ASEPRITE_USER_FOLDER: profile }, timeout: 30000 },
  );
  if (asepriteGif.status) throw Error(asepriteGif.stderr);
  fs.writeFileSync(
    alphaBase + "-candidate.gif",
    encoder.encodeGif([{ pixels: alphaPixels, duration: 100, sourceFrame: 0 }]),
  );
  const alphaCheck = spawnSync(
    "python3",
    [
      "-c",
      `from PIL import Image
import json
print(json.dumps([list(Image.open('${alphaBase}-aseprite.gif').convert('RGBA').getdata()),list(Image.open('${alphaBase}-candidate.gif').convert('RGBA').getdata())]))`,
    ],
    { encoding: "utf8" },
  );
  if (alphaCheck.status) throw Error(alphaCheck.stderr);
  const [asepriteAlpha, candidateAlpha] = JSON.parse(alphaCheck.stdout);
  assert.deepEqual(
    candidateAlpha,
    asepriteAlpha,
    "Aseprite GIF treats every nonzero alpha as opaque",
  );
  results.push({ id: "gif-alpha", pixelsEqual: true, framesEqual: true });
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
assert.ok(
  results.every((r) => r.pixelsEqual && r.framesEqual),
  "Aseprite export differences are recorded; fix them before claiming parity",
);
console.log("Aseprite CLI sprite-sheet pixel and JSON frame metadata oracle passed.");
