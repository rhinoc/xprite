#!/usr/bin/env node
// Local deploy dry run: the build and validation half of .github/workflows/deploy-editor.yml,
// without secrets or publishing. Runs EdgeOne config validation, the full site build and
// deploy:prepare (static-file, entry-asset and asset-version checks) into .tmp/deploy/editor.
import { execFileSync, spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const release = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const env = {
  ...process.env,
  POSTHOG_RELEASE: release,
  EDGEONE_ENV: process.env.EDGEONE_ENV || "preview",
  EDGEONE_AREA: process.env.EDGEONE_AREA || "global",
  EDGEONE_PROJECT_NAME: process.env.EDGEONE_PROJECT_NAME || "xprite",
  // Never upload source maps from a local dry run.
  POSTHOG_CLI_API_KEY: "",
  POSTHOG_CLI_PROJECT_ID: "",
};
for (const args of [
  ["exec", "edgeone", "validate"],
  ["run", "build:site"],
  ["run", "deploy:prepare"],
]) {
  const result = spawnSync(pnpm, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`check:deploy: pnpm ${args.join(" ")} failed.`);
    process.exit(result.status ?? 1);
  }
}
console.log("check:deploy: site build and deployment preparation passed.");
