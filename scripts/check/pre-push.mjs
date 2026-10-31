#!/usr/bin/env node
// Change-scoped pre-push gate. Classifies commits being pushed (git stdin ranges) into buckets:
//   always — `pnpm run check` without its own growth/tools build
//   unit   — `test:ci`
//   site   — one production site build (`check:deploy --build`), then `--prepare` + site-output
//   visual — `visual --prebuilt` on that build (implies site)
// editor-core-only / non-UI pushes skip site + visual. CI keeps the full suite.
// Force every bucket: XPRITE_PREPUSH_FULL=1 or `pnpm run pre-push:full`.
// XPRITE_SKIP_VISUAL=1 still skips only visual when that bucket would otherwise run.
// Note: husky skips every hook when HUSKY=0; unset it before pushing.
import { report, run, seconds } from "./parallel-run.mjs";
import { formatBuckets, resolvePrePushScope } from "./pre-push-scope.mjs";

const started = performance.now();
const scope = await resolvePrePushScope({ full: process.argv.includes("--full") });
const skipVisualEnv = process.env.XPRITE_SKIP_VISUAL === "1";
const runVisual = scope.visual && !skipVisualEnv;

console.log(
  `pre-push: ${scope.full ? "full suite (forced)" : `change-scoped (${scope.source})`}; ${formatBuckets({ ...scope, visual: runVisual })}`,
);
if (!scope.full && scope.files) {
  console.log(`pre-push: ${scope.files.length} changed file(s) in push range`);
}
if (scope.visual && skipVisualEnv) {
  console.log("pre-push: visual bucket selected but XPRITE_SKIP_VISUAL=1 — skipping visual only");
}

const phase1 = [run("check", { buffered: true, args: ["--skip", "site-build"] })];
if (scope.site) {
  phase1.push(run("check:deploy", { buffered: true, args: ["--build"] }));
  console.log("pre-push: [1/3] check in parallel with the site build (check:deploy --build)");
} else {
  console.log("pre-push: [1/3] check only (site-build skipped)");
}

let failed = report(await Promise.all(phase1));
if (failed) {
  console.error(`pre-push: FAILED in ${seconds(started)}; later buckets not run.`);
  process.exit(failed);
}

if (scope.unit) {
  console.log("\npre-push: [2/3] test:ci (visual audits wait for the unit workers)");
  const unitFailure = report([await run("test:ci", { buffered: true })]);
  failed ||= unitFailure;
} else {
  console.log("\npre-push: [2/3] unit tests skipped for this change set");
}

const phase2 = [];
const phase2Labels = [];
if (runVisual) {
  phase2.push(run("visual", { buffered: true, args: ["--prebuilt"] }));
  phase2Labels.push("visual --prebuilt");
}
if (scope.site) {
  phase2.push(run("check:deploy", { buffered: true, args: ["--prepare"] }));
  phase2.push(run("check:site-output", { buffered: true }));
  phase2Labels.push("check:deploy --prepare", "site-output");
}

if (phase2.length === 0) {
  console.log("\npre-push: [3/3] nothing else to run for this change set");
} else {
  console.log(`\npre-push: [3/3] ${phase2Labels.join(", ")} in parallel`);
  const laterFailure = report(await Promise.all(phase2));
  failed ||= laterFailure;
}

console.log(`\npre-push: ${failed ? "FAILED" : "all steps passed"} in ${seconds(started)} total.`);
process.exit(failed);
