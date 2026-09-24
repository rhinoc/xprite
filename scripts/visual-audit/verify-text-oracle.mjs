import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
/** Aseprite glyph oracle: public Lua in an isolated GUI process initializes Fonts. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { build } from "esbuild";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { resolveAsepriteExecutable, resolveAsepriteSource } from "../base/reference-paths.mjs";
import { readWebpPixels } from "../base/webp-assets.mjs";
const root = process.cwd();
const out = path.resolve(
  process.argv[2] ?? `.tmp/aseprite-text-oracle-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
await fs.mkdir(out, { recursive: true });
const reportPath = path.join(out, "report.json");
if (
  await fs.access(reportPath).then(
    () => true,
    () => false,
  )
)
  throw new Error("Preserving existing oracle evidence; select a fresh output directory.");
const app = resolveAsepriteExecutable();
const source = resolveAsepriteSource();
const cases = [
  { id: "hi", text: "Hi", scale: 1 },
  { id: "uppercase", text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", scale: 1 },
  { id: "lowercase", text: "abcdefghijklmnopqrstuvwxyz", scale: 1 },
  { id: "digits-punctuation", text: "0123456789 !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~", scale: 1 },
  { id: "multiline", text: "Pixel Cat\nAseprite 123\nHi!", scale: 1 },
  { id: "scale-two", text: "Pixel Cat 123!?", scale: 2 },
  { id: "scale-three", text: "Hi! 23", scale: 3 },
  { id: "carriage-return", text: "Hi\rCat", scale: 1 },
  { id: "tab", text: "Hi\tCat", scale: 1, unsupportedProbe: true },
  { id: "unknown", text: "Hi☃Cat", scale: 1, unsupportedProbe: true },
  { id: "accent", text: "Café déjà vu", scale: 1 },
  {
    id: "ignored-controls",
    text: "Hi" + Array.from({ length: 11 }, (_, i) => String.fromCharCode(10 + i)).join("") + "Cat",
    scale: 1,
  },
  { id: "nul-terminator", text: "Hi" + String.fromCharCode(0) + "Cat", scale: 1 },
];
const atlasCodepoints = Object.keys(
  JSON.parse(await fs.readFile("packages/ui/assets/fonts/aseprite/aseprite-glyphs.json", "utf8")),
)
  .map(Number)
  .sort((a, b) => a - b);
for (let i = 0; i < atlasCodepoints.length; i += 32)
  cases.push({
    id: `atlas-${String(i / 32 + 1).padStart(2, "0")}`,
    text: atlasCodepoints
      .slice(i, i + 32)
      .map((c) => String.fromCodePoint(c))
      .join(""),
    scale: 1,
  });
const hash = async (p) =>
  crypto
    .createHash("sha256")
    .update(await fs.readFile(p))
    .digest("hex");
const run = await fs.mkdtemp(path.join(os.tmpdir(), "aseprite-text-oracle-"));
const profile = path.join(run, "profile");
await fs.mkdir(profile);
const lua = path.join(run, "text.lua");
// JSON strings are compatible with Lua here after expressing newline as a Lua escape.
const quote = (s) =>
  JSON.stringify(s).replace(
    /\\u([0-9a-f]{4})/g,
    (_, hex) => "\\" + parseInt(hex, 16).toString().padStart(3, "0"),
  );
const script =
  `local timer\ntimer=Timer{interval=0.5,ontick=function()\ntimer:stop()\n` +
  cases
    .map(
      (c) =>
        `do\nlocal sprite=Sprite(512,96,ColorMode.RGB)\nassert(app.command.PasteText{ui=false,text=${quote(c.text)},fontName="Aseprite",fontSize=${7 * c.scale},x=2,y=2,color=Color{r=255,g=255,b=255,a=255}})\nassert(sprite:saveCopyAs(${quote(path.join(out, c.id + "-aseprite.png"))}))\nsprite:close()\nend\n`,
    )
    .join("") +
  "app.exit()\nend}\ntimer:start()\n";
await fs.writeFile(lua, script);
await fs.writeFile(path.join(out, "oracle.lua"), script);
await fs.writeFile(
  path.join(profile, "aseprite.ini"),
  `[script_access]\n${crypto.createHash("sha1").update(lua).digest("hex")} = 6\n`,
);
let aseprite;
try {
  const log = execFileSync(app, ["--script", lua], {
    env: { ...process.env, ASEPRITE_USER_FOLDER: profile },
    timeout: 20000,
    encoding: "utf8",
  });
  await fs.writeFile(path.join(out, "aseprite.log"), log);
  aseprite = { exitStatus: 0, signal: null };
} catch (error) {
  aseprite = {
    exitStatus: error.status ?? null,
    signal: error.signal ?? null,
    stderr: String(error.stderr ?? ""),
  };
  await fs.writeFile(
    reportPath,
    JSON.stringify({ verified: false, status: "aseprite-gui-failed", aseprite }, null, 2) + "\n",
  );
  throw error;
} finally {
  await fs.rm(run, { recursive: true, force: true });
}
const { outputFiles } = await build({
  stdin: {
    contents: `export {RasterEditor} from './packages/editor-core/src/editor/RasterEditor.ts';export {bitmapFontFromAtlas} from './apps/editor/src/adapters/rendering/bitmap-font';`,
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { RasterEditor, bitmapFontFromAtlas } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const atlas = await readWebpPixels("packages/ui/assets/fonts/aseprite/aseprite-glyphs.webp");
const font = bitmapFontFromAtlas(
  { width: atlas.width, height: atlas.height, data: new Uint8ClampedArray(atlas.data) },
  JSON.parse(await fs.readFile("packages/ui/assets/fonts/aseprite/aseprite-glyphs.json", "utf8")),
);
const results = [];
for (const c of cases) {
  const core = new RasterEditor({
    width: 512,
    height: 96,
    data: new Uint8ClampedArray(512 * 96 * 4),
  });
  core.setSettings({ font, foreground: [255, 255, 255, 255] });
  const accepted = core.beginTextPaste(c.text, c.scale, { x: 2, y: 2 });
  if (c.unsupportedProbe) {
    if (accepted) throw new Error(`Unsupported fallback accepted: ${c.id}`);
    results.push({
      ...c,
      coreRejected: true,
      asepriteSha256: await hash(path.join(out, c.id + "-aseprite.png")),
      reason: "Platform font fallback is outside the bundled bitmap mode.",
    });
    continue;
  }
  if (!accepted || !core.commitFloatingPaste()) throw new Error(`Core paste failed: ${c.id}`);
  const image = core.composite();
  const candidate = new PNG({ width: image.width, height: image.height });
  candidate.data = Buffer.from(image.data);
  const cp = path.join(out, c.id + "-core.png"),
    np = path.join(out, c.id + "-aseprite.png");
  await fs.writeFile(cp, PNG.sync.write(candidate));
  const reference = PNG.sync.read(await fs.readFile(np));
  if (reference.width !== image.width || reference.height !== image.height)
    throw new Error("Dimensions differ");
  const diff = new PNG({ width: image.width, height: image.height });
  const different = pixelmatch(
    reference.data,
    candidate.data,
    diff.data,
    image.width,
    image.height,
    { threshold: 0.1, includeAA: true },
  );
  await fs.writeFile(path.join(out, c.id + "-diff.png"), PNG.sync.write(diff));
  let exact = 0,
    ink = 0;
  for (let i = 0; i < image.width * image.height; i++) {
    if ([0, 1, 2, 3].some((k) => reference.data[i * 4 + k] !== candidate.data[i * 4 + k])) exact++;
    if (reference.data[i * 4 + 3]) ink++;
  }
  if (!ink) throw new Error(`Aseprite glyph output empty: ${c.id}`);
  results.push({
    ...c,
    fontSize: 7 * c.scale,
    size: [image.width, image.height],
    asepriteInkPixels: ink,
    exactDifferentPixels: exact,
    differentAtPointOne: different,
    similarity: 100 * (1 - different / (image.width * image.height)),
    asepriteSha256: await hash(np),
    coreSha256: await hash(cp),
  });
}
const report = {
  verified: results.filter((c) => !c.unsupportedProbe).every((c) => !c.exactDifferentPixels),
  allProbesExact: results.every((c) => !c.unsupportedProbe && !c.exactDifferentPixels),
  unsupportedProbes: ["tab", "unknown"],
  aseprite,
  command: "PasteText",
  parameters: { ui: false, fontName: "Aseprite", x: 2, y: 2, color: "#FFFFFFFF" },
  threshold: 0.1,
  includeAA: true,
  profileIsolation:
    "Fresh temporary ASEPRITE_USER_FOLDER; script access6 only; public Timer/PasteText/Sprite.saveCopyAs/app.exit; original user app/profile/documents untouched.",
  explanation:
    "GUI Timer permits Aseprite Fonts initialization before ui=false PasteText. No Aseprite painter, glyph or output modification.",
  provenance: {
    asepriteExecutable: app,
    asepriteExecutableSha256: await hash(app),
    scriptSha256: await hash(path.join(out, "oracle.lua")),
    fontAtlasSha256: await hash("packages/ui/assets/fonts/aseprite/aseprite-glyphs.webp"),
    fontGlyphsSha256: await hash("packages/ui/assets/fonts/aseprite/aseprite-glyphs.json"),
    asepritePasteTextSourceSha256: await hash(
      path.join(source, "src/app/commands/cmd_paste_text.cpp"),
    ),
    asepriteRenderTextSourceSha256: await hash(path.join(source, "src/app/util/render_text.cpp")),
    coreTextSha256: await hash("packages/editor-core/src/drawing/text/text.ts"),
  },
  cases: results,
};
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (!report.verified) process.exitCode = 1;
