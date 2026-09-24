import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseEgoReport, printEgoNonReportLines } from "../../base/ego-report.mjs";
import { collectVisualSources } from "../base/audit-source-files.mjs";
import {
  layouts,
  scenes,
  sceneIds,
  selectSceneIds,
  selectLanguages,
  languageDirectory,
} from "./scenes.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
const baseline = args.includes("--baseline");
const force = args.includes("--force");
const extend = args.includes("--extend");
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw Error(`Missing value for ${flag}.`);
  return args[index + 1];
};
const output = path.resolve(
  root,
  value("--output", baseline ? "scripts/visual-audit/baselines/xprite" : ".tmp/xprite-visual"),
);
const port = Number(value("--port", "5173"));
const spaceId = args.includes("--space") ? Number(value("--space")) : undefined;
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw Error("Invalid --port.");
if (spaceId !== undefined && (!Number.isInteger(spaceId) || spaceId <= 0))
  throw Error("Invalid --space.");
const selection = value("--scenes");
const languages = selectLanguages(value("--languages"));
if (extend && (!baseline || force)) throw Error("Use --baseline --extend without --force.");
const ids = selectSceneIds(selection);
const previous = new Map();
const selectedIds = {};
for (const language of languages) {
  const manifestPath = path.join(languageDirectory(output, language), "manifest.json");
  const exists = fs.existsSync(manifestPath);
  if (baseline && exists && !force && !extend)
    throw Error(`${language}: baseline already exists. Review changes before using --force.`);
  const retained =
    baseline && exists && (extend || (force && selection !== undefined))
      ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
      : null;
  previous.set(language, retained);
  selectedIds[language] =
    extend && retained ? ids.filter((id) => !retained.cases.some((entry) => entry.id === id)) : ids;
}
if (!Object.values(selectedIds).some((ids) => ids.length)) throw Error("No new scenes to capture.");
const catalogs = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(
      fs.readFileSync(path.join(root, `apps/editor/src/i18n/locales/${language}.json`), "utf8"),
    ),
  ]),
);
const sampleMetadata = fs.readFileSync(
  path.join(root, "apps/editor/assets/examples/xprite/xprite-project.ts"),
  "utf8",
);
const sampleNameMatch = sampleMetadata.match(/xpriteProjectName\s*=\s*("[^"\n]+")/);
if (!sampleNameMatch) throw Error("Cannot read the bundled example display name.");
const sampleName = JSON.parse(sampleNameMatch[1]);
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sources = () =>
  Object.fromEntries(
    collectVisualSources(root).map((file) => [
      file,
      digest(fs.readFileSync(path.join(root, file))),
    ]),
  );
const before = sources();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "xprite-visual-"));
try {
  const payload = fs.readFileSync(new URL("./capture.payload.mjs", import.meta.url), "utf8");
  const config = {
    output: temporary,
    port,
    spaceId,
    layouts,
    scenes,
    selectedIds,
    sampleName,
    languages,
    catalogs,
  };
  const installed = path.join(os.homedir(), ".local/bin/ego-browser");
  // macOS can suspend screenshot rendering when Ego Lite is not foreground.
  if (process.platform === "darwin") {
    const activation = spawnSync("open", ["-a", "ego lite"], { encoding: "utf8" });
    if (activation.status !== 0) throw Error(`Cannot activate Ego Lite: ${activation.stderr}`);
  }
  const streams = { stdout: "", stderr: "" };
  const status = await new Promise((resolve, reject) => {
    const child = spawn(fs.existsSync(installed) ? installed : "ego-browser", ["nodejs"], {
      timeout: 300000,
    });
    const pending = { stdout: "", stderr: "" };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const collect = (stream, chunk) => {
      streams[stream] += chunk;
      pending[stream] += chunk;
      const lines = pending[stream].split("\n");
      pending[stream] = lines.pop();
      for (const line of lines) if (/^CAPTURE_(SPACE|CASE):/.test(line)) console.log(line);
    };
    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.on("error", reject);
    child.on("close", resolve);
    child.stdin.end(`const captureConfig = ${JSON.stringify(config)};\n${payload}`);
  });
  printEgoNonReportLines(
    [...streams.stdout.split("\n"), ...streams.stderr.split("\n")].filter(
      (line) => line && !/^CAPTURE_(SPACE|CASE):/.test(line),
    ),
  );
  if (status !== 0) throw Error("Ego capture failed.");
  const { report } = parseEgoReport(streams, "XPRITE_CAPTURE_REPORT");
  const after = sources();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (file) => before[file] !== after[file],
    );
    throw Error(
      `Editor sources changed during capture: ${changed.join(", ")}. Run again after edits settle.`,
    );
  }
  const fixture = "apps/editor/assets/examples/xprite/xprite.ase";
  for (const language of languages) {
    const captured = report.cases.filter((entry) => entry.language === language);
    if (!captured.length) continue;
    const directory = languageDirectory(output, language);
    const manifestPath = path.join(directory, "manifest.json");
    const retainedManifest = previous.get(language);
    const manifest = {
      schemaVersion: 1,
      kind: baseline ? "xprite-baseline" : "xprite-candidate",
      capturedAt: new Date().toISOString(),
      captureMethod:
        "ego-browser raw PNG, DPR 1, isolated Vite HMR transport, no resize or masking",
      theme: "light",
      language,
      fixture: { file: fixture, sha256: digest(fs.readFileSync(path.join(root, fixture))) },
      sourceDigest: digest(JSON.stringify(before)),
      sourceHashes: before,
      gitRevision: spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).stdout.trim(),
      browser: report.browser,
      cases: captured,
    };
    const captureProvenance = {
      capturedAt: manifest.capturedAt,
      sourceDigest: manifest.sourceDigest,
      gitRevision: manifest.gitRevision,
      browser: report.browser,
      captureMethod: manifest.captureMethod,
    };
    manifest.cases = captured.map((entry) => ({ ...entry, capture: captureProvenance }));
    if (retainedManifest) {
      for (const key of ["schemaVersion", "theme", "language", "fixture", "browser"])
        if (JSON.stringify(retainedManifest[key]) !== JSON.stringify(manifest[key]))
          throw Error(`Cannot extend a baseline with a different ${key}.`);
      const replaced = new Set(captured.map(({ id }) => id));
      const retained = retainedManifest.cases
        .filter(({ id }) => !replaced.has(id))
        .map((entry) => ({
          ...entry,
          capture: entry.capture ?? {
            capturedAt: retainedManifest.capturedAt,
            sourceDigest: retainedManifest.sourceDigest,
            gitRevision: retainedManifest.gitRevision,
            browser: retainedManifest.browser,
          },
        }));
      manifest.cases = [...retained, ...manifest.cases].sort(
        (a, b) => sceneIds.indexOf(a.id) - sceneIds.indexOf(b.id),
      );
      manifest.sourceSnapshots = {
        ...retainedManifest.sourceSnapshots,
        [retainedManifest.sourceDigest]: retainedManifest.sourceHashes,
        [manifest.sourceDigest]: manifest.sourceHashes,
      };
    }
    fs.mkdirSync(directory, { recursive: true });
    for (const capture of captured) {
      const bytes = fs.readFileSync(path.join(temporary, language, capture.file));
      if (digest(bytes) !== capture.sha256) throw Error(`${capture.id}: capture hash mismatch.`);
      fs.writeFileSync(path.join(directory, capture.file), bytes);
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Saved ${captured.length} ${language} captures to ${directory}`);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
