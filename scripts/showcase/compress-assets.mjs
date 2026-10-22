// Writes the gzip copies of the showcase scene's models and environment map that the browser
// downloads and inflates with DecompressionStream. The host does not compress these file types.
// Run after scripts/showcase/optimize-models.mjs or after replacing the HDR.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { constants, gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ASSET_DIRECTORY = resolve(ROOT, "apps/growth/public/showcase/ipad");
const MANIFEST_PATH = resolve(ROOT, "apps/growth/src/adapters/showcase/compressed-assets.json");
const FILES = [
  "apple-pencil.glb",
  "hand.glb",
  "ipad.glb",
  "iphone.glb",
  "macbook-pro.glb",
  "studio_small_08_1k.hdr",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = {};
for (const file of FILES) {
  const bytes = await readFile(resolve(ASSET_DIRECTORY, file));
  // Node writes a zero modification time, so the same input always gives the same bytes.
  const compressed = gzipSync(bytes, { level: constants.Z_BEST_COMPRESSION });
  await writeFile(resolve(ASSET_DIRECTORY, `${file}.gz`), compressed);
  files[file] = { bytes: bytes.length, gzipBytes: compressed.length, sha256: sha256(bytes) };
}
await writeFile(MANIFEST_PATH, `${JSON.stringify({ encoding: "gzip", files }, null, 2)}\n`);
console.log(
  Object.entries(files)
    .map(([file, entry]) => `${file}: ${entry.bytes} -> ${entry.gzipBytes} bytes`)
    .join("\n"),
);
