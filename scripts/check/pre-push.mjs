#!/usr/bin/env node
// Pre-push gate. Phase 1: `pnpm run check` (without its own growth/tools build) alongside the one
// production site build (`check:deploy --build`). Phase 2, all on that build and in parallel:
// `test:ci`, `visual --prebuilt` (unless XPRITE_SKIP_VISUAL=1),
// `check:deploy --prepare` and the site-output checks (SSR warnings, page metadata, asset
// versions) that `check` would otherwise build growth and tools for, racing the site build.
// The parallel steps' output is buffered and printed as one block per step, so logs never interleave.
// Knip and tsgo use on-disk caches under node_modules/.cache; CI restores those between runs.
// XPRITE_SKIP_VISUAL=1 skips only the visual audits (explicit opt-out).
import { report, run, seconds } from "./parallel-run.mjs";

const started = performance.now();
const skipVisual = process.env.XPRITE_SKIP_VISUAL === "1";

// Phase 1: static checks alongside the one production site build (deploy environment) that
// both the visual audits and deploy preparation use.
console.log("pre-push: [1/2] check in parallel with the site build (check:deploy --build)");
let failed = report(
  await Promise.all([
    run("check", { buffered: true, args: ["--skip", "site-build"] }),
    run("check:deploy", { buffered: true, args: ["--build"] }),
  ]),
);
if (failed) {
  console.error(`pre-push: FAILED in ${seconds(started)}; tests and visual audits not run.`);
  process.exit(failed);
}

const phase2 = [
  run("test:ci", { buffered: true }),
  run("check:deploy", { buffered: true, args: ["--prepare"] }),
  run("check:site-output", { buffered: true }),
];
if (skipVisual) {
  console.log("\npre-push: [2/2] test:ci, check:deploy --prepare and site-output (visual skipped)");
} else {
  console.log(
    "\npre-push: [2/2] test:ci, visual --prebuilt, check:deploy --prepare and site-output checks in parallel",
  );
  phase2.splice(1, 0, run("visual", { buffered: true, args: ["--prebuilt"] }));
}
failed = report(await Promise.all(phase2));
console.log(`\npre-push: ${failed ? "FAILED" : "all steps passed"} in ${seconds(started)} total.`);
process.exit(failed);
