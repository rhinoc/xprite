import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { sceneIds, selectSceneIds, selectLanguages, languageDirectory } from "./scenes.mjs";

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
  if (baseline.language !== language || candidate.language !== language)
    throw Error(`${language}: capture manifest has the wrong language.`);
  const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
  for (const manifest of [baseline, candidate]) {
    if (
      manifest.schemaVersion !== 1 ||
      new Set(manifest.cases.map(({ id }) => id)).size !== manifest.cases.length ||
      manifest.cases.some(({ id }) => !sceneIds.includes(id)) ||
      ids.some((id) => !manifest.cases.some((entry) => entry.id === id))
    )
      throw Error("Capture manifest must contain every selected canonical scene exactly once.");
  }
  for (const key of ["theme", "language", "fixture"])
    if (JSON.stringify(baseline[key]) !== JSON.stringify(candidate[key]))
      throw Error(`Capture contract changed: ${key}. Review and explicitly update the baseline.`);
  if (JSON.stringify(baseline.browser) !== JSON.stringify(candidate.browser))
    throw Error("Browser version/platform changed. Review captures before updating the baseline.");

  const results = ids.map((id) => {
    const expected = baseline.cases.find((entry) => entry.id === id),
      actual = candidate.cases.find((entry) => entry.id === id);
    for (const key of ["mode", "view", "viewport", "language", "frame", "zoom", "tooltip"])
      if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key]))
        throw Error(`${id}: capture state changed: ${key}.`);
    const readImage = (directory, entry) => {
      const bytes = fs.readFileSync(path.join(directory, entry.file));
      if (digest(bytes) !== entry.sha256)
        throw Error(`${id}: PNG does not match its capture manifest.`);
      const image = PNG.sync.read(bytes);
      if (image.width !== entry.viewport.width || image.height !== entry.viewport.height)
        throw Error(`${id}: raw PNG dimensions do not match the viewport.`);
      return image;
    };
    const reference = readImage(baselineDir, expected),
      image = readImage(candidateDir, actual);
    const score = ({ name, x, y, width, height }) => {
      if (
        ![x, y, width, height].every(Number.isInteger) ||
        x < 0 ||
        y < 0 ||
        width <= 0 ||
        height <= 0 ||
        x + width > image.width ||
        y + height > image.height
      )
        throw Error(`${id}: invalid area ${name}.`);
      let differentPixels = 0;
      for (let row = y; row < y + height; row++)
        for (let col = x; col < x + width; col++) {
          const offset = (row * image.width + col) * 4;
          if (
            [0, 1, 2, 3].some(
              (channel) => reference.data[offset + channel] !== image.data[offset + channel],
            )
          )
            differentPixels++;
        }
      return {
        name,
        x,
        y,
        width,
        height,
        differentPixels,
        totalPixels: width * height,
        same: differentPixels === 0,
      };
    };
    const full = score({
      name: "whole-window",
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
    const diff = new PNG({ width: image.width, height: image.height });
    pixelmatch(reference.data, image.data, diff.data, image.width, image.height, {
      threshold: 0,
      includeAA: true,
    });
    const diffFile = `${id}-diff.png`;
    fs.writeFileSync(path.join(candidateDir, diffFile), PNG.sync.write(diff));
    const geometrySame = JSON.stringify(expected.regions) === JSON.stringify(actual.regions);
    return {
      id,
      ...full,
      geometrySame,
      passed: full.same && geometrySame,
      regions: expected.regions.map(score),
      diffFile,
    };
  });
  const report = {
    passed: results.every(({ passed }) => passed),
    comparison: "exact decoded RGBA pixels; no tolerance, masks, or resizing",
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
