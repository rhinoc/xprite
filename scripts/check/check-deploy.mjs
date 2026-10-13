#!/usr/bin/env node
// Local deploy dry run: the build and validation half of .github/workflows/deploy-editor.yml,
// without secrets or publishing. Runs EdgeOne config validation, the full site build and
// deploy:prepare (static-file, entry-asset and asset-version checks) into .tmp/deploy/editor.
// The build uses the deploy environment (release = HEAD), so the visual audits test what ships.
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
// --build: validation and the site build (.tmp/site) only; --prepare: deploy:prepare on an
// existing build. pre-push builds once, audits that build visually, and prepares it in parallel.
const only = process.argv.includes("--build")
  ? "build"
  : process.argv.includes("--prepare")
    ? "prepare"
    : null;
const steps = [
  ["build", ["exec", "edgeone", "validate"]],
  ["build", ["run", "build:site"]],
  ["prepare", ["run", "deploy:prepare"]],
].filter(([phase]) => !only || phase === only);
for (const [, args] of steps) {
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
console.log(
  only === "build"
    ? "check:deploy: EdgeOne validation and site build passed."
    : only === "prepare"
      ? "check:deploy: deployment preparation passed."
      : "check:deploy: site build and deployment preparation passed.",
);
