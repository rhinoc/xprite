import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const input = path.resolve(".tmp/aseprite-frame-oracle/input"),
  output = path.resolve(".tmp/aseprite-frame-oracle/output");
fs.mkdirSync(input, { recursive: true });
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync("apps/editor/assets/examples/xprite/xprite.ase", input + "/xprite.ase");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aseprite-frame-oracle-"));
const result = execFileSync(
  resolveAsepriteExecutable(),
  [
    "--batch",
    "--script-param",
    `input=${input}`,
    "--script-param",
    `output=${output}`,
    "--script",
    path.resolve("scripts/visual-audit/aseprite/export-oracle.lua"),
  ],
  { encoding: "utf8", timeout: 60000, env: { ...process.env, ASEPRITE_USER_FOLDER: profile } },
);
console.log(result.trim());
