// Test gate: runs the whole vitest suite and fails on any failing test (no allowlist). It also
// counts crashed tests and clips the multi-megabyte lines that esbuild-bundled tests print.
//
//   node scripts/check/run-tests.mjs          (pnpm run test:ci)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const report = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "xprite-tests-")), "vitest.json");
const vitest = path.join(
  root,
  "node_modules/.bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
// Stack traces of esbuild-bundled tests carry whole bundles as base64 data: URLs. Printed
// verbatim they are megabytes per line and stall CI log streaming, so long lines are clipped.
const MAX_LINE = 400;
const child = spawn(
  vitest,
  [
    "run",
    "--config",
    "infra/vitest.config.ts",
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${report}`,
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" },
);
const clip = (line) =>
  line
    .replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]{40,}/g, "data:text/javascript;base64,…")
    .slice(0, MAX_LINE) + (line.length > MAX_LINE ? " …" : "");
for (const [stream, out] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
])
  readline
    .createInterface({ input: stream, crlfDelay: Infinity })
    .on("line", (line) => out.write(`${clip(line)}\n`));
await new Promise((resolve) => child.on("close", resolve));
if (!fs.existsSync(report)) {
  console.error("vitest produced no JSON report.");
  process.exit(1);
}
const results = JSON.parse(fs.readFileSync(report, "utf8"));
const key = (file, name) => `${path.relative(root, file).replaceAll("\\", "/")} > ${name}`;
const failed = [];
for (const file of results.testResults) {
  if (file.status === "failed" && file.assertionResults.length === 0)
    failed.push(key(file.name, "(file failed to load)"));
  for (const test of file.assertionResults)
    // "pending" means the test started and never finished: its worker crashed (e.g. out of
    // memory). Vitest still reports success for it, so the gate counts it as a failure.
    if (test.status === "failed" || test.status === "pending")
      failed.push(key(file.name, test.fullName));
}
if (failed.length > 0) {
  console.error(`\n${failed.length} failing test(s):`);
  for (const id of failed) console.error(`  - ${id}`);
  process.exitCode = 1;
} else console.log(`\nTest gate passed: ${results.numPassedTests} tests, no failures.`);
