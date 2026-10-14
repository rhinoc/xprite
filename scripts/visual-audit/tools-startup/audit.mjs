import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";

import { parseEgoReport, printEgoNonReportLines } from "../../base/ego-report.mjs";
import { collectVisualSources } from "../base/audit-source-files.mjs";
import { runBrowserPayload, visualShardCount } from "../base/browser.mjs";
import { generateImageReport } from "../report.mjs";
import { installStartupMonitor } from "../startup-continuity/monitor.mjs";
import {
  CPU_SLOWDOWN,
  MINIMUM_READY_FRAMES,
  READY_OBSERVATION_MILLISECONDS,
  STARTUP_TIMEOUT_MILLISECONDS,
} from "../startup-continuity/scenes.mjs";
import { compareStartupPair } from "./compare.mjs";
import { MINIMUM_SIMILARITY, PIXELMATCH_THRESHOLD, scenes } from "./scenes.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.join(root, ".tmp/tools-startup-visual");
const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (!["--port", "--space"].includes(args[index]) || !args[index + 1] || options.has(args[index]))
    throw Error("Use --port PORT and optional --space ID; all startup scenes are required.");
  options.set(args[index], args[index + 1]);
}
const port = Number(options.get("--port") ?? "5173");
const spaceId = options.has("--space")
  ? Number(options.get("--space"))
  : process.env.XPRITE_VISUAL_SPACE_ID === undefined
    ? undefined
    : Number(process.env.XPRITE_VISUAL_SPACE_ID);
if (!Number.isInteger(port) || port <= 0 || port > 65535)
  throw Error("Invalid tools startup port.");
if (spaceId !== undefined && (!Number.isInteger(spaceId) || spaceId <= 0))
  throw Error("Invalid task space.");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sources = () => {
  const files = new Set(collectVisualSources(root));
  const walk = (directory) => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const name = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(name);
      else files.add(name);
    }
  };
  for (const directory of [
    "apps/tools/src",
    "apps/tools/build",
    "apps/growth/src",
    "apps/growth/build",
    "apps/growth/content/about",
    "apps/growth/content/tools",
    "apps/growth/public/showcase/ipad/hello",
    "apps/growth/public/showcase/textures",
    "packages/editor-ui/src",
    "packages/site-shell/src",
    "infra",
    "scripts/visual-audit/startup-continuity",
    "scripts/visual-audit/tools-startup",
  ])
    walk(directory);
  for (const file of [
    "apps/tools/viewer/index.html",
    "apps/tools/gif-to-sprite-sheet/index.html",
    "apps/tools/animal-crossing-qr/index.html",
    "apps/tools/fuse-beads/index.html",
    "apps/tools/vite.config.ts",
    "apps/tools/package.json",
    "apps/growth/public/favicon-32.png",
    "apps/growth/public/social-preview.png",
    "apps/growth/public/package.json",
    "infra/package-local-aliases.ts",
    "infra/package-import-scopes.json",
    "pnpm-lock.yaml",
  ])
    files.add(file);
  return Object.fromEntries(
    [...files].sort().map((file) => [file, digest(fs.readFileSync(path.join(root, file)))]),
  );
};
fs.mkdirSync(output, { recursive: true });
const manifest = {
  schemaVersion: 1,
  runId: randomUUID(),
  capturedAt: new Date().toISOString(),
  captureComplete: false,
  passed: false,
  minimumSimilarity: MINIMUM_SIMILARITY,
  pixelmatchThreshold: PIXELMATCH_THRESHOLD,
  includeAA: true,
  sourceHashes: {},
  sourceDigest: null,
  scenes: scenes.map(({ id }) => id),
  results: [],
};
const reportPath = path.join(output, "comparison.json");
const save = () => fs.writeFileSync(reportPath, `${JSON.stringify(manifest, null, 2)}\n`);
save();
try {
  const sourceHashes = sources();
  manifest.sourceHashes = sourceHashes;
  manifest.sourceDigest = digest(JSON.stringify(sourceHashes));
  save();
  const payload = fs.readFileSync(new URL("./capture.payload.mjs", import.meta.url), "utf8");
  const geometry = await transform(
    fs.readFileSync(path.join(root, "packages/ui/src/base/utils/dom-geometry.ts"), "utf8"),
    { loader: "ts", format: "iife", globalName: "StartupGeometry" },
  );
  const config = {
    output,
    port,
    spaceId,
    scenes,
    cpuSlowdown: CPU_SLOWDOWN,
    minimumReadyFrames: MINIMUM_READY_FRAMES,
    readyObservationMilliseconds: READY_OBSERVATION_MILLISECONDS,
    startupTimeoutMilliseconds: STARTUP_TIMEOUT_MILLISECONDS,
    geometrySource: geometry.code,
    monitorSource: installStartupMonitor.toString(),
    screenshotModule: new URL("../../base/screenshot.mjs", import.meta.url).href,
  };
  // Scenes are independent (each uses its own origin), so shards run in parallel browser pages.
  const shardCount = visualShardCount(scenes.length);
  const shards = Array.from({ length: shardCount }, (_, shard) =>
    scenes.filter((_, index) => index % shardCount === shard),
  );
  const runs = await Promise.all(
    shards.map((subset) =>
      runBrowserPayload({
        payload,
        globals: { captureConfig: { ...config, scenes: subset } },
        forward: /^CAPTURE_(SPACE|PAIR):/,
      }),
    ),
  );
  const streams = {
    stdout: runs.map((run) => run.stdout).join("\n"),
    stderr: runs.map((run) => run.stderr).join("\n"),
  };
  const status = runs.some((run) => run.status !== 0) ? 1 : 0;
  printEgoNonReportLines(
    [...streams.stdout.split("\n"), ...streams.stderr.split("\n")].filter(
      (line) => !/^CAPTURE_(SPACE|PAIR):/.test(line),
    ),
  );
  if (status !== 0) {
    manifest.captureError = [...streams.stdout.split("\n"), ...streams.stderr.split("\n")].find(
      (line) => line.startsWith("Error:"),
    );
    throw Error("SSG/ready screenshot capture failed; push is blocked.");
  }
  const report = {
    pairs: runs.flatMap((run) => parseEgoReport(run, "TOOLS_STARTUP_REPORT").report.pairs ?? []),
  };
  if (JSON.stringify(sourceHashes) !== JSON.stringify(sources()))
    throw Error("Sources changed during startup capture; push is blocked.");
  if (
    report.pairs?.length !== scenes.length ||
    new Set(report.pairs.map(({ id }) => id)).size !== scenes.length ||
    scenes.some(({ id }) => !report.pairs.some((pair) => pair.id === id))
  )
    throw Error("Every SSG/ready pair is required; partial capture cannot pass.");
  for (const scene of scenes) {
    const pair = report.pairs.find(({ id }) => id === scene.id);
    const observation = pair.ready?.observation;
    const expectedRegions = ["page", "navigation", "main"];
    if (
      !observation?.complete ||
      observation.failures?.length !== 0 ||
      JSON.stringify(observation.regions?.map(({ name }) => name)) !==
        JSON.stringify(expectedRegions) ||
      !observation.regions.every(({ seen }) => seen)
    )
      throw Error(`${scene.id}: startup continuity failed or evidence is incomplete.`);
    const result = compareStartupPair(output, scene, pair);
    result.observation = observation;
    manifest.results.push(result);
    save();
    console.log(
      `${scene.id}: ${(result.similarity * 100).toFixed(3)}% similarity; geometry ${result.geometrySame ? "same" : "changed"}`,
    );
  }
  if (JSON.stringify(sourceHashes) !== JSON.stringify(sources()))
    throw Error("Sources changed during startup comparison; push is blocked.");
  manifest.captureComplete = true;
  manifest.passed = manifest.results.every(({ passed }) => passed);
  save();
  console.log(`SSG/ready report: ${reportPath}`);
  if (!manifest.passed) {
    console.error(
      "SSG/ready first paint must match every decoded RGBA pixel with unchanged geometry. Review screenshots and diffs before any push or publication.",
    );
    process.exitCode = 1;
  }
} catch (error) {
  manifest.error = error instanceof Error ? error.message : String(error);
  save();
  throw error;
} finally {
  generateImageReport();
}
