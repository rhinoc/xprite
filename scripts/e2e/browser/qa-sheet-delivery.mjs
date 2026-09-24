import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { collectVisualSources } from "../../visual-audit/base/audit-source-files.mjs";
const space = Number(process.argv[2]),
  page = process.argv[3],
  url = process.argv[4];
if (!Number.isInteger(space) || space < 1 || !page)
  throw Error(
    "Usage: node scripts/e2e/browser/qa-sheet-delivery.mjs EXISTING_SPACE PAGE [TASK_OWNED_URL]",
  );
const root = process.cwd(),
  output = path.join(root, ".tmp/features-7-12/qa-sheet-delivery.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
const inventory = () =>
  Object.fromEntries(
    collectVisualSources().map((file) => [
      file,
      crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    ]),
  );
const before = inventory();
const qaConfig = {
  space,
  page,
  root,
  output,
  ...(url ? { url } : {}),
  screenshotPrefix: path.join(root, ".tmp/features-7-12/qa-sheet-delivery"),
};
const run = spawnSync("ego-browser", ["nodejs"], {
  input:
    `const qaConfig=${JSON.stringify(qaConfig)};\n` +
    fs.readFileSync("scripts/e2e/browser/qa-sheet-delivery-ego.mjs", "utf8"),
  encoding: "utf8",
  timeout: 180000,
  maxBuffer: 4 * 1024 * 1024,
});
process.stdout.write(run.stdout ?? "");
process.stderr.write(run.stderr ?? "");
const after = inventory();
if (fs.existsSync(output)) {
  const report = JSON.parse(fs.readFileSync(output));
  report.sourceHashesBefore = before;
  report.sourceHashesAfter = after;
  report.sourcesUnchanged = JSON.stringify(before) === JSON.stringify(after);
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
}
if (run.error || run.status !== 0)
  throw run.error ?? Error("Sheet delivery browser QA failed; inspect its report and current page");
if (JSON.stringify(before) !== JSON.stringify(after))
  throw Error("Source changed during Sheet QA; rerun against a stable build");
