import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { findCheck } from "../../base/find-check.mjs";
const tests = [
  "prepare-aseprite-frame-oracle",
  {
    name: "verify-export-delivery",
    path: "scripts/e2e/integration/verify-export-delivery.mjs",
  },
  "verify-export-dialog-flow",
  "verify-mode-transforms",
  "verify-image-paste-editor",
  {
    name: "verify-aseprite-export-delivery",
    path: "scripts/e2e/aseprite-compatibility/verify-export-delivery.mjs",
  },
  "verify-export-dialog-geometry",
  "verify-editor-sheet-preview",
  "verify-animation-features",
  "verify-animation-playback",
  "verify-animation-preview-display",
  "verify-animation-settings-ui",
  "verify-onion-skin-range",
  "verify-feature-9-editor",
  "verify-aseprite-modes",
  "verify-aseprite-frames",
  "verify-aseprite-icc",
  "verify-index-editing",
  "verify-index-editor",
  "verify-indexed-raster-writer",
  "verify-profile-clipboard",
  "verify-history-budget",
  "verify-color-profile-paint",
  "verify-effects",
  "verify-effects-modes",
  "verify-effects-duplicate-indices",
  "verify-effects-document",
  "verify-editor-effects",
  "verify-assistance",
  "verify-assistance-tiled-grid",
  "verify-assistance-tools",
  "verify-assistance-editor",
  "verify-assistance-view",
  "verify-tiled-editor-frame",
  "verify-symmetry-handles",
  "verify-feature-shortcuts",
];
const root = ".tmp/features-7-12";
fs.mkdirSync(root + "/tests", { recursive: true });
const report = { startedAt: new Date().toISOString(), tests: [], passed: false };
for (const checkEntry of tests) {
  const name = typeof checkEntry === "string" ? checkEntry : checkEntry.name,
    check =
      typeof checkEntry === "string" ? findCheck(name) : { kind: "script", path: checkEntry.path };
  const start = Date.now(),
    r = spawnSync(
      check.kind === "vitest" ? "pnpm" : process.execPath,
      check.kind === "vitest" ? ["exec", "vitest", "run", check.path] : [check.path],
      {
        encoding: "utf8",
        maxBuffer: 5e6,
        timeout: 240000,
      },
    );
  const output = `${root}/tests/${name}.log`;
  fs.writeFileSync(output, (r.stdout ?? "") + (r.stderr ?? ""));
  report.tests.push({
    name,
    passed: r.status === 0 && !r.error,
    durationMs: Date.now() - start,
    output,
    error: r.error?.message,
  });
  console.log(name, r.status === 0 ? "PASS" : "FAIL");
  if (r.status || r.error) break;
}
report.passed = report.tests.length === tests.length && report.tests.every((t) => t.passed);
report.finishedAt = new Date().toISOString();
fs.writeFileSync(root + "/core-tests.json", JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
