// Builds Xiaohongshu mini tools: `node shared/build/build.mjs [tool…]`, every tool by default.
// Each tool lands in dist/<tool>/ and dist/<tool>.zip once the audit passes.
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const available = readdirSync(resolve(appRoot, "tools"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const requested = process.argv.slice(2).filter((argument) => argument !== "--");
const unknown = requested.filter((tool) => !available.includes(tool));
if (unknown.length) {
  console.error(`Unknown mini tool: ${unknown.join(", ")}. Available: ${available.join(", ")}.`);
  process.exit(1);
}

for (const tool of requested.length ? requested : available) {
  process.env.XHS_MINITOOL = tool;
  await build({ configFile: resolve(appRoot, "vite.config.ts"), mode: "production" });
  console.log(`Built dist/${tool}.zip`);
}
