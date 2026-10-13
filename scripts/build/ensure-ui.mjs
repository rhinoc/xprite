#!/usr/bin/env node
// prebuild/predev hook of the apps: builds @xprite/ui unless scripts/build/site.mjs already
// built it in this same run (XPRITE_UI_BUILT=1). Nothing is cached across runs.
import { spawnSync } from "node:child_process";

if (process.env.XPRITE_UI_BUILT === "1") process.exit(0);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["-w", "run", "build:ui"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
