// CI test gate: runs the whole vitest suite and fails on any failure that is not listed in
// infra/known-test-failures.json. Listed failures already fail on main; each entry names its file
// and test so it can be fixed and removed. A listed test that now passes also fails the gate, so
// the list only ever shrinks.
//
//   node scripts/check/run-tests.mjs          (pnpm run test:ci)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const knownFile = path.join(root, "infra/known-test-failures.json");
const known = JSON.parse(fs.readFileSync(knownFile, "utf8"));
const report = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "xprite-tests-")), "vitest.json");
const vitest = path.join(
  root,
  "node_modules/.bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
spawnSync(
  vitest,
  [
    "run",
    "--config",
    "infra/vitest.config.ts",
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${report}`,
  ],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
if (!fs.existsSync(report)) {
  console.error("vitest produced no JSON report.");
  process.exit(1);
}
const results = JSON.parse(fs.readFileSync(report, "utf8"));
const key = (file, name) => `${path.relative(root, file).replaceAll("\\", "/")} > ${name}`;
const failed = new Set();
const passed = new Set();
for (const file of results.testResults) {
  if (file.status === "failed" && file.assertionResults.length === 0)
    failed.add(key(file.name, "(file failed to load)"));
  for (const test of file.assertionResults) {
    const id = key(file.name, test.fullName);
    if (test.status === "failed") failed.add(id);
    else if (test.status === "passed") passed.add(id);
  }
}
const knownSet = new Set(known.failures);
const unexpected = [...failed].filter((id) => !knownSet.has(id));
const fixed = known.failures.filter((id) => passed.has(id));
if (unexpected.length > 0) {
  console.error(`\n${unexpected.length} unexpected test failure(s):`);
  for (const id of unexpected) console.error(`  - ${id}`);
}
if (fixed.length > 0) {
  console.error(
    `\n${fixed.length} known failure(s) now pass; remove them from infra/known-test-failures.json:`,
  );
  for (const id of fixed) console.error(`  - ${id}`);
}
const stillKnown = known.failures.filter((id) => failed.has(id)).length;
if (unexpected.length > 0 || fixed.length > 0) process.exitCode = 1;
else
  console.log(
    `\nTest gate passed: no new failures (${stillKnown} known pre-existing failure(s) listed in infra/known-test-failures.json).`,
  );
