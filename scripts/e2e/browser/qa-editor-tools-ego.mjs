import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
// Run the durable functional QA payload in an already-existing Ego task space.
// Usage: node scripts/e2e/browser/qa-editor-tools-ego.mjs EXISTING_SPACE_ID [PAGE_LABEL] [OUTPUT_JSON]
// The wrapper deliberately does not create, claim, take over, or finish a task space.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseEgoReport, printEgoNonReportLines } from "../../base/ego-report.mjs";

const spaceId = Number(process.argv[2]);
const page = process.argv[3] || "p1";
const output = process.argv[4] || ".tmp/qa-editor-tools-ego.json";
fs.mkdirSync(path.dirname(output), { recursive: true });
if (!Number.isInteger(spaceId) || spaceId <= 0) {
  throw new Error(
    "Usage: node scripts/e2e/browser/qa-editor-tools-ego.mjs EXISTING_SPACE_ID [PAGE_LABEL] [OUTPUT_JSON]",
  );
}

const root = fileURLToPath(new URL("../../..", import.meta.url));
const payload = fs.readFileSync(
  new URL("./qa-editor-tools-ego.payload.mjs", import.meta.url),
  "utf8",
);
const fixtureSourcePath = path.join(root, ".tmp/qa-fixtures/pixel.png");
const fixtureHash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(fixtureSourcePath))
  .digest("hex");
const sourceInventory = await import(
  path.join(root, "scripts/visual-audit/base/audit-source-files.mjs")
);
const sourceFiles = sourceInventory.collectVisualSources(root);
const sourceHashes = Object.fromEntries(
  sourceFiles.sort().map((file) => [
    file,
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, file)))
      .digest("hex"),
  ]),
);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aseprite-qa-"));
const fixturePath = path.join(tempRoot, "pixel.png");
fs.copyFileSync(fixtureSourcePath, fixturePath);
const outputPath = path.resolve(root, output);
const installed = path.join(os.homedir(), ".local/bin/ego-browser");
const cli = fs.existsSync(installed) ? installed : "ego-browser";
const input = `const qaConfig = ${JSON.stringify({
  spaceId,
  page,
  fixturePath,
  fixtureRelativePath: ".tmp/qa-fixtures/pixel.png",
  fixtureHash,
  sourceHashes,
  url: process.env.ASEPRITE_QA_URL || "http://127.0.0.1:5173/editor",
})};\n${payload}`;
const syntax = spawnSync(process.execPath, ["--input-type=module", "--check"], {
  input,
  encoding: "utf8",
});
if (syntax.status !== 0) {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  throw new Error(`Invalid composed Ego QA script: ${syntax.stderr || syntax.stdout}`);
}

let result;
try {
  result = spawnSync(cli, ["nodejs"], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 180_000,
    killSignal: "SIGTERM",
  });
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
if (result.error) throw result.error;
const reportStreams = { stdout: result.stdout || "", stderr: result.stderr || "" };
printEgoNonReportLines([
  ...reportStreams.stdout.split(/\r?\n/).filter(Boolean),
  ...reportStreams.stderr.split(/\r?\n/).filter(Boolean),
]);
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
const { report } = parseEgoReport(reportStreams, "QA_REPORT");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(
  `QA_REPORT:parsed results=${Array.isArray(report.results) ? report.results.length : "unknown"}`,
);
console.log(`QA_OUTPUT:${path.relative(root, outputPath)}`);
