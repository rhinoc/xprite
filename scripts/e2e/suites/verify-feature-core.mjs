import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { findCheck } from "../../base/find-check.mjs";
const tests = [
  "verify-clipboard",
  "verify-selection-operations",
  "verify-selection-oracle",
  "verify-selection-modifiers",
  "verify-editor-selection-shapes",
  "verify-selection-command-review",
  "verify-document-size",
  "verify-editor-document-size",
  "verify-size-oracle",
  "verify-document-workspace",
  "verify-layer-operations",
  "verify-layer-conversion-guards",
  "verify-layer-editor-integration",
  "verify-reference-viewport",
  "verify-compose-groups",
  "verify-shape-tools",
  "verify-gradient-oracle",
  "verify-selection-edges",
  "verify-selection-history",
  "verify-editor-selection-edges",
  "verify-selection-dialog-owner",
  "verify-document-dialog-target",
];
fs.mkdirSync(".tmp/features-1-6/tests", { recursive: true });
const report = { startedAt: new Date().toISOString(), tests: [], passed: false };
for (const name of tests) {
  const start = Date.now(),
    check = findCheck(name),
    r = spawnSync(
      check.kind === "vitest" ? "pnpm" : process.execPath,
      check.kind === "vitest" ? ["exec", "vitest", "run", check.path] : [check.path],
      {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 180000,
      },
    );
  const output = `.tmp/features-1-6/tests/${name}.log`;
  fs.writeFileSync(output, (r.stdout ?? "") + (r.stderr ?? ""));
  report.tests.push({
    name,
    passed: r.status === 0 && !r.error,
    durationMs: Date.now() - start,
    output,
    error: r.error?.message,
  });
  console.log(name, r.status === 0 ? "PASS" : "FAIL");
  if (r.status !== 0 || r.error) break;
}
report.passed = report.tests.length === tests.length && report.tests.every((t) => t.passed);
report.finishedAt = new Date().toISOString();
fs.writeFileSync(".tmp/features-1-6/core-tests.json", JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
