import fs from "node:fs";
import path from "node:path";
import { parentPort } from "node:worker_threads";

import { assertCaptureContract, compareCase } from "./compare-case.mjs";

const baselines = new Map();

parentPort.on("message", ({ baselineDir, candidateDir, candidate, id, language }) => {
  try {
    if (!baselines.has(baselineDir))
      baselines.set(
        baselineDir,
        JSON.parse(fs.readFileSync(path.join(baselineDir, "manifest.json"), "utf8")),
      );
    const baseline = baselines.get(baselineDir);
    assertCaptureContract(baseline, candidate, language, [id]);
    const result = compareCase(baseline, candidate, baselineDir, candidateDir, id);
    parentPort.postMessage({ language, id, ...result });
  } catch (error) {
    parentPort.postMessage({ language, id, passed: false, error: error.message });
  }
});
