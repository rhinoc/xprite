import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";

import { parseEgoReport, printEgoNonReportLines } from "../../base/ego-report.mjs";
import { collectVisualSources } from "../base/audit-source-files.mjs";
import { runBrowserPayload, visualShardCount } from "../base/browser.mjs";
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
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (!["--port", "--space"].includes(args[index]) || !args[index + 1] || options.has(args[index]))
    throw Error(
      "Use --port PORT and optional --space ID; every startup continuity scene is required.",
    );
  options.set(args[index], args[index + 1]);
}
const port = Number(options.get("--port") ?? 5173);
const spaceId = options.has("--space")
  ? Number(options.get("--space"))
  : process.env.XPRITE_VISUAL_SPACE_ID === undefined
    ? undefined
    : Number(process.env.XPRITE_VISUAL_SPACE_ID);
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw Error("Invalid site port.");
if (spaceId !== undefined && (!Number.isInteger(spaceId) || spaceId <= 0))
  throw Error("Invalid task space.");
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
    "apps/components/src",
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
    "apps/components/index.html",
    "apps/components/vite.config.ts",
    "apps/tools/viewer/index.html",
    "apps/tools/gif-to-sprite-sheet/index.html",
    "apps/tools/animal-crossing-qr/index.html",
    "apps/tools/fuse-beads/index.html",
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
    spaceId,
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
  // Scenes are independent (each uses its own origin), so shards run in parallel browser contexts.
  const shardCount = visualShardCount(scenes.length);
  const shards = Array.from({ length: shardCount }, (_, shard) =>
    scenes.filter((_, index) => index % shardCount === shard),
  );
  const payload = fs.readFileSync(new URL("./capture.payload.mjs", import.meta.url), "utf8");
  const runs = await Promise.all(
    shards.map((subset) =>
      runBrowserPayload({
        payload,
        globals: { continuityConfig: { ...config, scenes: subset } },
        forward: /^CONTINUITY_(SPACE|SCENE):/,
      }),
    ),
  );
  for (const run of runs)
    printEgoNonReportLines(
      [...run.stdout.split("\n"), ...run.stderr.split("\n")].filter(
        (line) => !/^CONTINUITY_(SPACE|SCENE):/.test(line),
      ),
    );
  if (runs.some(({ status }) => status !== 0))
    throw Error("Startup continuity capture failed; push is blocked.");
  const report = {
    results: runs.flatMap((run) => parseEgoReport(run, "STARTUP_CONTINUITY_REPORT").report.results),
  };
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
