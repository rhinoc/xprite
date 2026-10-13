#!/usr/bin/env node
// Runs the given pnpm scripts in parallel and fails if any fails; CI uses it for `check` and
// `test:ci`, which are independent:  node scripts/check/parallel.mjs check test:ci
import { report, run, seconds } from "./parallel-run.mjs";

const started = performance.now();
const scripts = process.argv.slice(2);
if (scripts.length === 0) {
  console.error("Usage: node scripts/check/parallel.mjs <pnpm script> [<pnpm script>...]");
  process.exit(2);
}
const failed = report(await Promise.all(scripts.map((script) => run(script, { buffered: true }))));
console.log(
  `\n${scripts.join(" + ")}: ${failed ? "FAILED" : "all passed"} in ${seconds(started)}.`,
);
process.exit(failed);
