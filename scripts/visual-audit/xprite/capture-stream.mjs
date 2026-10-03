import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { COMPARISON_METHOD } from "./compare-case.mjs";
import { languageDirectory } from "./scenes.mjs";

const JSON_EXTENSION = ".json";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function writeAtomically(filename, bytes) {
  const pending = `${filename}.pending`;
  fs.writeFileSync(pending, bytes);
  fs.renameSync(pending, filename);
}

export function startCaptureStream({ root, output, temporary, languages, selectedIds, metadata }) {
  const worker = new Worker(new URL("./compare-worker.mjs", import.meta.url));
  const captured = new Map(languages.map((language) => [language, new Map()]));
  const results = new Map(languages.map((language) => [language, new Map()]));
  const seen = new Set();
  const waiting = new Set();
  const errors = [];
  const watchers = [];
  let complete = false;
  let workerFailed = false;
  let drained;

  const manifest = (language, browser) => ({
    ...metadata,
    language,
    browser,
    captureComplete: false,
    cases: [...captured.get(language).values()],
  });
  const writeProgress = () => {
    const reports = languages.map((language) => {
      const compared = selectedIds[language]
        .map((id) => results.get(language).get(id))
        .filter(Boolean);
      const finished =
        complete && compared.length === selectedIds[language].length && !errors.length;
      const report = {
        language,
        complete: finished,
        passed: finished && compared.every(({ passed }) => passed),
        comparison: COMPARISON_METHOD,
        expectedCases: selectedIds[language].length,
        capturedCases: captured.get(language).size,
        comparedCases: compared.length,
        results: compared,
      };
      writeAtomically(
        path.join(languageDirectory(output, language), "comparison.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      return report;
    });
    writeAtomically(
      path.join(output, "comparison-all.json"),
      `${JSON.stringify(
        {
          complete: reports.every((report) => report.complete),
          passed: reports.every((report) => report.passed),
          errors,
          languages: reports,
        },
        null,
        2,
      )}\n`,
    );
  };
  const scan = (language) => {
    const ready = path.join(temporary, "ready", language);
    for (const filename of fs.readdirSync(ready)) {
      if (!filename.endsWith(JSON_EXTENSION)) continue;
      const key = `${language}/${filename}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const { browser, entry } = JSON.parse(fs.readFileSync(path.join(ready, filename), "utf8"));
        if (
          !selectedIds[language].includes(entry.id) ||
          entry.language !== language ||
          entry.file !== `${entry.id}.png` ||
          filename !== `${entry.id}${JSON_EXTENSION}` ||
          captured.get(language).has(entry.id)
        )
          throw Error(`Unexpected capture: ${key}.`);
        const bytes = fs.readFileSync(path.join(temporary, language, entry.file));
        if (digest(bytes) !== entry.sha256) throw Error(`${key}: capture hash mismatch.`);
        const directory = languageDirectory(output, language);
        writeAtomically(path.join(directory, entry.file), bytes);
        captured.get(language).set(entry.id, {
          ...entry,
          capture: {
            capturedAt: new Date().toISOString(),
            sourceDigest: metadata.sourceDigest,
            gitRevision: metadata.gitRevision,
            browser,
            captureMethod: metadata.captureMethod,
          },
        });
        const candidate = manifest(language, browser);
        writeAtomically(
          path.join(directory, "manifest.json"),
          `${JSON.stringify(candidate, null, 2)}\n`,
        );
        console.log(`CAPTURE_CASE:${language}/${entry.id}`);
        if (!workerFailed) {
          waiting.add(`${language}/${entry.id}`);
          worker.postMessage({
            baselineDir: languageDirectory(
              path.join(root, "scripts/visual-audit/baselines/xprite"),
              language,
            ),
            candidateDir: directory,
            candidate,
            id: entry.id,
            language,
          });
        }
        writeProgress();
      } catch (error) {
        errors.push(error.message);
        console.error(error.message);
      }
    }
  };
  worker.on("message", (result) => {
    results.get(result.language).set(result.id, result);
    waiting.delete(`${result.language}/${result.id}`);
    console.log(
      `COMPARE_CASE:${result.language}/${result.id}: ` +
        (result.error
          ? result.error
          : `${result.differentPixels}/${result.totalPixels} pixels differ; geometry ${result.geometrySame ? "same" : "changed"}`),
    );
    writeProgress();
    if (!waiting.size) drained?.();
  });
  worker.on("error", (error) => {
    workerFailed = true;
    errors.push(error.message);
    waiting.clear();
    writeProgress();
    drained?.();
  });
  for (const language of languages) {
    const ready = path.join(temporary, "ready", language);
    fs.mkdirSync(ready, { recursive: true });
    fs.mkdirSync(languageDirectory(output, language), { recursive: true });
    writeAtomically(
      path.join(languageDirectory(output, language), "manifest.json"),
      `${JSON.stringify(manifest(language, null), null, 2)}\n`,
    );
    watchers.push(fs.watch(ready, () => scan(language)));
  }
  writeProgress();
  return {
    assertCaptured(entries) {
      for (const language of languages) scan(language);
      if (errors.length) throw Error(errors.join("\n"));
      for (const language of languages) {
        const expected = entries.filter((entry) => entry.language === language);
        if (
          expected.length !== selectedIds[language].length ||
          captured.get(language).size !== expected.length ||
          expected.some((entry) => captured.get(language).get(entry.id)?.sha256 !== entry.sha256)
        )
          throw Error(
            `${language}: streaming capture is incomplete or does not match the final report.`,
          );
      }
    },
    complete() {
      complete = true;
    },
    async close() {
      for (const watcher of watchers) watcher.close();
      for (const language of languages) scan(language);
      if (waiting.size) await new Promise((resolve) => (drained = resolve));
      await worker.terminate();
      writeProgress();
      if (errors.length) throw Error(errors.join("\n"));
    },
  };
}
