import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";

import { parseEgoReport, printEgoNonReportLines } from "../../base/ego-report.mjs";
import { collectVisualSources } from "../base/audit-source-files.mjs";
import { installStartupMonitor } from "./monitor.mjs";
import {
  CPU_SLOWDOWN,
  MINIMUM_READY_FRAMES,
  READY_OBSERVATION_MILLISECONDS,
  STARTUP_TIMEOUT_MILLISECONDS,
  scenes,
} from "./scenes.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.join(root, ".tmp/startup-continuity");
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--port"))
  throw Error("Use optional --port PORT; every startup continuity scene is required.");
const port = Number(args[1] ?? 5173);
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw Error("Invalid site port.");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sourceHashes = () => {
  const files = new Set(collectVisualSources(root));
  const walk = (directory) => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.add(file);
    }
  };
  for (const directory of [
    "apps/growth/src",
    "apps/growth/build",
    "apps/gallery/src",
    "apps/tools/src",
    "apps/tools/build",
    "packages/site-shell/src",
    "infra",
    "scripts/visual-audit/startup-continuity",
  ])
    walk(directory);
  for (const file of [
    "apps/growth/showcase/index.html",
    "apps/growth/vite.config.ts",
    "apps/gallery/index.html",
    "apps/gallery/vite.config.ts",
    "apps/tools/index.html",
    "apps/tools/viewer/index.html",
    "apps/tools/gif-to-sprite-sheet/index.html",
    "apps/tools/animal-crossing-qr/index.html",
    "apps/tools/vite.config.ts",
    "scripts/visual-audit/tools-startup/scenes.mjs",
    "scripts/base/ego-report.mjs",
    "package.json",
    "pnpm-lock.yaml",
    ".husky/pre-push",
  ])
    files.add(file);
  return Object.fromEntries(
    [...files].sort().map((file) => [file, digest(fs.readFileSync(path.join(root, file)))]),
  );
};
const manifest = {
  schemaVersion: 1,
  runId: randomUUID(),
  capturedAt: new Date().toISOString(),
  captureComplete: false,
  passed: false,
  cpuSlowdown: CPU_SLOWDOWN,
  scenes: scenes.map(({ id }) => id),
  sourceHashes: {},
  results: [],
};
fs.mkdirSync(output, { recursive: true });
const reportPath = path.join(output, "report.json");
const save = () => fs.writeFileSync(reportPath, `${JSON.stringify(manifest, null, 2)}\n`);
save();
try {
  manifest.sourceHashes = sourceHashes();
  save();
  // Transpile only the existing geometry boundary for the pre-navigation probe.
  // It has no runtime imports; this does not build any app or load its modules.
  const geometry = await transform(
    fs.readFileSync(path.join(root, "packages/ui/src/base/utils/dom-geometry.ts"), "utf8"),
    { loader: "ts", format: "iife", globalName: "StartupGeometry" },
  );
  const config = {
    output,
    port,
    runId: manifest.runId,
    scenes,
    cpuSlowdown: CPU_SLOWDOWN,
    minimumReadyFrames: MINIMUM_READY_FRAMES,
    readyObservationMilliseconds: READY_OBSERVATION_MILLISECONDS,
    startupTimeoutMilliseconds: STARTUP_TIMEOUT_MILLISECONDS,
    geometrySource: geometry.code,
    monitorSource: installStartupMonitor.toString(),
    screenshotModule: new URL("../../base/screenshot.mjs", import.meta.url).href,
  };
  const installed = path.join(os.homedir(), ".local/bin/ego-browser");
  const streams = { stdout: "", stderr: "" };
  const status = await new Promise((resolve, reject) => {
    const child = spawn(fs.existsSync(installed) ? installed : "ego-browser", ["nodejs"], {
      timeout: 1200000,
    });
    const pending = { stdout: "", stderr: "" };
    for (const name of ["stdout", "stderr"]) {
      child[name].setEncoding("utf8");
      child[name].on("data", (chunk) => {
        streams[name] += chunk;
        pending[name] += chunk;
        const lines = pending[name].split("\n");
        pending[name] = lines.pop();
        for (const line of lines) if (/^CONTINUITY_(SPACE|SCENE):/.test(line)) console.log(line);
      });
    }
    child.on("error", reject);
    child.on("close", resolve);
    child.stdin.end(
      `const continuityConfig = ${JSON.stringify(config)};\n${fs.readFileSync(new URL("./capture.payload.mjs", import.meta.url), "utf8")}`,
    );
  });
  printEgoNonReportLines(
    [...streams.stdout.split("\n"), ...streams.stderr.split("\n")].filter(
      (line) => !/^CONTINUITY_(SPACE|SCENE):/.test(line),
    ),
  );
  if (status !== 0) throw Error("Startup continuity capture failed; push is blocked.");
  const { report } = parseEgoReport(streams, "STARTUP_CONTINUITY_REPORT");
  if (JSON.stringify(manifest.sourceHashes) !== JSON.stringify(sourceHashes()))
    throw Error("Sources changed during startup observation; push is blocked.");
  if (
    report.results?.length !== scenes.length ||
    new Set(report.results.map(({ id }) => id)).size !== scenes.length ||
    scenes.some(({ id }) => !report.results.some((result) => result.id === id))
  )
    throw Error("Every startup scene is required; incomplete observation blocks push.");
  manifest.results = report.results;
  manifest.captureComplete = true;
  manifest.passed = report.results.every(
    (result) =>
      result.passed &&
      result.staticScreenshot &&
      result.readyScreenshot &&
      result.observation?.complete &&
      result.observation.failures.length === 0 &&
      result.observation.regions.every(({ seen }) => seen),
  );
  save();
  console.log(`Startup continuity report: ${reportPath}`);
  if (!manifest.passed) {
    process.exitCode = 1;
    console.error(
      "Content disappeared, startup failed, or evidence is incomplete; push is blocked.",
    );
  }
} catch (error) {
  manifest.error = error instanceof Error ? error.message : String(error);
  save();
  throw error;
}
