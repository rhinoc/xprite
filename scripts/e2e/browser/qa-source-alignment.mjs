import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";

import { collectVisualSources } from "../../visual-audit/base/audit-source-files.mjs";
const inventory = () =>
  Object.fromEntries(
    collectVisualSources().map((p) => [
      p,
      crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
    ]),
  );
const spaceId = Number(process.argv[2]),
  pageLabel = process.argv[3] || "p2";
if (!Number.isInteger(spaceId) || spaceId <= 0)
  throw Error(
    "Usage: node scripts/e2e/browser/qa-source-alignment.mjs EXISTING_SPACE_ID [PAGE_LABEL]",
  );
const captureConfig = { spaceId, pageLabel };
const before = inventory();
const result = spawnSync("ego-browser", ["nodejs"], {
  input:
    `const captureConfig=${JSON.stringify(captureConfig)};\n` +
    fs.readFileSync("scripts/e2e/browser/qa-source-alignment-ego.mjs", "utf8"),
  encoding: "utf8",
  timeout: 180000,
  maxBuffer: 4 * 1024 * 1024,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error || result.status !== 0) throw result.error ?? Error("Alignment browser QA failed");

const after = inventory();
if (JSON.stringify(before) !== JSON.stringify(after))
  throw Error("Source changed during browser QA");
const path = ".tmp/alignment-browser-qa.json",
  report = JSON.parse(fs.readFileSync(path));
report.sourceHashesBefore = before;
report.sourceHashesAfter = after;
fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
