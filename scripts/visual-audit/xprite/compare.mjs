import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertCaptureContract, compareCase, COMPARISON_METHOD } from "./compare-case.mjs";
import { selectSceneIds, selectLanguages, languageDirectory } from "./scenes.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
const takeOption = (flag) => {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const selected = args[index + 1];
  if (!selected || selected.startsWith("--")) throw Error(`Missing value for ${flag}.`);
  args.splice(index, 2);
  return selected;
};
const ids = selectSceneIds(takeOption("--scenes"));
const languages = selectLanguages(takeOption("--languages"));
const [
  baselineArgument = "scripts/visual-audit/baselines/xprite",
  candidateArgument = ".tmp/xprite-visual",
] = args;
const baselineRoot = path.resolve(root, baselineArgument);
const candidateRoot = path.resolve(root, candidateArgument);
const summaries = [];
for (const language of languages) {
  const baselineDir = languageDirectory(baselineRoot, language);
  const candidateDir = languageDirectory(candidateRoot, language);
  if (baselineDir === candidateDir) throw Error("Capture a separate candidate before comparing.");
  const readManifest = (directory) =>
    JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  const baseline = readManifest(baselineDir),
    candidate = readManifest(candidateDir);
  if (candidate.captureComplete !== true)
    throw Error(
      `${language}: capture is incomplete or failed; partial comparisons cannot pass the gate.`,
    );
  assertCaptureContract(baseline, candidate, language, ids);
  const results = ids.map((id) => compareCase(baseline, candidate, baselineDir, candidateDir, id));
  const report = {
    passed: results.every(({ passed }) => passed),
    comparison: COMPARISON_METHOD,
    results,
  };
  fs.writeFileSync(
    path.join(candidateDir, "comparison.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  for (const result of results)
    console.log(
      `${language}/${result.id}: ${result.differentPixels}/${result.totalPixels} pixels differ; geometry ${result.geometrySame ? "same" : "changed"}`,
    );
  console.log(`Report: ${path.join(candidateDir, "comparison.json")}`);
  summaries.push({ language, ...report });
}
fs.writeFileSync(
  path.join(candidateRoot, "comparison-all.json"),
  `${JSON.stringify(
    {
      passed: summaries.every(({ passed }) => passed),
      languages: summaries,
    },
    null,
    2,
  )}\n`,
);
process.exitCode = summaries.every(({ passed }) => passed) ? 0 : 1;
