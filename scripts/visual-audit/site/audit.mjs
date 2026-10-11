import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";

import { parseEgoReport } from "../../base/ego-report.mjs";
import { assertCompleteCapture, compareSiteCase, readSiteImage } from "./compare.mjs";
import { writeSiteReview } from "./report.mjs";
import { scenes } from "./scenes.mjs";
import { siteSourceHashes, digest } from "./sources.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.join(root, ".tmp/site-visual");
const baseline = path.join(root, "scripts/visual-audit/baselines/site");
const [mode, ...args] = process.argv.slice(2);
if (!["capture", "compare"].includes(mode))
  throw Error("Use capture or compare; baseline changes require explicit review and approval.");
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (!["--port", "--space"].includes(args[index]) || !args[index + 1] || options.has(args[index]))
    throw Error("Only --port and --space are supported; every scene is required.");
  options.set(args[index], args[index + 1]);
}
const write = (file, value) =>
  fs.writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + "\n");
fs.mkdirSync(output, { recursive: true });

if (mode === "capture") {
  const port = Number(options.get("--port") ?? "5173");
  const spaceId = options.has("--space") ? Number(options.get("--space")) : undefined;
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (spaceId !== undefined && (!Number.isInteger(spaceId) || spaceId < 1))
  )
    throw Error("Invalid capture port or space.");
  const sourceHashes = siteSourceHashes(root);
  const manifest = {
    schemaVersion: 1,
    runId: randomUUID(),
    capturedAt: new Date().toISOString(),
    captureComplete: false,
    sourceHashes,
    sourceDigest: digest(JSON.stringify(sourceHashes)),
    scenes: scenes.map(({ id }) => id),
    cases: [],
  };
  write("manifest.json", manifest);
  try {
    const geometry = await transform(
      fs.readFileSync(path.join(root, "packages/ui/src/base/utils/dom-geometry.ts"), "utf8"),
      { loader: "ts", format: "iife", globalName: "SiteGeometry" },
    );
    const config = {
      output,
      port,
      spaceId,
      runId: manifest.runId,
      scenes,
      timeout: 60000,
      geometrySource: geometry.code,
      screenshotModule: new URL("../../base/screenshot.mjs", import.meta.url).href,
    };
    const payload = fs.readFileSync(new URL("./capture.payload.mjs", import.meta.url), "utf8");
    const streams = { stdout: "", stderr: "" };
    const installed = path.join(os.homedir(), ".local/bin/ego-browser");
    const status = await new Promise((resolve, reject) => {
      const child = spawn(fs.existsSync(installed) ? installed : "ego-browser", ["nodejs"], {
        timeout: 1800000,
      });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      for (const name of ["stdout", "stderr"])
        child[name].on("data", (chunk) => {
          streams[name] += chunk;
          for (const line of chunk.split("\n"))
            if (line.startsWith("SITE_CAPTURE_SPACE:") || line.startsWith("SITE_CAPTURE_SCENE:"))
              process.stdout.write(line + "\n");
        });
      child.on("error", reject);
      const interrupt = () => child.kill("SIGTERM");
      process.once("SIGINT", interrupt);
      process.once("SIGTERM", interrupt);
      child.on("close", (status) => {
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", interrupt);
        resolve(status);
      });
      child.stdin.end(`const siteConfig=${JSON.stringify(config)};\n${payload}`);
    });
    if (status !== 0) throw Error(`Growth/tools capture failed: ${streams.stderr.slice(-4000)}`);
    const { report } = parseEgoReport(streams, "SITE_CAPTURE_REPORT");
    if (JSON.stringify(sourceHashes) !== JSON.stringify(siteSourceHashes(root)))
      throw Error("Sources changed during capture; pushing is blocked.");
    Object.assign(manifest, {
      browser: report.browser,
      cases: report.cases,
      captureComplete: true,
    });
    assertCompleteCapture(manifest, scenes);
    for (const scene of scenes)
      readSiteImage(
        output,
        scene,
        manifest.cases.find((entry) => entry.id === scene.id),
      );
    write("manifest.json", manifest);
    writeSiteReview(output, manifest);
    console.log(`Captured ${scenes.length} canonical growth/tools scenes. Candidates: ${output}`);
  } catch (error) {
    manifest.captureComplete = false;
    manifest.error = String(error);
    manifest.cases = scenes.flatMap((scene) => {
      const file = path.join(output, `${scene.id}.json`);
      if (!fs.existsSync(file)) return [];
      const entry = JSON.parse(fs.readFileSync(file, "utf8"));
      return entry.runId === manifest.runId ? [entry] : [];
    });
    write("manifest.json", manifest);
    writeSiteReview(output, manifest);
    throw error;
  }
} else {
  const current = JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8"));
  assertCompleteCapture(current, scenes);
  for (const scene of scenes)
    readSiteImage(
      output,
      scene,
      current.cases.find((entry) => entry.id === scene.id),
    );
  if (current.sourceDigest !== digest(JSON.stringify(siteSourceHashes(root))))
    throw Error("Candidate screenshots are stale; recapture the current sources.");
  const baselineFile = path.join(baseline, "manifest.json");
  if (!fs.existsSync(baselineFile))
    throw Error(
      `Growth/tools baseline is missing. Review candidates in ${output} and approve an initial baseline before pushing. No baseline is created automatically.`,
    );
  const reference = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  assertCompleteCapture(reference, scenes);
  if (JSON.stringify(reference.browser) !== JSON.stringify(current.browser))
    throw Error("Browser version changed; review screenshots before approving a baseline change.");
  const results = scenes.map((scene) =>
    compareSiteCase(
      scene,
      reference.cases.find((entry) => entry.id === scene.id),
      current.cases.find((entry) => entry.id === scene.id),
      baseline,
      output,
    ),
  );
  const report = {
    passed: results.every(({ passed }) => passed),
    minimumSimilarity: 0.99,
    geometryMustMatch: true,
    results,
  };
  write("comparison.json", report);
  for (const result of results)
    console.log(
      `${result.id}: ${(result.similarity * 100).toFixed(3)}%; geometry ${result.geometrySame ? "same" : "changed"}`,
    );
  if (!report.passed) process.exitCode = 1;
}
