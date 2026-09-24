import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const [space, page, url] = process.argv.slice(2);
if (!space || !page || !url) throw Error("Existing taskspace/page/disposable URL required");
const qaConfig = {
  space: Number(space),
  page,
  url,
  root: process.cwd(),
  output: path.resolve(".tmp/features-7-12/qa-editor.json"),
};
fs.mkdirSync(path.dirname(qaConfig.output), { recursive: true });
const r = spawnSync("ego-browser", ["nodejs"], {
  input:
    `const qaConfig=${JSON.stringify(qaConfig)};\n` +
    fs.readFileSync("scripts/e2e/browser/qa-features-7-12-editor-ego.mjs", "utf8"),
  encoding: "utf8",
  timeout: 180000,
  maxBuffer: 4e6,
});
process.stdout.write(r.stdout ?? "");
process.stderr.write(r.stderr ?? "");
if (r.error || r.status) throw r.error ?? Error("Browser feature workflow failed");
