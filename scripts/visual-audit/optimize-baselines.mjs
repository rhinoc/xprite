// Losslessly recompresses committed visual baselines with oxipng (pnpm run visual:optimize).
//
// - Every output is decoded and must match the original RGBA pixels and PNG color-space chunks
//   exactly; otherwise the original file is kept.
// - Manifests pin each PNG by sha256, so old hashes are replaced with the new ones in place.
// - Run it after approving new baselines; captures and comparisons are unaffected because they
//   compare decoded pixels.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import init, { optimise } from "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js";
import { PNG } from "pngjs";

import { assertSamePngColorSpace, preservePngColorSpace } from "../base/screenshot.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baselines = path.resolve(
  root,
  process.env.XPRITE_VISUAL_BASELINES ?? "scripts/visual-audit/baselines",
);
const level = Number(process.env.XPRITE_OXIPNG_LEVEL ?? 2);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });

await init(
  fs.readFileSync(
    fileURLToPath(import.meta.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm")),
  ),
);
const started = performance.now();
const files = walk(baselines);
const renamed = new Map();
let before = 0;
let after = 0;
for (const file of files.filter((name) => name.endsWith(".png"))) {
  const source = fs.readFileSync(file);
  before += source.length;
  const optimised = preservePngColorSpace(
    source,
    Buffer.from(optimise(new Uint8Array(source), level, false, false)),
  );
  const reference = PNG.sync.read(source);
  const candidate = PNG.sync.read(optimised);
  assertSamePngColorSpace(source, optimised, path.relative(root, file));
  const exact =
    reference.width === candidate.width &&
    reference.height === candidate.height &&
    reference.data.equals(candidate.data);
  if (!exact) throw Error(`${path.relative(root, file)}: optimised pixels differ; kept original.`);
  if (optimised.length < source.length) {
    fs.writeFileSync(file, optimised);
    renamed.set(sha(source), sha(optimised));
    after += optimised.length;
  } else after += source.length;
}
for (const manifest of files.filter((name) => name.endsWith("manifest.json"))) {
  let text = fs.readFileSync(manifest, "utf8");
  for (const [from, to] of renamed) text = text.replaceAll(from, to);
  fs.writeFileSync(manifest, text);
}
console.log(
  `visual:optimize: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB ` +
    `(${renamed.size} files recompressed, pixels verified) in ${((performance.now() - started) / 1000).toFixed(1)}s.`,
);
