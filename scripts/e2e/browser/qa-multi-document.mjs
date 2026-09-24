import { spawnSync } from "node:child_process";
import fs from "node:fs";
const spaceId = Number(process.argv[2]),
  pageLabel = process.argv[3];
if (
  !Number.isInteger(spaceId) ||
  spaceId < 1 ||
  !pageLabel ||
  process.argv[4] !== "--disposable-page"
)
  throw Error(
    "Usage: node scripts/e2e/browser/qa-multi-document.mjs EXISTING_SPACE_ID PAGE_LABEL --disposable-page [URL]. Root owns browser; do not run against user documents.",
  );
const captureConfig = { spaceId, pageLabel, root: process.cwd(), url: process.argv[5] };
const result = spawnSync("ego-browser", ["nodejs"], {
  input:
    `const captureConfig=${JSON.stringify(captureConfig)};\n` +
    fs.readFileSync("scripts/e2e/browser/qa-multi-document-ego.mjs", "utf8"),
  encoding: "utf8",
  timeout: 180000,
  maxBuffer: 4 * 1024 * 1024,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error || result.status !== 0)
  throw result.error ?? Error("Multi-document browser QA failed");
